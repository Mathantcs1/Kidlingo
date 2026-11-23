#!/bin/sh
# check-video.sh <file> <width> <height> <fps> <duration-seconds> [tolerance=0.15]
# Verifies size, frame rate, duration and that there are no black stretches. Prints FAIL: lines; exit 1 on any failure.
F=$1; W=$2; H=$3; FPS=$4; DUR=$5; TOL=${6:-0.15}
fail=0
f() { echo "FAIL: $1"; fail=1; }
info=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration -of default=nw=1 "$F") || { echo "FAIL: unreadable $F"; exit 1; }
w=$(echo "$info" | sed -n 's/^width=//p'); h=$(echo "$info" | sed -n 's/^height=//p')
r=$(echo "$info" | sed -n 's/^r_frame_rate=//p'); d=$(echo "$info" | sed -n 's/^duration=//p')
[ "$w" = "$W" ] && [ "$h" = "$H" ] || f "size ${w}x${h} expected ${W}x${H}"
awk -v r="$r" -v e="$FPS" 'BEGIN{split(r,a,"/"); v=a[1]/(a[2]?a[2]:1); exit !(v>e-0.01 && v<e+0.01)}' || f "fps $r expected $FPS"
awk -v d="$d" -v e="$DUR" -v t="$TOL" 'BEGIN{x=d-e; if(x<0)x=-x; exit !(x<=t)}' || f "duration $d expected $DUR ±$TOL"
if ffmpeg -v info -i "$F" -vf "blackdetect=d=0.1:pix_th=0.05" -an -f null - 2>&1 | grep -q "black_start"; then f "black frames detected"; fi
[ $fail = 0 ] && echo "OK: $F ${w}x${h} $r ${d}s"
exit $fail
