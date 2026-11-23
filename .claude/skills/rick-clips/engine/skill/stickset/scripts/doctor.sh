#!/bin/sh
# Stickset doctor: check the toolchain, optionally install. Last stdout line is LIB=<path>.
#   sh doctor.sh            report only; exit 1 if anything is MISSING
#   sh doctor.sh --install  also fetch static ffmpeg 7 and Lemo's deps (core + voice)
LIB=${LEMO_OPUSCAR_HOME:-$HOME/lemo-opuscar}
REPO=${LEMO_REPO:-https://github.com/lemomo-ai/lemo-opuscar.git}
missing=0
miss() { echo "MISSING: $1"; missing=1; }

ver_ge() { # ver_ge "<x.y.z>" <major>
  [ "$(printf '%s' "$1" | cut -d. -f1 | tr -dc 0-9)" -ge "$2" ] 2>/dev/null
}
# ffmpeg version line: "version 7.0.2 ..." or a git-master static build "version N-71064-g... " (counts as >=7)
ff_major() {
  v=$(ffmpeg -version 2>/dev/null | sed -n 's/^ffmpeg version \([^ ]*\).*/\1/p' | head -1)
  case "$v" in N-*|git-*) echo 99 ;; *) printf '%s' "$v" | cut -d. -f1 | tr -dc 0-9 ;; esac
}

if [ "$1" = "--install" ]; then
  if ! ver_ge "$(ff_major)" 7; then
    mkdir -p "$HOME/.local/bin"
    url=https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz
    if curl -fsSL "$url" -o /tmp/ffmpeg-static.tar.xz; then
      tar -xf /tmp/ffmpeg-static.tar.xz -C /tmp
      d=$(ls -d /tmp/ffmpeg-git-*-amd64-static | head -1)
      cp "$d/ffmpeg" "$d/ffprobe" "$HOME/.local/bin/"
      PATH="$HOME/.local/bin:$PATH"
    else
      echo "BLOCKED: could not download $url (check network allowlist for johnvansickle.com)"
    fi
  fi
  if [ ! -f "$LIB/AGENTS.md" ]; then   # relocatable skill: fetch the (MIT) Lemo-Opuscar render/voice library on first use
    echo "cloning the Lemo-Opuscar library into $LIB"
    git clone --depth 1 "$REPO" "$LIB" || echo "BLOCKED: could not clone $REPO (network?)"
  fi
  [ -f "$LIB/AGENTS.md" ] && [ -z "$LEMO_SKIP_DEPS" ] && LEMO_OPUSCAR_HOME="$LIB" sh "$LIB/plugin/skills/lemo-opuscar/scripts/setup.sh" deps voice
fi

NODE=$(node -v 2>/dev/null | tr -d v)
ver_ge "$NODE" 20 || miss "node>=20"

ver_ge "$(ff_major)" 7 || miss "ffmpeg>=7"

python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null || miss "python>=3.11"

[ -f "$LIB/AGENTS.md" ] || miss "lemo-opuscar library at $LIB"
[ -d "$LIB/node_modules" ] || miss "lemo node_modules (run: doctor.sh --install)"
[ -x "$LIB/.venv/bin/python" ] || miss "lemo python venv (run: doctor.sh --install)"

echo "LIB=$LIB"
exit $missing
