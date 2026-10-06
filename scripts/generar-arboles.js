#!/usr/bin/env node
/* Genera la imagen de los proyectos de software (bibliotecas): un
   treemap de la estructura de archivos de su repositorio de GitHub.
   Cada archivo es un rectángulo con área proporcional a su tamaño en
   bytes, cada carpeta un marco que agrupa a sus archivos, y el color
   dice qué tipo de archivo es. No lleva texto: es un retrato del repo,
   que cambia a medida que el código crece.

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
const RELLENO_CARPETA = 6;
const LINEA = 1.5;

// los colores del sitio (css/style.css de piruetasxyz.github.io)
const COLORES = {
  codigo: 'orange',
  ejemplo: 'skyblue',
  texto: 'pink',
  configuracion: 'greenyellow',
};

function tipoDeArchivo(ruta) {
  const nombre = path.basename(ruta);
  if (ruta.startsWith('examples/') || /^pico\/ej[^/]+\//.test(ruta)) return 'ejemplo';
  if (/\.(h|hpp|c|cpp|ino)$/.test(nombre)) return 'codigo';
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

function dibujarNodo(nodo, x, y, ancho, alto, partes) {
  if (!nodo.hijos) {
    partes.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}" fill="${COLORES[nodo.tipo]}" stroke="black" stroke-width="${LINEA}"><title>${nodo.ruta}</title></rect>`,
    );
    return;
  }
  // las carpetas (menos la raíz) dejan un marco alrededor de su contenido
  let r = 0;
  if (nodo.nombre) {
    partes.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}" fill="white" stroke="black" stroke-width="${LINEA}" />`,
    );
    r = Math.min(RELLENO_CARPETA, ancho / 4, alto / 4);
  }
  // orden fijo (más grande primero, después por nombre) para que el
  // dibujo solo cambie cuando cambia el repositorio
  const hijos = [...nodo.hijos.values()].sort((a, b) => b.tamano - a.tamano || a.nombre.localeCompare(b.nombre));
  repartir(hijos, x + r, y + r, ancho - 2 * r, alto - 2 * r).forEach((celda) =>
    dibujarNodo(celda.nodo, celda.x, celda.y, celda.ancho, celda.alto, partes),
  );
}

function dibujarArbol(repositorio, raiz) {
  const partes = [];
  dibujarNodo(raiz, MARGEN, MARGEN, ANCHO - 2 * MARGEN, ALTO - 2 * MARGEN, partes);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- generado por scripts/generar-arboles.js desde github.com/${repositorio}, no editar a mano -->
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
<title>${repositorio}: estructura de archivos</title>
<rect width="${ANCHO}" height="${ALTO}" fill="white" />
${partes.join('\n')}
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
