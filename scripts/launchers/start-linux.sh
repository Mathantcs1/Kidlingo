#!/bin/sh
# ClipForge launcher (Linux). Starts a tiny local web server (serve.py or serve.mjs) for the app/ folder and opens it in your browser.
# Set CLIPFORGE_NO_OPEN=1 to skip opening the browser; set CLIPFORGE_PORT to use another port (default 8123).
case "$0" in */*) DIR=${0%/*} ;; *) DIR=. ;; esac
cd "$DIR" || exit 1

PORT=${CLIPFORGE_PORT:-8123}
URL="http://localhost:$PORT"

# Python 3.7 or newer (the python3 / python names are tried in this order).
is_python3() {
  command -v "$1" >/dev/null 2>&1 && "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' >/dev/null 2>&1
}

open_browser_soon() {
  [ "$CLIPFORGE_NO_OPEN" = "1" ] && return 0
  command -v xdg-open >/dev/null 2>&1 || return 0
  ( sleep 1; xdg-open "$URL" ) >/dev/null 2>&1 &
}

if is_python3 python3; then
  open_browser_soon
  exec python3 serve.py
elif is_python3 python; then
  open_browser_soon
  exec python serve.py
elif command -v node >/dev/null 2>&1; then
  open_browser_soon
  exec node serve.mjs
fi

echo "Install Python 3 (python.org) or Node.js (nodejs.org), then run this again" >&2
exit 1
