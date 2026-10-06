#!/usr/bin/env node
/* Genera la segunda imagen de los proyectos de software (bibliotecas):
   un gráfico de lo que hace la biblioteca, corriendo su código C++ de
   verdad sobre una entrada simulada. Arriba va la entrada (lo que lee
   la patita) y abajo la salida (lo que entrega la biblioteca), en el
   mismo eje de tiempo, con el estilo de los árboles de
   scripts/generar-arboles.js (rellenos planos con los colores del
   sitio y borde negro).

   No hay copia de la biblioteca acá. Por cada gráfico:
     1. pregunta a la API de GitHub cuál es la última versión publicada
        (release) del repositorio, o usa `version` si el .yaml la fija;
     2. clona esa versión y compila sus src/*.cpp junto a un simulador,
        scripts/simuladores/<tipo>.cpp, que implementa src/Hardware.h
        con una patita (y un reloj) simulados;
     3. le pasa la entrada simulada por stdin y lee lo que entrega la
        biblioteca por stdout.
   Así el gráfico muestra lo que hace la versión publicada, y cambia
   solo cuando sale una versión nueva.

   Por cada <proyecto>/grafico/<nombre>.yaml dibuja <proyecto>/svg/<nombre>.svg.
   El .yaml es plano, una `clave: valor` por línea:
     repositorio: 'piruetasxyz/Boton'
     tipo: 'antirrebote'   (Boton) o 'mapeo' (Perilla)
     version: 'v0.1.1'     (opcional; sin ella, la última release)

   Si una versión no compila con el simulador (por ejemplo, una release
   antigua sin src/Hardware.h), deja el svg anterior y avisa, sin
   detener a los demás gráficos.

   Necesita Node 20, git y un compilador de C++ (c++). Si existe
   GITHUB_TOKEN lo usa para la API de GitHub.
   Uso: node scripts/generar-graficos.js
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const SIMULADORES = path.join(__dirname, 'simuladores');

const ANCHO = 1200;
const ALTO = 800;
const MARGEN = 24;
const ALTO_CABECERA = 64;
const MARGEN_EJE = 64;
const LINEA = 1.5;
const FUENTE = "'Necto Mono', ui-monospace, Menlo, monospace";

const n = (v) => Number(v.toFixed(2));
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function leerConfiguracion(rutaYaml) {
  const config = {};
  const patron = /^(\w+):\s*(?:'([^']*)'|"([^"]*)"|(\S+))\s*$/gm;
  let m;
  while ((m = patron.exec(fs.readFileSync(rutaYaml, 'utf8')))) {
    const valor = m[2] ?? m[3] ?? m[4];
    config[m[1]] = m[4] !== undefined && !Number.isNaN(Number(valor)) ? Number(valor) : valor;
  }
  if (!config.tipo) throw new Error(`${rutaYaml}: falta "tipo"`);
  if (!config.repositorio) throw new Error(`${rutaYaml}: falta "repositorio"`);
  return config;
}

/* Generador pseudoaleatorio fijo (LCG), para que el ruido simulado
   sea siempre el mismo y el svg solo cambie si cambia la biblioteca. */
function aleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 2 ** 32;
  };
}

/* ---------- la biblioteca de verdad ---------- */

async function ultimaVersion(repositorio) {
  const cabeceras = { Accept: 'application/vnd.github+json', 'User-Agent': 'piruetas-web-media' };
  if (process.env.GITHUB_TOKEN) cabeceras.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const respuesta = await fetch(`https://api.github.com/repos/${repositorio}/releases/latest`, { headers: cabeceras });
  if (!respuesta.ok) throw new Error(`${repositorio}: sin release publicada (la API de GitHub respondió ${respuesta.status})`);
  return (await respuesta.json()).tag_name;
}

/* Clona `version` de `repositorio` y compila sus src/*.cpp (sin
   subcarpetas, que son de cada plataforma) junto al simulador del
   tipo. Devuelve la ruta del ejecutable. */
