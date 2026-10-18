#!/usr/bin/env bash
set -euo pipefail

mkdir -p assets/optimized

if command -v magick >/dev/null 2>&1; then
  image_tool=(magick)
else
  image_tool=(convert)
fi

for source in assets/source/*.jpg; do
  base="$(basename "${source%.jpg}")"
  "${image_tool[@]}" "$source" \
    -auto-orient \
    -resize '1600x1600>' \
    -strip \
    -quality 78 \
    "assets/optimized/${base}.webp"
done
