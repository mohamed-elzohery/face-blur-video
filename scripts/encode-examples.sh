#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/examples"
NAMES=(fast-moving multi-face children)

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found on PATH. Install with: brew install ffmpeg" >&2
  exit 1
fi

for name in "${NAMES[@]}"; do
  for variant in before after; do
    SRC="$DIR/$name-$variant.mp4"
    if [[ ! -f "$SRC" ]]; then
      echo "skip (missing): $SRC" >&2
      continue
    fi
    TMP="$DIR/.$name-$variant.tmp.mp4"
    POSTER="$DIR/$name-$variant.jpg"

    echo "encoding $name-$variant ..."
    ffmpeg -y -loglevel error -i "$SRC" \
      -vf "scale=-2:720,fps=30" \
      -c:v libx264 -profile:v high -crf 24 -preset slow \
      -pix_fmt yuv420p -movflags +faststart -an "$TMP"
    mv "$TMP" "$SRC"

    echo "poster $name-$variant ..."
    ffmpeg -y -loglevel error -i "$SRC" -frames:v 1 -q:v 3 "$POSTER"
  done
done

echo "done. sizes:"
du -h "$DIR"/*.mp4
