#!/bin/sh
# render-chapters.sh <film-dir> <lib> <size WxH> <fps>
# Renders each chapter of <film-dir>/timeline.json as its own video (page window ?from=&to=), skips chapters whose content hash
# is unchanged ("skip chapter-NN"), then joins them losslessly into out/video-long.mp4. Env: CH_MIN, CH_MAX (seconds, default 20/40), WORKERS.
set -e
FILM=$1; LIB=$2; SIZE=$3; FPS=$4
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$FILM/out"; export LEMO_ANGLE=${LEMO_ANGLE:-swiftshader}
node "$HERE/chapters-plan.mjs" "$FILM/timeline.json" "${CH_MIN:-20}" "${CH_MAX:-40}" "$SIZE-$FPS" "$FPS" > "$FILM/out/chapters.txt"
: > "$FILM/out/concat.txt"
while read -r id from to hash; do
  out="$FILM/out/$id-$SIZE.mp4"
  if [ -f "$out" ] && [ "$(cat "$out.done" 2>/dev/null)" = "$hash" ]; then
    echo "skip $id"
  else
    rm -f "$out" "$out.done"
    (cd "$LIB" && node core/render/video.mjs "$FILM" --fps "$FPS" --size "$SIZE" --q "from=$from&to=$to" --workers "${WORKERS:-3}" --out "$out" > /dev/null)
    echo "$hash" > "$out.done"
    echo "rendered $id ($from-$to s)"
  fi
  echo "file '$out'" >> "$FILM/out/concat.txt"
done < "$FILM/out/chapters.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$FILM/out/concat.txt" -c copy "$FILM/out/video-long.mp4"
echo "joined → $FILM/out/video-long.mp4"
