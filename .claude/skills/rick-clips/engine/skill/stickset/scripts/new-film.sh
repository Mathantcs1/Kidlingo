#!/bin/sh
# new-film.sh <name> --channel <pride-parables|brandwake> --format <short|long> [--style classic|sketch]
# Scaffolds films/<name>/ (script, build.sh, page, mix, metadata). Refuses an unfilled channel profile.
set -e
HERE=$(cd "$(dirname "$0")" && pwd); SK=$(cd "$HERE/.." && pwd)
ROOT=${STICKSET_ROOT:-$(cd "$SK/../.." && pwd)}
NAME=$1; shift || true; CH=; FMT=; STYLE=classic
while [ $# -gt 0 ]; do case "$1" in --channel) CH=$2; shift 2;; --format) FMT=$2; shift 2;; --style) STYLE=$2; shift 2;; *) echo "usage: new-film.sh <name> --channel <ch> --format <short|long> [--style classic|sketch]"; exit 2;; esac; done
[ -n "$NAME" ] && [ -n "$CH" ] && [ -n "$FMT" ] || { echo "usage: new-film.sh <name> --channel <ch> --format <short|long>"; exit 2; }
case "$STYLE" in classic) TPL=template; SCRIPT=script.md;; sketch) TPL=template-sketch; SCRIPT=script-sketch.md;; *) echo "unknown style \"$STYLE\" (use classic, sketch)"; exit 1;; esac
CHANNELS=$(ls "$SK"/profiles/*.md | xargs -n1 basename | sed 's/\.md$//' | sort | tr '\n' ' ' | sed 's/ $//; s/ /, /g')
[ -f "$SK/profiles/$CH.md" ] || { echo "unknown channel \"$CH\" (use $CHANNELS)"; exit 1; }
case "$FMT" in
  short) W=1080; H=1920; FPS=30; DW=540; DH=960
         RENDER='node core/render/video.mjs "$HERE" --fps 30 --size $SIZE --workers ${WORKERS:-3} --out "$HERE/out/video-$SIZE.mp4"'; VIDEO='video-$SIZE.mp4';;
  long)  W=1920; H=1080; FPS=24; DW=960; DH=540
         RENDER="sh \"$HERE/render-chapters.sh\" \"\$HERE\" \"\$LIB\" \$SIZE 24"; VIDEO='video-long.mp4';;
  *) echo "unknown format \"$FMT\" (use short, long)"; exit 1;;
esac
P=$SK/profiles/$CH.md   # allow-list: a profile is usable only when explicitly READY, has a voice and speed, and at least one answered brief bullet
if ! grep -q '^STATUS: READY$' "$P" || [ -z "$(sed -n 's/^voice: *//p' "$P" | head -1)" ] || [ -z "$(sed -n 's/^speed: *//p' "$P" | head -1)" ] || ! grep -Eq '^- [^:]+:[ ]*[^ ]' "$P"; then
  echo "profile needs a brief: ask the channel owner the questions in skill/stickset/profiles/$CH.md, write their answers there, then set STATUS: READY"; exit 1
fi
ENGINE=$(cd "$SK/../.." && pwd)
if [ "$ROOT" != "$ENGINE" ] && [ ! -e "$ROOT/core" ]; then   # project-folder mode: the films reach the engine core through <project>/core
  [ -d "$ENGINE/core" ] || { echo "engine core not found at $ENGINE/core: is the skill installed completely?"; exit 1; }
  mkdir -p "$ROOT" && ln -s "$ENGINE/core" "$ROOT/core"
fi
DIR=$ROOT/films/$NAME
[ ! -e "$DIR" ] || { echo "films/$NAME already exists; pick another name (never overwritten)"; exit 1; }
mkdir -p "$DIR"
cp "$SK/$TPL"/* "$DIR"/; cp "$SK/templates/$SCRIPT" "$DIR/script.md"; cp "$SK/templates/metadata.md" "$DIR"/
ln -sfn ../../core "$DIR/stickset"
{ echo "VOICE=$(sed -n 's/^voice: *//p' "$SK/profiles/$CH.md" | head -1)"; echo "SPEED=$(sed -n 's/^speed: *//p' "$SK/profiles/$CH.md" | head -1)"; echo "export VOICE SPEED"; } > "$DIR/channel.env"
sed -e "s|__STYLE__|$STYLE|g; s|__FORMAT__|$FMT|g; s|__W__|$W|g; s|__H__|$H|g; s|__DW__|$DW|g; s|__DH__|$DH|g; s|__FPS__|$FPS|g; s|__VIDEO__|$VIDEO|g; s|__RENDER__|$RENDER|" "$SK/templates/build.sh.tpl" > "$DIR/build.sh"
echo "created films/$NAME ($STYLE, $FMT, ${W}x${H} @ $FPS, channel $CH). Edit script.md, then: LIB=<lemo-opuscar> sh films/$NAME/build.sh draft"
