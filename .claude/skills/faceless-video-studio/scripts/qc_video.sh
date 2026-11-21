#!/bin/bash
# Usage: qc_video.sh <video.mp4> [out_dir]  -- decode check, stream info, audio level at 5 points, frame sheet
set -u
f="$1"; out="${2:-$(mktemp -d)}"
[ -f "$f" ] || { echo "no such file: $f"; exit 1; }
echo "== decode"; ffmpeg -v error -i "$f" -f null - 2>&1 | head -5; echo "(empty above = clean)"
echo "== streams"; ffprobe -v error -show_entries stream=codec_type,width,height,duration -of compact "$f"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
echo "== audio mean volume"
for p in 0.05 0.25 0.5 0.75 0.95; do
  t=$(python3 -c "print(round($dur*$p,2))")
  printf "@%ss " "$t"; ffmpeg -v info -ss "$t" -t 1.5 -i "$f" -vn -af volumedetect -f null - 2>&1 | grep -o "mean_volume.*" || echo "no audio"
done
echo "== frame sheet"
ffmpeg -v error -y -i "$f" -vf "fps=1,scale=200:-1,tile=10x3" -frames:v 1 "$out/qc_sheet.png" && echo "$out/qc_sheet.png"