function compilarSimulador(repositorio, version, tipo, carpetaTemporal) {
  const carpetaRepo = path.join(carpetaTemporal, 'repo');
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', version, `https://github.com/${repositorio}.git`, carpetaRepo], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const carpetaSrc = path.join(carpetaRepo, 'src');
  const fuentesCpp = fs
    .readdirSync(carpetaSrc)
    .filter((f) => f.endsWith('.cpp'))
    .map((f) => path.join(carpetaSrc, f));
  const ejecutable = path.join(carpetaTemporal, 'simulador');
  execFileSync('c++', ['-std=c++17', '-Wall', `-I${carpetaSrc}`, ...fuentesCpp, path.join(SIMULADORES, `${tipo}.cpp`), '-o', ejecutable], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return ejecutable;
}

/* Corre el simulador con una línea "t valor" por muestra y devuelve
   sus líneas de salida como arreglos de números. */
function correrSimulador(ejecutable, argumentos, entrada) {
  const salida = execFileSync(ejecutable, argumentos, { input: entrada.map((fila) => fila.join(' ')).join('\n') + '\n' });
  return salida
    .toString()
    .trim()
    .split('\n')
    .map((linea) => linea.split(' ').map(Number));
}

/* ---------- Boton ---------- */

/* Un botón real: suelto (true), se presiona con rebotes, queda
   presionado, se suelta con rebotes. Las patitas con pull-up leen
   true suelto y false presionado. */
function simularAntirrebote(ejecutable) {
  const duracion = 600;
  const cambiosPresion = [100, 102, 103, 106, 108, 111, 116];
  const cambiosSoltar = [360, 361, 364, 366, 371];
  const cambios = [...cambiosPresion, ...cambiosSoltar];

  const entrada = [];
  let lectura = 1;
  for (let t = 0; t <= duracion; t++) {
    if (cambios.includes(t)) lectura = 1 - lectura;
    entrada.push([t, lectura]);
  }
  const filas = correrSimulador(ejecutable, [], entrada);
  return {
    subtitulo: 'antirrebote: actualizar() cada 1 ms sobre un botón simulado con rebotes',
    ejeX: { min: 0, max: duracion, paso: 100, unidad: 'ms' },
    paneles: [
      { titulo: 'lectura de la patita (con rebotes)', serie: filas.map(([t, l]) => [t, l]), min: 0, max: 1, marcas: [[0, 'false'], [1, 'true']], color: 'pink' },
      { titulo: 'getValor()', serie: filas.map(([t, , v]) => [t, v]), min: 0, max: 1, marcas: [[0, 'false'], [1, 'true']], color: 'greenyellow' },
    ],
  };
}

/* ---------- Perilla ---------- */

/* Una mano gira la perilla de un extremo al otro y la devuelve hasta
   la mitad, con un poco de ruido de la lectura análoga. */
function simularMapeo(ejecutable, config) {
  const duracion = 4000;
  const azar = aleatorio(7);
  const giro = (t) => {
    const suave = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(x, 0), 1));
    if (t < 2000) return suave((t - 200) / 1600);
    return 1 - 0.5 * suave((t - 2400) / 1200);
  };

  const entrada = [];
  for (let t = 0; t <= duracion; t += 10) {
    const ideal = config.leidoMin + giro(t) * (config.leidoMax - config.leidoMin);
    entrada.push([t, Math.round(Math.min(Math.max(ideal + (azar() - 0.5) * 12, config.leidoMin), config.leidoMax))]);
  }
  const rangos = [config.leidoMin, config.leidoMax, config.mapeadoMin, config.mapeadoMax].map(String);
  const filas = correrSimulador(ejecutable, rangos, entrada);
  const marcas = (min, max) => [[min, String(min)], [(min + max) / 2, String(Math.round((min + max) / 2))], [max, String(max)]];
  return {
    subtitulo: `mapeo: leer() cada 10 ms, de ${config.leidoMin}-${config.leidoMax} a ${config.mapeadoMin}-${config.mapeadoMax}`,
    ejeX: { min: 0, max: duracion, paso: 500, unidad: 'ms' },
    paneles: [
      { titulo: 'getValor(): lectura de la patita', serie: filas.map(([t, l]) => [t, l]), min: config.leidoMin, max: config.leidoMax, marcas: marcas(config.leidoMin, config.leidoMax), color: 'pink' },
      { titulo: 'getValorMapeado()', serie: filas.map(([t, , m]) => [t, m]), min: config.mapeadoMin, max: config.mapeadoMax, marcas: marcas(config.mapeadoMin, config.mapeadoMax), color: 'greenyellow' },
    ],
  };
}

const GRAFICOS = { antirrebote: simularAntirrebote, mapeo: simularMapeo };

/* ---------- dibujo ---------- */

