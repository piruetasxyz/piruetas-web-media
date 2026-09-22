#!/usr/bin/env bash
# Genera previews .webp para cada carpeta */jpg/ del repositorio,
# guardando el resultado en la carpeta hermana webp/.
# Uso: scripts/generar-webp.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v cwebp &> /dev/null; then
  echo "cwebp no esta instalado. En macOS: brew install webp" >&2
  exit 1
fi

CALIDAD=80

find . -type d -name jpg -not -path "./.git/*" | while read -r dir_jpg; do
  proyecto="$(dirname "$dir_jpg")"
  dir_webp="$proyecto/webp"
  mkdir -p "$dir_webp"
  find "$dir_jpg" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' \) | while read -r archivo; do
    nombre="$(basename "$archivo")"
    nombre_webp="${nombre%.*}.webp"
    destino="$dir_webp/$nombre_webp"
    if [ -f "$destino" ] && [ "$destino" -nt "$archivo" ]; then
      continue
    fi
    cwebp -quiet -q "$CALIDAD" "$archivo" -o "$destino"
  done
done

echo "Listo."
