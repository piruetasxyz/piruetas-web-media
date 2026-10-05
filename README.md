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
  mp4/    videos, si hay (renders 3D, ...)
  webp/   previews en formato webp, generadas automáticamente a partir de jpg/
  redes/  previews de 1200×628 para redes sociales, generadas automáticamente a partir de jpg/, png/ y svg/
```

Solo `jpg/`, `png/`, `svg/` y `mp4/` se suben a mano; `webp/` y `redes/` no se editan nunca a mano.

Los archivos nuevos dentro de `jpg/` se nombran de forma descriptiva, en minúsculas y con guiones, según lo que muestra la foto (ej: `portada-foto-actividad.jpg`, `inicio-objetos-coleccion.jpg`). Cada `.webp` en `webp/` tiene el mismo nombre que su `.jpg`.

Algunas carpetas antiguas, como `2026-claudia-gonzalez-godoy-placas`, usan números de dos dígitos (`00.jpg`, `01.jpg`, ...).

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