function dibujarPanel(panel, ejeX, x, y, ancho, alto, mostrarEjeX) {
  const partes = [];
  const escalaX = (t) => x + ((t - ejeX.min) / (ejeX.max - ejeX.min)) * ancho;
  const escalaY = (v) => y + alto - ((v - panel.min) / (panel.max - panel.min || 1)) * alto;

  partes.push(`<text x="${n(x)}" y="${n(y - 12)}" font-size="16">${escapar(panel.titulo)}</text>`);
  partes.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}" fill="white" stroke="black" stroke-width="${LINEA}" />`);

  // la señal como escalones (cada valor dura hasta la próxima muestra),
  // rellena hasta abajo
  const puntos = [];
  panel.serie.forEach(([t, v], i) => {
    if (i > 0) puntos.push([escalaX(t), escalaY(panel.serie[i - 1][1])]);
    puntos.push([escalaX(t), escalaY(v)]);
  });
  const linea = puntos.map(([px, py], i) => `${i ? 'L' : 'M'}${n(px)} ${n(py)}`).join(' ');
  const ultimoX = n(puntos[puntos.length - 1][0]);
  partes.push(`<path d="${linea} L${ultimoX} ${n(y + alto)} L${n(x)} ${n(y + alto)} Z" fill="${panel.color}" stroke="none" />`);
  partes.push(`<path d="${linea}" fill="none" stroke="black" stroke-width="${LINEA}" stroke-linejoin="round" />`);

  panel.marcas.forEach(([v, texto]) => {
    partes.push(`<text x="${n(x - 10)}" y="${n(escalaY(v) + 5)}" font-size="13" text-anchor="end">${escapar(texto)}</text>`);
  });

  for (let t = ejeX.min; t <= ejeX.max; t += ejeX.paso) {
    const px = escalaX(t);
    partes.push(`<path d="M${n(px)} ${n(y + alto)} L${n(px)} ${n(y + alto + 6)}" stroke="black" stroke-width="${LINEA}" />`);
    if (mostrarEjeX) {
      const texto = t === ejeX.max ? `${t} ${ejeX.unidad}` : String(t);
      partes.push(`<text x="${n(px)}" y="${n(y + alto + 24)}" font-size="13" text-anchor="middle">${texto}</text>`);
    }
  }
  return partes.join('\n');
}

function dibujarGrafico(config, grafico) {
  const x = MARGEN + MARGEN_EJE;
  const ancho = ANCHO - x - MARGEN - 40;
  const yInicio = MARGEN + ALTO_CABECERA + 36;
  const separacion = 64;
  const altoPanel = (ALTO - yInicio - MARGEN - 40 - separacion * (grafico.paneles.length - 1)) / grafico.paneles.length;

  const paneles = grafico.paneles.map((panel, i) =>
    dibujarPanel(panel, grafico.ejeX, x, yInicio + i * (altoPanel + separacion), ancho, altoPanel, i === grafico.paneles.length - 1),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- generado por scripts/generar-graficos.js, no editar a mano -->
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
<title>${escapar(config.titulo)}: ${escapar(grafico.subtitulo)}</title>
<rect width="${ANCHO}" height="${ALTO}" fill="white" />
<g font-family="${FUENTE}" fill="black">
<text x="${MARGEN}" y="${MARGEN + 24}" font-size="26">${escapar(config.titulo)}</text>
<text x="${MARGEN}" y="${MARGEN + 46}" font-size="14">${escapar(grafico.subtitulo)}</text>
${paneles.join('\n')}
</g>
</svg>
`;
}

function buscarFuentes() {
  return fs
    .readdirSync(RAIZ, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .flatMap((d) => {
      const carpeta = path.join(RAIZ, d.name, 'grafico');
      if (!fs.existsSync(carpeta)) return [];
      return fs
        .readdirSync(carpeta)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => path.join(carpeta, f));
    });
}

async function main() {
  const fuentes = buscarFuentes();
  let fallidos = 0;
  for (const rutaYaml of fuentes) {
    const config = leerConfiguracion(rutaYaml);
    const simular = GRAFICOS[config.tipo];
    if (!simular) throw new Error(`${rutaYaml}: tipo desconocido "${config.tipo}"`);
    const carpetaSvg = path.join(path.dirname(rutaYaml), '..', 'svg');
    const rutaSvg = path.join(carpetaSvg, `${path.basename(rutaYaml).replace(/\.ya?ml$/, '')}.svg`);

    const carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'grafico-'));
    try {
      const version = config.version || (await ultimaVersion(config.repositorio));
      const ejecutable = compilarSimulador(config.repositorio, version, config.tipo, carpetaTemporal);
      const grafico = simular(ejecutable, config);
      fs.mkdirSync(carpetaSvg, { recursive: true });
      fs.writeFileSync(rutaSvg, dibujarGrafico({ ...config, titulo: `${config.repositorio} ${version}` }, grafico), 'utf8');
      console.log(`  ${path.relative(RAIZ, rutaSvg)} (${config.repositorio} ${version})`);
    } catch (error) {
      fallidos++;
      const detalle = (error.stderr ? error.stderr.toString() : error.message).trim();
      // ::warning:: aparece como aviso en el resumen del GitHub Action
      console.log(`::warning::${path.relative(RAIZ, rutaYaml)}: no se pudo generar, queda el svg anterior. ${detalle.split('\n')[0]}`);
      console.error(detalle);
    } finally {
      fs.rmSync(carpetaTemporal, { recursive: true, force: true });
    }
  }
  console.log(`\nListo: ${fuentes.length - fallidos} de ${fuentes.length} gráficos.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
