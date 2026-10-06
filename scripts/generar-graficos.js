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
     2. clona esa versión y compila sus src/*.cpp junto al simulador de
        la biblioteca, scripts/simuladores/<biblioteca>.cpp, que
        implementa src/Hardware.h con una patita (y un reloj) simulados;
     3. le pasa la entrada simulada por stdin y lee lo que entrega la
        biblioteca por stdout.
   Así el gráfico muestra lo que hace la versión publicada, y cambia
   solo cuando sale una versión nueva. Cada versión se compila una sola
   vez por corrida, aunque la usen varios gráficos.

   Por cada <proyecto>/grafico/<nombre>.yaml dibuja <proyecto>/svg/<nombre>.svg.
   El .yaml es plano, una `clave: valor` por línea:
     repositorio: 'piruetasxyz/Boton'
     tipo: 'antirrebote'
     version: 'v0.1.1'     (opcional; sin ella, la última release)
   y `tipo` elige el gráfico (ver ESCENARIOS más abajo):
     Boton:   'antirrebote', 'umbral', 'pulsaciones'
     Perilla: 'mapeo', 'rangos', 'ruido', 'pico'

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
   subcarpetas, que son de cada plataforma) junto al simulador de la
   biblioteca. Devuelve la ruta del ejecutable. */
