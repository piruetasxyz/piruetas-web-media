#!/usr/bin/env node
/* Genera los diagramas de flujo de señal de los proyectos de software
   (bibliotecas): por cada <proyecto>/diagrama/<nombre>.yaml dibuja
   <proyecto>/svg/<nombre>.svg.

   El dibujo imita el lenguaje visual de los esquemáticos que exporta
   KiCad (ej. 2026-piruetas-chufe/svg/chufe-esquematico.svg): hoja A4
   apaisada color hueso, marco con zonas 1-6 y A-D, cuadro de título
   abajo a la derecha, cables verdes, cuerpos de componentes amarillos
   con borde granate y textos verde azulado. Así los diagramas de las
   bibliotecas quedan junto a los esquemáticos de los popusintes sin
   desentonar.

   El texto va convertido a trazados con la tipografía Necto Mono (la
   misma de piruetas.xyz), para que el svg se vea igual en cualquier
   lado sin depender de que la fuente esté instalada. La fuente se
   descarga desde piruetasxyz.github.io; para usar una copia local:
   FUENTE_NECTO=/ruta/NectoMono-Regular.otf.

   Uso: npm install && node scripts/generar-diagramas.js
*/
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const opentype = require('opentype.js');

const RAIZ = path.join(__dirname, '..');
const URL_FUENTE =
  'https://cdn.jsdelivr.net/gh/piruetasxyz/piruetasxyz.github.io@main/tipo/fonts/NectoMono-Regular.otf';

// colores del tema por defecto de KiCad, sacados de los svg de chufe
const COLOR = {
  hoja: '#F5F4EF',
  marco: '#840000',
  cable: '#009600',
  cuerpo: '#FFFFC2',
  borde: '#840000',
  patita: '#A90000',
  texto: '#006464',
  etiqueta: '#0F0F0F',
};

// hoja A4 apaisada, en mm
const ANCHO = 297.0022;
const ALTO = 210.0072;
const MARGEN = 10;
const BANDA = 2;

// grosores de línea (en mm): más gruesos que los de KiCad, porque el
// diagrama tiene pocas piezas grandes y se ve sobre todo en miniatura
const GROSOR = { marco: 0.1524, cable: 0.4, borde: 0.5, patita: 0.4 };

// tamaños de texto (en mm)
const TEXTO = { zona: 1.5, ref: 2.6, nombre: 3.2, nota: 2.4, etiqueta: 2.6, titulo: 4, bloque: 1.8 };

let fuente;

async function cargarFuente() {
  let buffer;
  if (process.env.FUENTE_NECTO) {
    buffer = fs.readFileSync(process.env.FUENTE_NECTO);
  } else {
    const respuesta = await fetch(URL_FUENTE);
    if (!respuesta.ok) throw new Error(`No se pudo descargar ${URL_FUENTE}: ${respuesta.status}`);
    buffer = Buffer.from(await respuesta.arrayBuffer());
  }
  fuente = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length));
}

const n = (valor) => Number(valor.toFixed(4));

/* Texto como trazado. `y` es el centro vertical de las mayúsculas;
   `ancla` es 'inicio', 'medio' o 'fin', como text-anchor. */
function texto(contenido, x, y, tamano, color, ancla = 'inicio') {
  const ancho = fuente.getAdvanceWidth(contenido, tamano);
  const desplazamiento = { inicio: 0, medio: ancho / 2, fin: ancho }[ancla];
  const altoMayusculas = (fuente.tables.os2.sCapHeight / fuente.unitsPerEm) * tamano;
  const trazado = fuente.getPath(contenido, x - desplazamiento, y + altoMayusculas / 2, tamano);
  return `<path fill="${color}" d="${trazado.toPathData(3)}" />`;
}

const anchoTexto = (contenido, tamano) => fuente.getAdvanceWidth(contenido, tamano);

function linea(puntos, color, grosor) {
  const d = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');
  return `<path fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round" d="${d}" />`;
}

function rectangulo(x, y, ancho, alto, borde, grosor, relleno = 'none') {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}" fill="${relleno}" stroke="${borde}" stroke-width="${grosor}" stroke-linejoin="round" />`;
}

