#!/bin/sh
# ClipForge launcher (Linux). Starts a tiny local web server for the app/ folder and opens it in your browser.
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
  echo "ClipForge is running at $URL (stop it with Ctrl+C or by closing this window)."
  open_browser_soon
  exec python3 -m http.server "$PORT" --directory app
elif is_python3 python; then
  echo "ClipForge is running at $URL (stop it with Ctrl+C or by closing this window)."
  open_browser_soon
  exec python -m http.server "$PORT" --directory app
elif command -v npx >/dev/null 2>&1; then
  echo "ClipForge is running at $URL (stop it with Ctrl+C or by closing this window)."
  open_browser_soon
  exec npx --yes serve app -l "$PORT"
fi

echo "Install Python 3 (python.org) or Node.js (nodejs.org), then run this again" >&2
exit 1
