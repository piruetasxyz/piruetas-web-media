#!/usr/bin/env node
/* Genera la segunda imagen de los proyectos de software (bibliotecas):
   un gráfico de lo que hace la biblioteca, corriendo su lógica sobre
   una entrada simulada. Arriba va la entrada (lo que lee la patita) y
   abajo la salida (lo que entrega la biblioteca), en el mismo eje de
   tiempo, con el estilo de los árboles de scripts/generar-arboles.js
   (rellenos planos con los colores del sitio y borde negro).

   La lógica de cada biblioteca está portada a JS línea por línea desde
   su src/*.cpp, para que el gráfico muestre lo que hace el código de
   verdad, no lo que debería hacer. Si la biblioteca cambia, hay que
   actualizar el port acá.

   Por cada <proyecto>/grafico/<nombre>.yaml dibuja <proyecto>/svg/<nombre>.svg.
   El .yaml es plano, una `clave: valor` por línea, y `tipo` elige el
   gráfico:
     tipo: 'antirrebote'   (Boton)
     tipo: 'mapeo'         (Perilla)

   Sin dependencias: solo Node.
   Uso: node scripts/generar-graficos.js
*/
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

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
  return config;
}

/* Generador pseudoaleatorio fijo (LCG), para que el ruido simulado
   sea siempre el mismo y el svg solo cambie si cambia el código. */
function aleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    return estado / 2 ** 32;
  };
}

/* ---------- Boton: port de src/Boton.cpp ---------- */

class Boton {
  constructor(tiempoEntreRebotes, tiempoActual) {
    this.tiempoEntreRebotes = tiempoEntreRebotes;
    this.valorLeidoActual = true;
    this.valorLeidoAnterior = true;
    this.tiempoAnteriorDesrebotar = tiempoActual;
  }

  actualizar(lectura, tiempoActual) {
    if (lectura !== this.valorLeidoAnterior) {
      this.tiempoAnteriorDesrebotar = tiempoActual;
    }
    if (tiempoActual - this.tiempoAnteriorDesrebotar > this.tiempoEntreRebotes) {
      if (lectura !== this.valorLeidoActual) {
        this.valorLeidoActual = lectura;
      }
    }
    this.valorLeidoAnterior = lectura;
  }

  getValor() {
    return this.valorLeidoActual;
  }
}

/* Un botón real: suelto (true), se presiona con rebotes, queda
   presionado, se suelta con rebotes. Las patitas con pull-up leen
   true suelto y false presionado. */
function simularAntirrebote(config) {
  const duracion = 600;
  const cambiosPresion = [100, 102, 103, 106, 108, 111, 116];
  const cambiosSoltar = [360, 361, 364, 366, 371];
  const cambios = [...cambiosPresion, ...cambiosSoltar];

  const boton = new Boton(config.tiempoEntreRebotes, 0);
  const entrada = [];
  const salida = [];
  let lectura = true;
  for (let t = 0; t <= duracion; t++) {
    if (cambios.includes(t)) lectura = !lectura;
    boton.actualizar(lectura, t);
    entrada.push([t, lectura ? 1 : 0]);
    salida.push([t, boton.getValor() ? 1 : 0]);
  }
  return {
    subtitulo: `antirrebote: actualizar() cada 1 ms, cambio aceptado después de ${config.tiempoEntreRebotes} ms estable`,
    ejeX: { min: 0, max: duracion, paso: 100, unidad: 'ms' },
    paneles: [
      { titulo: 'lectura de la patita (con rebotes)', serie: entrada, min: 0, max: 1, marcas: [[0, 'false'], [1, 'true']], color: 'pink' },
      { titulo: 'getValor()', serie: salida, min: 0, max: 1, marcas: [[0, 'false'], [1, 'true']], color: 'greenyellow' },
    ],
  };
}

/* ---------- Perilla: port de src/Perilla.cpp ---------- */