const cable = (puntos) => linea(puntos, COLOR.cable, GROSOR.cable);
const union = (x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="0.9" fill="${COLOR.cable}" />`;

/* Marco con zonas numeradas (1-6 arriba y abajo, A-D a los lados),
   igual que la plantilla A4 de KiCad. */
function marco() {
  const partes = [
    rectangulo(MARGEN, MARGEN, ANCHO - 2 * MARGEN, ALTO - 2 * MARGEN, COLOR.marco, GROSOR.marco),
    rectangulo(MARGEN + BANDA, MARGEN + BANDA, ANCHO - 2 * (MARGEN + BANDA), ALTO - 2 * (MARGEN + BANDA), COLOR.marco, GROSOR.marco),
  ];
  const columnas = 6;
  const filas = 4;
  const anchoColumna = (ANCHO - 2 * MARGEN) / columnas;
  const altoFila = (ALTO - 2 * MARGEN) / filas;
  for (let i = 0; i < columnas; i++) {
    const x = MARGEN + i * anchoColumna;
    if (i > 0) {
      partes.push(linea([[x, MARGEN], [x, MARGEN + BANDA]], COLOR.marco, GROSOR.marco));
      partes.push(linea([[x, ALTO - MARGEN - BANDA], [x, ALTO - MARGEN]], COLOR.marco, GROSOR.marco));
    }
    partes.push(texto(String(i + 1), x + anchoColumna / 2, MARGEN + BANDA / 2, TEXTO.zona, COLOR.marco, 'medio'));
    partes.push(texto(String(i + 1), x + anchoColumna / 2, ALTO - MARGEN - BANDA / 2, TEXTO.zona, COLOR.marco, 'medio'));
  }
  for (let i = 0; i < filas; i++) {
    const y = MARGEN + i * altoFila;
    if (i > 0) {
      partes.push(linea([[MARGEN, y], [MARGEN + BANDA, y]], COLOR.marco, GROSOR.marco));
      partes.push(linea([[ANCHO - MARGEN - BANDA, y], [ANCHO - MARGEN, y]], COLOR.marco, GROSOR.marco));
    }
    const letra = 'ABCD'[i];
    partes.push(texto(letra, MARGEN + BANDA / 2, y + altoFila / 2, TEXTO.zona, COLOR.marco, 'medio'));
    partes.push(texto(letra, ANCHO - MARGEN - BANDA / 2, y + altoFila / 2, TEXTO.zona, COLOR.marco, 'medio'));
  }
  return partes.join('\n');
}

/* Cuadro de título abajo a la derecha, con las mismas filas que el de
   los esquemáticos de piruetas. */
function cuadroTitulo(datos) {
  const x0 = 177.0022;
  const x1 = 285.0022;
  const y0 = 166.0072;
  const y1 = 198.0072;
  const filas = [178.5, 186, 191.5, 194.8];
  const partes = [rectangulo(x0, y0, x1 - x0, y1 - y0, COLOR.marco, GROSOR.marco)];
  filas.forEach((y) => partes.push(linea([[x0, y], [x1, y]], COLOR.marco, GROSOR.marco)));
  partes.push(linea([[x0 + 46, filas[2]], [x0 + 46, filas[3]]], COLOR.marco, GROSOR.marco));
  partes.push(linea([[x0 + 82, filas[2]], [x0 + 82, y1]], COLOR.marco, GROSOR.marco));

  const t = (contenido, x, y, tamano = TEXTO.bloque) => texto(contenido, x, y, tamano, COLOR.marco);
  partes.push(t('piruetas SpA', x0 + 1.5, 176.5, 2.2));
  partes.push(t('Sheet: /', x0 + 1.5, 180.5));
  partes.push(t(`File: ${datos.archivo}`, x0 + 1.5, 183.8));
  partes.push(t(`Title: ${datos.titulo}`, x0 + 1.5, (filas[1] + filas[2]) / 2, 2.6));
  partes.push(t('Size: A4', x0 + 1.5, (filas[2] + filas[3]) / 2));
  partes.push(t(`Date: ${datos.fecha}`, x0 + 48, (filas[2] + filas[3]) / 2));
  partes.push(t(`Rev: ${datos.revision}`, x0 + 84, (filas[2] + filas[3]) / 2));
  partes.push(t('generar-diagramas.js', x0 + 1.5, (filas[3] + y1) / 2));
  partes.push(t('Id: 1/1', x0 + 84, (filas[3] + y1) / 2));
  return partes.join('\n');
}

/* Símbolo de alimentación (flecha hacia arriba, como +12V en KiCad)
   con la punta en (x, y). */
function alimentacion(nombre, x, y) {
  return [
    linea([[x, y + 2.5], [x, y]], COLOR.borde, GROSOR.patita),
    linea([[x - 1.2, y + 1.8], [x, y], [x + 1.2, y + 1.8]], COLOR.borde, GROSOR.patita),
    texto(nombre, x, y - 2.5, TEXTO.ref, COLOR.texto, 'medio'),
  ].join('\n');
}

/* Símbolo de tierra (triángulo hacia abajo) colgando de (x, y). */
function tierra(x, y) {
  return [
    linea([[x, y], [x, y + 1.5], [x - 1.8, y + 1.5], [x, y + 3.6], [x + 1.8, y + 1.5], [x, y + 1.5]], COLOR.borde, GROSOR.patita),
    texto('GND', x, y + 6.3, TEXTO.ref, COLOR.texto, 'medio'),
  ].join('\n');
}

/* Resistencia vertical centrada en (x, y), de 9 mm entre patitas. */
function resistencia(x, y, ref, valor) {
  return [
    rectangulo(x - 1.4, y - 3.5, 2.8, 7, COLOR.borde, GROSOR.borde),
    linea([[x, y - 4.5], [x, y - 3.5]], COLOR.borde, GROSOR.patita),
    linea([[x, y + 3.5], [x, y + 4.5]], COLOR.borde, GROSOR.patita),
    texto(ref, x + 3, y - 1.4, TEXTO.ref, COLOR.texto),
    texto(valor, x + 3, y + 1.8, TEXTO.ref, COLOR.texto),
  ].join('\n');
}

/* Entrada física, a la izquierda del diagrama. Devuelve el svg y el
   punto (x, y) donde sale el cable hacia el primer bloque. */
function dibujarEntrada(entrada, x, y) {
  const partes = [];
  if (entrada.tipo === 'boton') {
    // botón a tierra con resistencia pull-up a la alimentación, como
    // queda la patita con INPUT_PULLUP
    partes.push(alimentacion(entrada.alimentacion, x, y - 24));
    partes.push(cable([[x, y - 21.5], [x, y - 17]]));
    partes.push(resistencia(x, y - 12.5, entrada.resistencia.ref, entrada.resistencia.valor));
    partes.push(cable([[x, y - 8], [x, y + 6]]));
    // pulsador vertical: dos contactos y la tecla al costado
    const ya = y + 7;
    const yb = y + 15;
    partes.push(`<circle cx="${x}" cy="${ya}" r="0.9" fill="none" stroke="${COLOR.borde}" stroke-width="${GROSOR.patita}" />`);
    partes.push(`<circle cx="${x}" cy="${yb}" r="0.9" fill="none" stroke="${COLOR.borde}" stroke-width="${GROSOR.patita}" />`);
    partes.push(linea([[x - 2.6, ya - 1.2], [x - 2.6, yb + 1.2]], COLOR.borde, GROSOR.borde));
    partes.push(linea([[x - 2.6, y + 11], [x - 5.2, y + 11]], COLOR.borde, GROSOR.borde));
    partes.push(linea([[x - 5.2, y + 9.6], [x - 5.2, y + 12.4]], COLOR.borde, GROSOR.borde));
    partes.push(texto(entrada.ref, x + 3, y + 9.4, TEXTO.ref, COLOR.texto));
    partes.push(texto(entrada.valor, x + 3, y + 12.6, TEXTO.ref, COLOR.texto));
    partes.push(cable([[x, yb + 0.9], [x, y + 21]]));
    partes.push(tierra(x, y + 21));
    partes.push(union(x, y));
  } else if (entrada.tipo === 'potenciometro') {
    // potenciómetro entre alimentación y tierra, con el cursor saliendo
    // hacia la derecha a la altura del cable
    partes.push(alimentacion(entrada.alimentacion, x, y - 20));
    partes.push(cable([[x, y - 17.5], [x, y - 9]]));
    partes.push(rectangulo(x - 1.4, y - 8, 2.8, 16, COLOR.borde, GROSOR.borde));
    partes.push(linea([[x, y - 9], [x, y - 8]], COLOR.borde, GROSOR.patita));
    partes.push(linea([[x, y + 8], [x, y + 9]], COLOR.borde, GROSOR.patita));
    partes.push(linea([[x + 5, y], [x + 1.5, y]], COLOR.borde, GROSOR.patita));
    partes.push(linea([[x + 2.7, y - 1], [x + 1.5, y], [x + 2.7, y + 1]], COLOR.borde, GROSOR.patita));
    partes.push(texto(entrada.ref, x - 3, y - 1.4, TEXTO.ref, COLOR.texto, 'fin'));
    partes.push(texto(entrada.valor, x - 3, y + 1.8, TEXTO.ref, COLOR.texto, 'fin'));
    partes.push(cable([[x, y + 9], [x, y + 17]]));
    partes.push(tierra(x, y + 17));
    return { svg: partes.join('\n'), salida: [x + 5, y] };
  } else {
    throw new Error(`Tipo de entrada desconocido: "${entrada.tipo}"`);
  }
  return { svg: partes.join('\n'), salida: [x, y] };
}

const ANCHO_BLOQUE = 40;
const ALTO_BLOQUE = 24;
const LARGO_PATITA = 2.54;

/* Bloque de una etapa (un método de la biblioteca), como un circuito
   integrado: cuerpo amarillo, una patita de entrada a la izquierda y
   una de salida a la derecha, referencia arriba. Los `controles`
   entran por arriba como cables con etiqueta. */
function dibujarBloque(etapa, x, y) {
  const ancho = Math.max(ANCHO_BLOQUE, anchoTexto(etapa.nombre, TEXTO.nombre) + 6);
  const arriba = y - ALTO_BLOQUE / 2;
  const partes = [rectangulo(x, arriba, ancho, ALTO_BLOQUE, COLOR.borde, GROSOR.borde, COLOR.cuerpo)];

  partes.push(linea([[x - LARGO_PATITA, y], [x, y]], COLOR.patita, GROSOR.patita));
  partes.push(linea([[x + ancho, y], [x + ancho + LARGO_PATITA, y]], COLOR.patita, GROSOR.patita));
  partes.push(texto('1', x - 0.6, y - 1.4, TEXTO.bloque, COLOR.patita, 'fin'));
  partes.push(texto('2', x + ancho + 0.6, y - 1.4, TEXTO.bloque, COLOR.patita));

  partes.push(texto(etapa.nombre, x + ancho / 2, arriba + 6, TEXTO.nombre, COLOR.texto, 'medio'));
  (etapa.notas || []).forEach((nota, i) => {
    partes.push(texto(nota, x + ancho / 2, arriba + 13 + i * 4, TEXTO.nota, COLOR.texto, 'medio'));
  });

  const controles = etapa.controles || [];
  controles.forEach((control, i) => {
    // las etiquetas se abren hacia afuera (las de la izquierda terminan
    // en su cable, las de la derecha empiezan en el suyo) para que
    // ningún cable cruce la etiqueta de otro
    const cx = x + (ancho * (i + 1)) / (controles.length + 1);
    const alto = arriba - LARGO_PATITA - 12;
    const centro = (controles.length - 1) / 2;
    const ancla = i < centro ? 'fin' : i > centro ? 'inicio' : 'medio';
    const xEtiqueta = cx + { fin: 1, inicio: -1, medio: 0 }[ancla];
    partes.push(linea([[cx, arriba - LARGO_PATITA], [cx, arriba]], COLOR.patita, GROSOR.patita));
    partes.push(cable([[cx, alto], [cx, arriba - LARGO_PATITA]]));
    partes.push(texto(control, xEtiqueta, alto - 2.5, TEXTO.etiqueta, COLOR.etiqueta, ancla));
  });

  // con controles la referencia se corre a la esquina para no chocar
  // con sus cables
  partes.push(
    controles.length
      ? texto(etapa.ref, x + 1, arriba - 2.5, TEXTO.ref, COLOR.texto)
      : texto(etapa.ref, x + ancho / 2, arriba - 2.5, TEXTO.ref, COLOR.texto, 'medio'),
  );

  return { svg: partes.join('\n'), ancho: ancho + 2 * LARGO_PATITA };
}

/* Etiqueta global de salida (pentágono apuntando a la derecha) con la
   punta izquierda en (x, y). */
function etiquetaSalida(contenido, x, y) {
  const ancho = anchoTexto(contenido, TEXTO.etiqueta) + 5;
  const alto = 2.4;
  return [
    linea(
      [[x, y], [x + alto, y - alto], [x + ancho, y - alto], [x + ancho + alto, y], [x + ancho, y + alto], [x + alto, y + alto], [x, y]],
      COLOR.borde,
      GROSOR.patita,
    ),
    texto(contenido, x + alto + 2, y, TEXTO.etiqueta, COLOR.etiqueta),
  ].join('\n');
}

function dibujarDiagrama(datos) {
  const SEPARACION = 16;
  const yCentro = 82;

  // primero se miden los bloques para centrar la cadena en la hoja
  const anchosBloques = datos.etapas.map(
    (etapa) => Math.max(ANCHO_BLOQUE, anchoTexto(etapa.nombre, TEXTO.nombre) + 6) + 2 * LARGO_PATITA,
  );
  const anchoEntrada = 12;
  const anchoSalida = anchoTexto(datos.salida, TEXTO.etiqueta) + 10;
  const anchoTotal =
    anchoEntrada + anchosBloques.reduce((a, b) => a + b, 0) + SEPARACION * datos.etapas.length + anchoSalida;
  let x = (ANCHO - anchoTotal) / 2;

  const partes = [];
  const entrada = dibujarEntrada(datos.entrada, x, yCentro);
  partes.push(entrada.svg);
  let [xCable] = entrada.salida;
  x += anchoEntrada;

  datos.etapas.forEach((etapa) => {
    const xBloque = x + SEPARACION + LARGO_PATITA;
    partes.push(cable([[xCable, yCentro], [xBloque - LARGO_PATITA, yCentro]]));
    partes.push(texto(etapa.cable, xCable + 2.5, yCentro - 2, TEXTO.etiqueta, COLOR.etiqueta));
    const bloque = dibujarBloque(etapa, xBloque, yCentro);
    partes.push(bloque.svg);
    x = xBloque - LARGO_PATITA + bloque.ancho;
    xCable = x;
  });

  partes.push(cable([[xCable, yCentro], [xCable + 6, yCentro]]));
  partes.push(etiquetaSalida(datos.salida, xCable + 6, yCentro));

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- generado por scripts/generar-diagramas.js, no editar a mano -->
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${ANCHO}mm" height="${ALTO}mm" viewBox="0 0 ${ANCHO} ${ALTO}">
<title>${datos.titulo}: diagrama de flujo de señal</title>
<rect x="0" y="0" width="${ANCHO}" height="${ALTO}" fill="${COLOR.hoja}" />
${marco()}
${cuadroTitulo(datos)}
${partes.join('\n')}
</svg>
`;
}

function buscarFuentes() {
  return fs
    .readdirSync(RAIZ, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .flatMap((d) => {
      const carpeta = path.join(RAIZ, d.name, 'diagrama');
      if (!fs.existsSync(carpeta)) return [];
      return fs
        .readdirSync(carpeta)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => path.join(carpeta, f));
    });
}

async function main() {
  await cargarFuente();
  const fuentes = buscarFuentes();
  fuentes.forEach((rutaYaml) => {
    const datos = yaml.load(fs.readFileSync(rutaYaml, 'utf8'));
    const carpetaSvg = path.join(path.dirname(rutaYaml), '..', 'svg');
    const rutaSvg = path.join(carpetaSvg, `${path.basename(rutaYaml).replace(/\.ya?ml$/, '')}.svg`);
    fs.mkdirSync(carpetaSvg, { recursive: true });
    fs.writeFileSync(rutaSvg, dibujarDiagrama(datos), 'utf8');
    console.log(`  ${path.relative(RAIZ, rutaSvg)}`);
  });
  console.log(`\nListo: ${fuentes.length} diagramas.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
