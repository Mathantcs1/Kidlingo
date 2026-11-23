#!/bin/sh
# Helper for the optional Lemo-Opuscar library (https://github.com/lemomo-ai/lemo-opuscar, code MIT; guides CC BY-NC + permission for your own films).
#   lemo.sh path            print the library path (clones it shallowly to ~/lemo-opuscar if missing)
#   lemo.sh index           list the 99 styles (folder, name) 
#   lemo.sh find <word>     search styles by keyword
#   lemo.sh style <slug>    print the STYLE.md for one style
#   lemo.sh guides          print the paths of DIRECTOR.md / TECHNIQUE.md
#   lemo.sh deps [voice|music]   install its render/audio dependencies (~350 MB; run only when a Lemo style is chosen)
# Guides are read, never copied into other projects.
set -e
LIB=${LEMO_OPUSCAR:-$HOME/lemo-opuscar}
ensure() {
  if [ ! -f "$LIB/DIRECTOR.md" ]; then
    echo "cloning Lemo-Opuscar to $LIB ..." >&2
    GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/lemomo-ai/lemo-opuscar "$LIB" >&2
  fi
}
cmd=${1:-path}; shift || true
case "$cmd" in
  path) ensure; echo "$LIB" ;;
  index) ensure; grep -E '^\| [A-Z0-9]' "$LIB/styles/README.md" | grep '`' | sed -E 's/^\| ([^|]*)\|[^|]*\| \[`([^`]*)`\].*/\2\t\1/' ;;
  find) ensure; "$0" index | grep -i -- "$1" || echo "no style matches '$1'" ;;
  style) ensure; cat "$LIB/styles/$1/STYLE.md" ;;
  guides) ensure; echo "$LIB/DIRECTOR.md"; echo "$LIB/TECHNIQUE.md"; echo "$LIB/AGENTS.md" ;;
  deps) ensure; sh "$LIB/plugin/skills/lemo-opuscar/scripts/setup.sh" deps "$@" ;;
  *) echo "usage: lemo.sh path|index|find <word>|style <slug>|guides|deps [voice|music]"; exit 2 ;;
esac
