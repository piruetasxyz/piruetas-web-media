#!/usr/bin/env node
/* Genera la imagen de los proyectos de software (bibliotecas): un
   treemap de la estructura de archivos de su repositorio de GitHub.
   Cada archivo es un rectángulo con área proporcional a su tamaño en
   bytes, cada carpeta un marco que agrupa a sus archivos, y el color
   dice qué tipo de archivo es (con una leyenda arriba). Los archivos y
   carpetas llevan su nombre cuando cabe. Es un retrato del repo, que
   cambia a medida que el código crece.

   El texto va como <text> con Necto Mono y monospace de respaldo: en
   un <img> el navegador no carga la fuente web, así que ahí se ve en
   la monospace del sistema.

   Por cada <proyecto>/arbol/<nombre>.yaml dibuja <proyecto>/svg/<nombre>.svg.
   El .yaml tiene una sola línea:
     repositorio: 'piruetasxyz/Boton'

   Sin dependencias: usa fetch de Node 20 y la API de GitHub (un pedido
   por repositorio). Si existe GITHUB_TOKEN lo usa, para no chocar con
   el límite de pedidos sin autenticar.

   Uso: node scripts/generar-arboles.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

const ANCHO = 1200;
const ALTO = 800;
const MARGEN = 24;
const ALTO_CABECERA = 64;
const RELLENO_CARPETA = 6;
const RELLENO_NOMBRE_CARPETA = 22;
const LINEA = 1.5;
const FUENTE = "'Necto Mono', ui-monospace, Menlo, monospace";
// ancho de un caracter de la monospace, en proporción al tamaño
const ANCHO_CARACTER = 0.62;

// los colores del sitio (css/style.css de piruetasxyz.github.io)
const COLORES = {
  codigo: 'orange',
  ejemplo: 'skyblue',
  texto: 'pink',
  configuracion: 'greenyellow',
};
const LEYENDA = [
  ['codigo', 'código'],
  ['ejemplo', 'ejemplos'],
  ['texto', 'texto'],
  ['configuracion', 'configuración'],
];

function tipoDeArchivo(ruta) {
  const nombre = path.basename(ruta);
  if (ruta.startsWith('examples/') || /^pico\/ej[^/]+\//.test(ruta)) return 'ejemplo';
  if (/\.(h|hpp|c|cpp|ino)$/.test(nombre)) return 'codigo';
  if (nombre === 'CMakeLists.txt') return 'configuracion';
  if (/\.(md|dox|txt|html)$/.test(nombre) || nombre === 'LICENSE') return 'texto';
  return 'configuracion';
}

function leerRepositorio(rutaYaml) {
  const m = /^repositorio:\s*['"]?([\w.-]+\/[\w.-]+)['"]?\s*$/m.exec(fs.readFileSync(rutaYaml, 'utf8'));
  if (!m) throw new Error(`${rutaYaml}: falta "repositorio: 'usuario/repo'"`);
  return m[1];
}

async function pedirArbol(repositorio) {
  const cabeceras = { Accept: 'application/vnd.github+json', 'User-Agent': 'piruetas-web-media' };
  if (process.env.GITHUB_TOKEN) cabeceras.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const respuesta = await fetch(`https://api.github.com/repos/${repositorio}/git/trees/HEAD?recursive=1`, {
    headers: cabeceras,
  });
  if (!respuesta.ok) throw new Error(`${repositorio}: la API de GitHub respondió ${respuesta.status}`);
  const datos = await respuesta.json();
  if (datos.truncated) console.warn(`  ${repositorio}: árbol truncado por la API, faltan archivos`);
  return datos.tree.filter((n) => n.type === 'blob');
}

/* Arma el árbol de carpetas a partir de la lista plana de archivos;
   el tamaño de cada carpeta es la suma de lo que contiene. */
