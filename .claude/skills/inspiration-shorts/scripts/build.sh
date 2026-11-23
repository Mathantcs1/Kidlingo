#!/bin/sh
# usage: build.sh <project> [--music file.mp3]   -- narration must already exist (tts.py). Stops on QA errors.
set -e
SK=$(cd "$(dirname "$0")/.." && pwd); P=$(cd "$1" && pwd); shift || true
export NODE_PATH=${NODE_PATH:-$(npm root -g)}
mkdir -p "$P/out"
node "$SK/scripts/qa.mjs" "$P"                       # layout gate: exits 1 on overlaps / off-frame text
node "$SK/scripts/render.mjs" "$P" events
python3 "$SK/scripts/sfx.py" "$P" "$@"
node "$SK/scripts/render.mjs" "$P" frames 30 png      # lossless frames: no JPEG banding in gradients
# upload master: 12 Mbps H.264 High, yuv420p, faststart, stereo AAC 48 kHz, ~-14 LUFS, true peak -1.5 dB
ffmpeg -v error -y -framerate 30 -i "$P/out/fr/%05d.png" -i "$P/out/mix.wav" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p \
  -b:v 12M -maxrate 16M -bufsize 24M -g 60 -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo" -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest "$P/out/short.mp4"
ffmpeg -v error -y -ss 0.4 -i "$P/out/short.mp4" -frames:v 1 "$P/out/poster.jpg"
echo "--- checks"; ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of compact "$P/out/short.mp4"
ffmpeg -hide_banner -nostats -i "$P/out/short.mp4" -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | sed 's/^/loudness /'
ffmpeg -hide_banner -nostats -i "$P/out/short.mp4" -vf blackdetect=d=0.15:pix_th=0.05 -an -f null - 2>&1 | grep -c black_start | sed 's/^/black segments: /'
echo "done: $P/out/short.mp4"
