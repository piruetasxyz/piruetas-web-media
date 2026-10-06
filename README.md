# piruetas-web-media

Repositorio de imágenes para los proyectos web de piruetas.

## Estructura de carpetas

Cada proyecto vive en su propia carpeta en la raíz del repositorio, con el nombre:

```text
AAAA-cliente-proyecto
```

Por ejemplo: `2026-claudia-gonzalez-godoy-placas`.

Dentro de cada carpeta de proyecto, las imágenes se organizan en subcarpetas:

```text
2026-biblioteca-cuir-web/
  jpg/    fotos originales (portada-foto-actividad.jpg, ...)
  svg/    dibujos originales, si hay (esquemáticos, placas, ...)
  arbol/  .yaml con el repositorio de GitHub de un proyecto de software, si hay
  grafico/  .yaml con los parámetros del gráfico de una biblioteca de software, si hay
  mp4/    videos, si hay (renders 3D, ...)
  webp/   previews en formato webp, generadas automáticamente a partir de jpg/
  redes/  previews de 1200×628 para redes sociales, generadas automáticamente a partir de jpg/, png/ y svg/
```

Solo `jpg/`, `png/`, `svg/`, `mp4/`, `arbol/` y `grafico/` se suben a mano; `webp/` y `redes/` no se editan nunca a mano, y tampoco los `svg/` que salen de un `arbol/` o un `grafico/`.

Los archivos nuevos dentro de `jpg/` se nombran de forma descriptiva, en minúsculas y con guiones, según lo que muestra la foto (ej: `portada-foto-actividad.jpg`, `inicio-objetos-coleccion.jpg`). Cada `.webp` en `webp/` tiene el mismo nombre que su `.jpg`.

Algunas carpetas antiguas, como `2026-claudia-gonzalez-godoy-placas`, usan números de dos dígitos (`00.jpg`, `01.jpg`, ...).

## Imágenes de proyectos de software

Los proyectos de software (como las bibliotecas `2025-piruetas-boton` y `2025-piruetas-perilla`) no tienen fotos ni esquemáticos, así que sus imágenes salen del código mismo, con dos scripts sin dependencias (solo Node 20) que corren en el GitHub Action [`generar-previews.yml`](.github/workflows/generar-previews.yml) antes de los previews, así que cada imagen también recibe su `redes/<nombre>.jpg`.

### Árboles

Un treemap de la estructura de archivos de su repositorio. Cada archivo es un rectángulo con área proporcional a su tamaño, cada carpeta un marco que agrupa a sus archivos, y el color dice el tipo de archivo, con los colores del sitio (con leyenda y nombres en la imagen):

- naranjo: código (`.h`, `.cpp`, ...)
- celeste: ejemplos (`examples/`, `pico/ej*/`)
- rosado: texto (`.md`, `LICENSE`, documentación)
- verde limón: configuración (workflows, CMake, `library.properties`, ...)

Cada `arbol/<nombre>.yaml` tiene una sola línea, `repositorio: 'piruetasxyz/Boton'`, y [`scripts/generar-arboles.js`](scripts/generar-arboles.js) dibuja `svg/<nombre>.svg` pidiendo el árbol del repositorio a la API de GitHub. Como el dibujo cambia cuando cambia el repositorio, para actualizarlo se puede correr el workflow a mano (workflow_dispatch) o desde la raíz del repositorio:

```sh
node scripts/generar-arboles.js
```

### Gráficos

Un gráfico de lo que hace la biblioteca: [`scripts/generar-graficos.js`](scripts/generar-graficos.js) clona la última versión publicada (release) del repositorio, compila sus `src/*.cpp` de verdad junto a un simulador de [`scripts/simuladores/`](scripts/simuladores/) que implementa su `src/Hardware.h` con una patita simulada, lo corre sobre una entrada simulada, y dibuja arriba la entrada y abajo lo que entrega la biblioteca. No hay copia de la biblioteca en JS: el gráfico muestra lo que hace la versión publicada, y el título dice cuál es. Cada `grafico/<nombre>.yaml` es plano (`clave: valor`), con `repositorio`, `tipo` y, si se quiere fijar una versión en vez de la última release, `version`. El `tipo` elige el gráfico y el simulador:

- `antirrebote` (Boton): un botón con rebotes, y lo que entrega `getValor()`.
- `mapeo` (Perilla): una perilla girando, y lo que entrega `getValorMapeado()`.

El workflow corre también una vez al día, así que al publicar una release nueva de la biblioteca el gráfico se redibuja solo (o al tiro, corriendo el workflow a mano). Si una versión no compila con el simulador, por ejemplo una release antigua sin `src/Hardware.h`, queda el svg anterior y el workflow lo avisa. Para correrlo localmente hace falta `git` y un compilador de C++:

```sh
node scripts/generar-graficos.js
```

## Generación de previews webp

Las imágenes en `webp/` se generan automáticamente a partir de las que están en `jpg/`, usando [`scripts/generar-webp.sh`](scripts/generar-webp.sh) y `cwebp`.

Esto corre solo, mediante el GitHub Action [`generar-previews.yml`](.github/workflows/generar-previews.yml): cada vez que se sube una foto nueva a una carpeta `jpg/` en `main`, el workflow genera los `.webp` correspondientes y los commitea de vuelta al repositorio.

También se puede correr a mano desde la raíz del repositorio:

```sh
scripts/generar-webp.sh
```

Esto requiere tener `cwebp` instalado (en macOS: `brew install webp`). El script recorre todas las carpetas `jpg/` del repositorio y genera los `.webp` que falten o estén desactualizados en la carpeta `webp/` correspondiente.

## Generación de previews para redes sociales

Las imágenes en `redes/` (1200×628, `.jpg`) son las que muestran WhatsApp, Facebook, X y LinkedIn al compartir un link de la web. Se generan con [`scripts/generar-redes-sociales.sh`](scripts/generar-redes-sociales.sh), en el mismo GitHub Action [`generar-previews.yml`](.github/workflows/generar-previews.yml), a partir de cada imagen en `jpg/`, `png/` y `svg/`:

- fotos: recorte centrado que llena todo el cuadro.
- svg: el dibujo completo, centrado sobre fondo blanco (esas apps no muestran svg).

Cada una tiene el mismo nombre que su original, con extensión `.jpg`. La web elige sola cuál usar (ver el README de piruetasxyz.github.io).

Para correrlo a mano hace falta `rsvg-convert` e ImageMagick (en macOS: `brew install librsvg imagemagick`):

```sh
scripts/generar-redes-sociales.sh
```