function armarArbol(archivos) {
  const raiz = { nombre: '', hijos: new Map(), tamano: 0 };
  archivos.forEach(({ path: ruta, size }) => {
    const tamano = Math.max(size, 1);
    let nodo = raiz;
    const partes = ruta.split('/');
    partes.forEach((parte, i) => {
      nodo.tamano += tamano;
      if (i === partes.length - 1) {
        nodo.hijos.set(parte, { nombre: parte, ruta, tamano, tipo: tipoDeArchivo(ruta) });
      } else {
        if (!nodo.hijos.has(parte)) nodo.hijos.set(parte, { nombre: parte, hijos: new Map(), tamano: 0 });
        nodo = nodo.hijos.get(parte);
      }
    });
  });
  return raiz;
}

/* Treemap "squarified" (Bruls, Huizing, van Wijk): reparte los hijos
   en filas que dejan los rectángulos lo más cuadrados posible. */
function repartir(hijos, x, y, ancho, alto) {
  const total = hijos.reduce((suma, h) => suma + h.tamano, 0);
  const escala = (ancho * alto) / total;
  const areas = hijos.map((h) => ({ nodo: h, area: h.tamano * escala }));
  const resultado = [];

  const peorProporcion = (fila, lado) => {
    const suma = fila.reduce((s, f) => s + f.area, 0);
    const max = Math.max(...fila.map((f) => f.area));
    const min = Math.min(...fila.map((f) => f.area));
    return Math.max((lado * lado * max) / (suma * suma), (suma * suma) / (lado * lado * min));
  };

  let restantes = areas;
  while (restantes.length) {
    const lado = Math.min(ancho, alto);
    const fila = [restantes[0]];
    let i = 1;
    while (i < restantes.length && peorProporcion([...fila, restantes[i]], lado) <= peorProporcion(fila, lado)) {
      fila.push(restantes[i]);
      i++;
    }
    restantes = restantes.slice(i);

    const sumaFila = fila.reduce((s, f) => s + f.area, 0);
    if (ancho >= alto) {
      const anchoFila = sumaFila / alto;
      let yFila = y;
      fila.forEach((f) => {
        const altoCelda = f.area / anchoFila;
        resultado.push({ nodo: f.nodo, x, y: yFila, ancho: anchoFila, alto: altoCelda });
        yFila += altoCelda;
      });
      x += anchoFila;
      ancho -= anchoFila;
    } else {
      const altoFila = sumaFila / ancho;
      let xFila = x;
      fila.forEach((f) => {
        const anchoCelda = f.area / altoFila;
        resultado.push({ nodo: f.nodo, x: xFila, y, ancho: anchoCelda, alto: altoFila });
        xFila += anchoCelda;
      });
      y += altoFila;
      alto -= altoFila;
    }
  }
  return resultado;
}

const n = (v) => Number(v.toFixed(2));

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Nombre dentro de una caja, arriba a la izquierda, con el tamaño más
   grande (de 15 a 9) que quepa; si no cabe ni chico, no va. */
function etiqueta(nombre, x, y, ancho, alto) {
  for (const tamano of [15, 12, 9]) {
    if (nombre.length * tamano * ANCHO_CARACTER <= ancho - 8 && tamano + 8 <= alto) {
      return `<text x="${n(x + 4)}" y="${n(y + 4 + tamano * 0.8)}" font-size="${tamano}">${escapar(nombre)}</text>`;
    }
  }
  return '';
}

