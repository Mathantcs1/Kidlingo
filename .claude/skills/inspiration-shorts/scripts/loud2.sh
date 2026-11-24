#!/bin/sh
# two-pass loudness to -14 LUFS / TP -1.5 on the finished master (video stream copied, audio re-encoded AAC 192k 48 kHz stereo)
# usage: loud2.sh <project>   -> writes <project>/out/short_final.mp4 and prints measured loudness
set -e
P=$(cd "$1" && pwd); IN="$P/out/short.mp4"; OUT="$P/out/short_final.mp4"
M=$(ffmpeg -hide_banner -nostats -i "$IN" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$M" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$IN" -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aformat=sample_rates=48000:channel_layouts=stereo" -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "$OUT"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tail -2 | sed 's/^/final /'
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | sed 's/^/duration /'