function compilarSimulador(repositorio, version, simulador, carpetaTemporal) {
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
  execFileSync('c++', ['-std=c++17', '-Wall', `-I${carpetaSrc}`, ...fuentesCpp, path.join(SIMULADORES, `${simulador}.cpp`), '-o', ejecutable], {
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

const marcasBooleanas = [[0, 'false'], [1, 'true']];
const marcasRango = (min, max) => [[min, String(min)], [(min + max) / 2, String(Math.round((min + max) / 2))], [max, String(max)]];

/* ---------- Boton ---------- */

/* La lectura de la patita a partir de los milisegundos en que cambia.
   Las patitas con pull-up leen 1 (true) suelto y 0 (false) presionado. */
function lecturaBoton(duracion, cambios) {
  const entrada = [];
  let lectura = 1;
  for (let t = 0; t <= duracion; t++) {
    if (cambios.includes(t)) lectura = 1 - lectura;
    entrada.push([t, lectura]);
  }
  return entrada;
}

// un contacto que rebota: 5 cambios en 7 ms, que terminan en el estado contrario
const rebote = (t) => [t, t + 2, t + 3, t + 5, t + 7];

function panelesBoton(filas, tituloEntrada) {
  return [
    { titulo: tituloEntrada, serie: filas.map(([t, l]) => [t, l]), min: 0, max: 1, marcas: marcasBooleanas, color: 'pink' },
    { titulo: 'getValor()', serie: filas.map(([t, , v]) => [t, v]), min: 0, max: 1, marcas: marcasBooleanas, color: 'greenyellow' },
  ];
}

/* Un botón real: suelto, se presiona con rebotes, queda presionado, se
   suelta con rebotes. */
function escenarioAntirrebote(correr) {
  const duracion = 600;
  const cambios = [100, 102, 103, 106, 108, 111, 116, 360, 361, 364, 366, 371];
  return {
    subtitulo: 'antirrebote: actualizar() cada 1 ms sobre un botón simulado con rebotes',
    ejeX: { min: 0, max: duracion, paso: 100, unidad: 'ms' },
    paneles: panelesBoton(correr([], lecturaBoton(duracion, cambios)), 'lectura de la patita (con rebotes)'),
  };
}

/* Pulsos limpios, sin rebotes, cada vez más largos: cuánto tiene que
   durar un cambio para que Boton lo acepte. */
function escenarioUmbral(correr) {
  const largos = [20, 40, 50, 60, 100];
  const cambios = [];
  let inicio = 100;
  largos.forEach((largo) => {
    cambios.push(inicio, inicio + largo);
    inicio += largo + 200;
  });
  // redondeado a la marca siguiente del eje, para que la última lleve la unidad
  const duracion = Math.ceil(inicio / 200) * 200;
  return {
    subtitulo: `umbral: pulsos sin rebotes de ${largos.join(', ')} ms; actualizar() cada 1 ms`,
    ejeX: { min: 0, max: duracion, paso: 200, unidad: 'ms' },
    paneles: panelesBoton(correr([], lecturaBoton(duracion, cambios)), 'lectura de la patita (pulsos sin rebotes)'),
  };
}

/* Pulsaciones con rebotes, primero lentas y después cada vez más
   rápidas: hasta qué ritmo se pueden contar. */
function escenarioPulsaciones(correr) {
  const grupos = [
    { largo: 150, veces: 3 },
    { largo: 70, veces: 4 },
    { largo: 35, veces: 6 },
  ];
  const cambios = [];
  let t = 100;
  grupos.forEach(({ largo, veces }) => {
    for (let i = 0; i < veces; i++) {
      cambios.push(...rebote(t), ...rebote(t + largo));
      t += 2 * largo;
    }
    t += 150;
  });
  const duracion = Math.ceil(t / 250) * 250;
  return {
    subtitulo: `pulsaciones: presionar y soltar cada ${grupos.map((g) => g.largo).join(', ')} ms, con rebotes`,
    ejeX: { min: 0, max: duracion, paso: 250, unidad: 'ms' },
    paneles: panelesBoton(correr([], lecturaBoton(duracion, cambios)), 'lectura de la patita (con rebotes)'),
  };
}

/* ---------- Perilla ---------- */

/* Una mano gira la perilla de un extremo al otro y la devuelve hasta
   la mitad, con un poco de ruido de la lectura análoga. */
function escenarioMapeo(correr, config) {
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
  const filas = correr([config.leidoMin, config.leidoMax, config.mapeadoMin, config.mapeadoMax], entrada);
  return {
    subtitulo: `mapeo: leer() cada 10 ms, de ${config.leidoMin}-${config.leidoMax} a ${config.mapeadoMin}-${config.mapeadoMax}`,
    ejeX: { min: 0, max: duracion, paso: 500, unidad: 'ms' },
    paneles: [
      { titulo: 'getValor(): lectura de la patita', serie: filas.map(([t, l]) => [t, l]), min: config.leidoMin, max: config.leidoMax, marcas: marcasRango(config.leidoMin, config.leidoMax), color: 'pink' },
      { titulo: 'getValorMapeado()', serie: filas.map(([t, , m]) => [t, m]), min: config.mapeadoMin, max: config.mapeadoMax, marcas: marcasRango(config.mapeadoMin, config.mapeadoMax), color: 'greenyellow' },
    ],
  };
}

/* Todas las lecturas de `min` a `max`, una vez cada una: el eje x deja
   de ser el tiempo y pasa a ser la lectura. */
function barrido(min, max, paso = 1) {
  const entrada = [];
  for (let v = min; v <= max; v += paso) entrada.push([v, v]);
  return entrada;
}

/* La curva completa de getValorMapeado() para varios rangos mapeados,
   incluido uno invertido. */
function escenarioRangos(correr) {
  const rangos = [
    [0, 100, 'greenyellow'],
    [0, 255, 'skyblue'],
    [100, 0, 'orange'],
  ];
  return {
    subtitulo: 'rangos: getValorMapeado() para cada lectura de 0 a 1023, con setRangoLeido(0, 1023)',
    ejeX: { min: 0, max: 1023, marcas: [0, 256, 512, 768, 1023], unidad: '(lectura)' },
    paneles: rangos.map(([min, max, color]) => {
      const filas = correr([0, 1023, min, max], barrido(0, 1023));
      const [abajo, arriba] = [Math.min(min, max), Math.max(min, max)];
      return { titulo: `setRangoMapeado(${min}, ${max})`, serie: filas.map(([t, , m]) => [t, m]), min: abajo, max: arriba, marcas: marcasRango(abajo, arriba), color };
    }),
  };
}

/* Una perilla girada muy lento, de 480 a 540, con el ruido de la
   lectura análoga (±6): leer() no filtra, así que el valor mapeado
   salta entre dos números en cada cambio. */
function escenarioRuido(correr) {
  const duracion = 4000;
  const azar = aleatorio(11);
  const entrada = [];
  for (let t = 0; t <= duracion; t += 10) {
    entrada.push([t, Math.round(480 + (60 * t) / duracion + (azar() - 0.5) * 12)]);
  }
  const filas = correr([0, 1023, 0, 100], entrada);
  const lecturas = filas.map(([, l]) => l);
  const mapeados = filas.map(([, , m]) => m);
  const [lMin, lMax] = [Math.min(...lecturas), Math.max(...lecturas)];
  const [mMin, mMax] = [Math.min(...mapeados), Math.max(...mapeados)];
  return {
    subtitulo: 'ruido: una perilla girada muy lento (480 a 540) con ruido de ±6, leer() cada 10 ms, mapeo a 0-100',
    ejeX: { min: 0, max: duracion, paso: 500, unidad: 'ms' },
    paneles: [
      { titulo: 'getValor(): lectura de la patita', serie: filas.map(([t, l]) => [t, l]), min: lMin, max: lMax, marcas: [[lMin, String(lMin)], [lMax, String(lMax)]], color: 'pink' },
      { titulo: 'getValorMapeado()', serie: filas.map(([t, , m]) => [t, m]), min: mMin, max: mMax, marcas: [[mMin, String(mMin)], [mMax, String(mMax)]], color: 'greenyellow' },
    ],
  };
}

/* En Raspberry Pi Pico la lectura análoga es de 12 bits (0 a 4095):
   con el rango leído por defecto (0 a 1023) el valor mapeado se pasa
   del rango, y con setRangoLeido(0, 4095) queda bien. */
function escenarioPico(correr) {
  const paneles = [
    [1023, 'setRangoLeido(0, 1023), el que viene por defecto', 'orange'],
    [4095, 'setRangoLeido(0, 4095)', 'greenyellow'],
  ].map(([leidoMax, titulo, color]) => {
    const filas = correr([0, leidoMax, 0, 100], barrido(0, 4095));
    const serie = filas.map(([t, , m]) => [t, m]);
    const max = Math.max(...serie.map(([, m]) => m));
    return { titulo: `${titulo}: getValorMapeado()`, serie, min: 0, max, marcas: [...new Set([0, 100, max])].map((v) => [v, String(v)]), color };
  });
  return {
    subtitulo: 'pico: lecturas de 12 bits (0 a 4095) mapeadas a 0-100, con setRangoMapeado(0, 100)',
    ejeX: { min: 0, max: 4095, marcas: [0, 1023, 2048, 3072, 4095], unidad: '(lectura)' },
    paneles,
  };
}

/* Cada tipo de gráfico dice qué simulador usa (scripts/simuladores/)
   y cómo arma la entrada y los paneles. */
const ESCENARIOS = {
  antirrebote: { simulador: 'boton', armar: escenarioAntirrebote },
  umbral: { simulador: 'boton', armar: escenarioUmbral },
  pulsaciones: { simulador: 'boton', armar: escenarioPulsaciones },
  mapeo: { simulador: 'perilla', armar: escenarioMapeo },
  rangos: { simulador: 'perilla', armar: escenarioRangos },
  ruido: { simulador: 'perilla', armar: escenarioRuido },
  pico: { simulador: 'perilla', armar: escenarioPico },
};

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

  const marcasX = ejeX.marcas || Array.from({ length: Math.floor((ejeX.max - ejeX.min) / ejeX.paso) + 1 }, (_, i) => ejeX.min + i * ejeX.paso);
  for (const t of marcasX) {
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
  const carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'graficos-'));
  // "repositorio@version/simulador" -> ejecutable (o el error al compilarlo)
  const compilados = new Map();
  let fallidos = 0;

  try {
    for (const rutaYaml of fuentes) {
      const config = leerConfiguracion(rutaYaml);
      const escenario = ESCENARIOS[config.tipo];
      if (!escenario) throw new Error(`${rutaYaml}: tipo desconocido "${config.tipo}"`);
      const carpetaSvg = path.join(path.dirname(rutaYaml), '..', 'svg');
      const rutaSvg = path.join(carpetaSvg, `${path.basename(rutaYaml).replace(/\.ya?ml$/, '')}.svg`);

      try {
        const version = config.version || (await ultimaVersion(config.repositorio));
        const clave = `${config.repositorio}@${version}/${escenario.simulador}`;
        if (!compilados.has(clave)) {
          try {
            const carpeta = path.join(carpetaTemporal, String(compilados.size));
            fs.mkdirSync(carpeta);
            compilados.set(clave, compilarSimulador(config.repositorio, version, escenario.simulador, carpeta));
          } catch (error) {
            compilados.set(clave, error);
          }
        }
        const ejecutable = compilados.get(clave);
        if (ejecutable instanceof Error) throw ejecutable;

        const correr = (argumentos, entrada) => correrSimulador(ejecutable, argumentos.map(String), entrada);
        const grafico = escenario.armar(correr, config);
        fs.mkdirSync(carpetaSvg, { recursive: true });
        fs.writeFileSync(rutaSvg, dibujarGrafico({ ...config, titulo: `${config.repositorio} ${version}` }, grafico), 'utf8');
        console.log(`  ${path.relative(RAIZ, rutaSvg)} (${config.repositorio} ${version})`);
      } catch (error) {
        fallidos++;
        const detalle = (error.stderr ? error.stderr.toString() : error.message).trim();
        // ::warning:: aparece como aviso en el resumen del GitHub Action
        console.log(`::warning::${path.relative(RAIZ, rutaYaml)}: no se pudo generar, queda el svg anterior. ${detalle.split('\n')[0]}`);
        console.error(detalle);
      }
    }
  } finally {
    fs.rmSync(carpetaTemporal, { recursive: true, force: true });
  }
  console.log(`\nListo: ${fuentes.length - fallidos} de ${fuentes.length} gráficos.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
