#!/usr/bin/env bash
# Genera un .jpg de 1200x628 (tamaño de preview de redes sociales) para
# cada archivo de las carpetas */svg/ del repositorio, guardando el
# resultado en la carpeta hermana jpg/ con el mismo nombre.
# WhatsApp/Facebook/X/LinkedIn no muestran SVG como preview, asi que
# estos jpg sirven como imagen_social en datos.yaml de la web.
# Uso: scripts/generar-jpg-desde-svg.sh
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
MARGEN=40
CALIDAD=90

temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT

find . -type d -name svg -not -path "./.git/*" | while read -r dir_svg; do
  proyecto="$(dirname "$dir_svg")"
  dir_jpg="$proyecto/jpg"
  mkdir -p "$dir_jpg"
  find "$dir_svg" -maxdepth 1 -type f -iname '*.svg' | while read -r archivo; do
    nombre="$(basename "$archivo")"
    destino="$dir_jpg/${nombre%.*}.jpg"
    png="$temporal/${nombre%.*}.png"
    # renderiza el svg dentro de la caja util (sin margen) y despues lo
    # centra sobre un fondo blanco del tamaño final
    rsvg-convert --keep-aspect-ratio \
      -w $((ANCHO - 2 * MARGEN)) -h $((ALTO - 2 * MARGEN)) \
      --background-color white \
      "$archivo" -o "$png"
    "$IMAGEMAGICK" "$png" -background white -gravity center \
      -extent "${ANCHO}x${ALTO}" -flatten -strip -quality "$CALIDAD" "$destino"
  done
done

echo "Listo."