// misma fórmula que mapear() en Perilla.cpp, con división entera de C
function mapear(valor, entradaMin, entradaMax, salidaMin, salidaMax) {
  if (entradaMax === entradaMin) return salidaMin;
  return Math.trunc(((valor - entradaMin) * (salidaMax - salidaMin)) / (entradaMax - entradaMin)) + salidaMin;
}

class Perilla {
  constructor() {
    this.valorLeido = 0;
    this.valorMapeado = 0;
    this.setRangoLeido(0, 1023);
    this.setRangoMapeado(0, 1023);
  }

  setRangoLeido(min, max) {
    this.valorLeidoMin = min;
    this.valorLeidoMax = max;
  }

  setRangoMapeado(min, max) {
    this.valorMapeadoMin = min;
    this.valorMapeadoMax = max;
  }

  leer(lectura) {
    this.valorLeido = lectura;
    this.valorMapeado = mapear(this.valorLeido, this.valorLeidoMin, this.valorLeidoMax, this.valorMapeadoMin, this.valorMapeadoMax);
  }

  getValor() {
    return this.valorLeido;
  }

  getValorMapeado() {
    return this.valorMapeado;
  }
}

/* Una mano gira la perilla de un extremo al otro y la devuelve hasta
   la mitad, con un poco de ruido de la lectura análoga. */
function simularMapeo(config) {
  const duracion = 4000;
  const azar = aleatorio(7);
  const perilla = new Perilla();
  perilla.setRangoLeido(config.leidoMin, config.leidoMax);
  perilla.setRangoMapeado(config.mapeadoMin, config.mapeadoMax);

  const giro = (t) => {
    const suave = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(x, 0), 1));
    if (t < 2000) return suave((t - 200) / 1600);
    return 1 - 0.5 * suave((t - 2400) / 1200);
  };

  const entrada = [];
  const salida = [];
  for (let t = 0; t <= duracion; t += 10) {
    const ideal = config.leidoMin + giro(t) * (config.leidoMax - config.leidoMin);
    const lectura = Math.round(Math.min(Math.max(ideal + (azar() - 0.5) * 12, config.leidoMin), config.leidoMax));
    perilla.leer(lectura);
    entrada.push([t, perilla.getValor()]);
    salida.push([t, perilla.getValorMapeado()]);
  }
  const marcas = (min, max) => [[min, String(min)], [(min + max) / 2, String(Math.round((min + max) / 2))], [max, String(max)]];
  return {
    subtitulo: `mapeo: leer() cada 10 ms, de ${config.leidoMin}-${config.leidoMax} a ${config.mapeadoMin}-${config.mapeadoMax}`,
    ejeX: { min: 0, max: duracion, paso: 500, unidad: 'ms' },
    paneles: [
      { titulo: 'getValor(): lectura de la patita', serie: entrada, min: config.leidoMin, max: config.leidoMax, marcas: marcas(config.leidoMin, config.leidoMax), color: 'pink' },
      { titulo: 'getValorMapeado()', serie: salida, min: config.mapeadoMin, max: config.mapeadoMax, marcas: marcas(config.mapeadoMin, config.mapeadoMax), color: 'greenyellow' },
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

function main() {
  const fuentes = buscarFuentes();
  fuentes.forEach((rutaYaml) => {
    const config = leerConfiguracion(rutaYaml);
    const simular = GRAFICOS[config.tipo];
    if (!simular) throw new Error(`${rutaYaml}: tipo desconocido "${config.tipo}"`);
    const carpetaSvg = path.join(path.dirname(rutaYaml), '..', 'svg');
    const rutaSvg = path.join(carpetaSvg, `${path.basename(rutaYaml).replace(/\.ya?ml$/, '')}.svg`);
    fs.mkdirSync(carpetaSvg, { recursive: true });
    fs.writeFileSync(rutaSvg, dibujarGrafico(config, simular(config)), 'utf8');
    console.log(`  ${path.relative(RAIZ, rutaSvg)}`);
  });
  console.log(`\nListo: ${fuentes.length} gráficos.`);
}

main();
