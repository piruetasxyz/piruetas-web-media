#!/usr/bin/env bash
# Genera las imagenes de preview para redes sociales (WhatsApp,
# Facebook, X, LinkedIn): un .jpg de 1200x628 por cada imagen de las
# carpetas */jpg/, */png/ y */svg/ del repositorio, guardado en la
# carpeta hermana redes/ con el mismo nombre y extension .jpg.
#   - fotos (jpg/png): recorte centrado que llena todo el cuadro.
#   - svg: el dibujo completo, centrado sobre fondo blanco (las apps
#     no muestran svg como preview).
# La web (scripts/lib/plantillas-sitio.js en piruetasxyz.github.io)
# apunta og:image a redes/<nombre>.jpg segun la imagen de cada pagina.
# Uso: scripts/generar-redes-sociales.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v rsvg-convert &> /dev/null; then
  echo "rsvg-convert no esta instalado. En macOS: brew install librsvg" >&2
  exit 1
fi

if command -v magick &> /dev/null; then
  IMAGEMAGICK=magick
elif command -v convert &> /dev/null; then
  IMAGEMAGICK=convert
else
  echo "ImageMagick no esta instalado. En macOS: brew install imagemagick" >&2
  exit 1
fi

ANCHO=1200
ALTO=628
MARGEN_SVG=40
CALIDAD=85

temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT

find . -type f -not -path "./.git/*" \
  \( -path '*/jpg/*' -o -path '*/png/*' -o -path '*/svg/*' \) \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.svg' \) |
  while read -r archivo; do
    proyecto="$(dirname "$(dirname "$archivo")")"
    nombre="$(basename "$archivo")"
    dir_redes="$proyecto/redes"
    destino="$dir_redes/${nombre%.*}.jpg"
    mkdir -p "$dir_redes"

    case "$nombre" in
      *.svg|*.SVG)
        png="$temporal/${nombre%.*}.png"
        rsvg-convert --keep-aspect-ratio \
          -w $((ANCHO - 2 * MARGEN_SVG)) -h $((ALTO - 2 * MARGEN_SVG)) \
          --background-color white \
          "$archivo" -o "$png"
        "$IMAGEMAGICK" "$png" -background white -gravity center \
          -extent "${ANCHO}x${ALTO}" -flatten -strip -quality "$CALIDAD" "$destino"
        ;;
      *)
        "$IMAGEMAGICK" "$archivo" -auto-orient -background white -flatten \
          -resize "${ANCHO}x${ALTO}^" -gravity center -extent "${ANCHO}x${ALTO}" \
          -strip -quality "$CALIDAD" "$destino"
        ;;
    esac
  done

echo "Listo."