function dibujarNodo(nodo, x, y, ancho, alto, partes) {
  if (!nodo.hijos) {
    partes.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}" fill="${COLORES[nodo.tipo]}" stroke="black" stroke-width="${LINEA}"><title>${escapar(nodo.ruta)}</title></rect>`,
    );
    partes.push(etiqueta(nodo.nombre, x, y, ancho, alto));
    return;
  }
  // las carpetas (menos la raíz) dejan un marco alrededor de su
  // contenido, más alto arriba para el nombre cuando hay espacio
  let r = 0;
  let rArriba = 0;
  if (nodo.nombre) {
    partes.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}" fill="white" stroke="black" stroke-width="${LINEA}" />`,
    );
    r = Math.min(RELLENO_CARPETA, ancho / 4, alto / 4);
    rArriba = r;
    const nombreCarpeta = `${nodo.nombre}/`;
    if (alto > 80 && nombreCarpeta.length * 12 * ANCHO_CARACTER <= ancho - 8) {
      rArriba = RELLENO_NOMBRE_CARPETA;
      partes.push(`<text x="${n(x + 4)}" y="${n(y + 15)}" font-size="12">${escapar(nombreCarpeta)}</text>`);
    }
  }
  // orden fijo (más grande primero, después por nombre) para que el
  // dibujo solo cambie cuando cambia el repositorio
  const hijos = [...nodo.hijos.values()].sort((a, b) => b.tamano - a.tamano || a.nombre.localeCompare(b.nombre));
  repartir(hijos, x + r, y + rArriba, ancho - 2 * r, alto - r - rArriba).forEach((celda) =>
    dibujarNodo(celda.nodo, celda.x, celda.y, celda.ancho, celda.alto, partes),
  );
}

function dibujarArbol(repositorio, raiz) {
  const partes = [];
  dibujarNodo(raiz, MARGEN, MARGEN + ALTO_CABECERA, ANCHO - 2 * MARGEN, ALTO - 2 * MARGEN - ALTO_CABECERA, partes);

  // cabecera: nombre del repositorio a la izquierda, leyenda a la derecha
  const cabecera = [
    `<text x="${MARGEN}" y="${MARGEN + 24}" font-size="26">${escapar(repositorio)}</text>`,
    `<text x="${MARGEN}" y="${MARGEN + 46}" font-size="14">estructura de archivos: el área de cada caja es el tamaño del archivo</text>`,
  ];
  let xLeyenda = ANCHO - MARGEN;
  [...LEYENDA].reverse().forEach(([tipo, nombre]) => {
    xLeyenda -= nombre.length * 14 * ANCHO_CARACTER;
    cabecera.push(`<text x="${n(xLeyenda)}" y="${MARGEN + 24}" font-size="14">${nombre}</text>`);
    xLeyenda -= 24;
    cabecera.push(
      `<rect x="${n(xLeyenda)}" y="${MARGEN + 12}" width="16" height="16" fill="${COLORES[tipo]}" stroke="black" stroke-width="${LINEA}" />`,
    );
    xLeyenda -= 20;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- generado por scripts/generar-arboles.js desde github.com/${repositorio}, no editar a mano -->
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
<title>${repositorio}: estructura de archivos</title>
<rect width="${ANCHO}" height="${ALTO}" fill="white" />
<g font-family="${FUENTE}" fill="black">
${cabecera.join('\n')}
</g>
<g font-family="${FUENTE}">
${partes.filter(Boolean).join('\n')}
</g>
</svg>
`;
}

function buscarFuentes() {
  return fs
    .readdirSync(RAIZ, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .flatMap((d) => {
      const carpeta = path.join(RAIZ, d.name, 'arbol');
      if (!fs.existsSync(carpeta)) return [];
      return fs
        .readdirSync(carpeta)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => path.join(carpeta, f));
    });
}

async function main() {
  const fuentes = buscarFuentes();
  for (const rutaYaml of fuentes) {
    const repositorio = leerRepositorio(rutaYaml);
    const raiz = armarArbol(await pedirArbol(repositorio));
    const carpetaSvg = path.join(path.dirname(rutaYaml), '..', 'svg');
    const rutaSvg = path.join(carpetaSvg, `${path.basename(rutaYaml).replace(/\.ya?ml$/, '')}.svg`);
    fs.mkdirSync(carpetaSvg, { recursive: true });
    fs.writeFileSync(rutaSvg, dibujarArbol(repositorio, raiz), 'utf8');
    console.log(`  ${path.relative(RAIZ, rutaSvg)}`);
  }
  console.log(`\nListo: ${fuentes.length} árboles.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
