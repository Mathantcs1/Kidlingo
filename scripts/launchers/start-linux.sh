#!/bin/sh
# ClipForge launcher (Linux). Starts a tiny local web server (serve.py or serve.mjs) for the app/ folder and opens it in your browser.
# Set CLIPFORGE_NO_OPEN=1 to skip opening the browser; set CLIPFORGE_PORT to use another port (default 8123).
case "$0" in */*) DIR=${0%/*} ;; *) DIR=. ;; esac
cd "$DIR" || exit 1

CLIPFORGE_PORT=${CLIPFORGE_PORT:-8123}
export CLIPFORGE_PORT
URL="http://localhost:$CLIPFORGE_PORT"

# Python 3.7 or newer (the python3 / python names are tried in this order).
is_python3() {
  command -v "$1" >/dev/null 2>&1 && "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)' >/dev/null 2>&1
}

# run_server <interpreter> <script>: runs the server, opens the browser only once it answers, and reports a failed start.
run_server() {
  "$1" "$2" &
  SERVER=$!
  trap 'kill "$SERVER" 2>/dev/null; exit 130' INT TERM
  WATCHER=
  if [ "$CLIPFORGE_NO_OPEN" != "1" ] && command -v xdg-open >/dev/null 2>&1; then
    (
      i=0
      while [ "$i" -lt 25 ]; do
        kill -0 "$SERVER" 2>/dev/null || exit 0 # the server has exited: never open the browser
        if "$1" "$2" --check >/dev/null 2>&1; then
          xdg-open "$URL" >/dev/null 2>&1
          exit 0
        fi
        i=$((i + 1))
        sleep 0.2 2>/dev/null || sleep 1
      done
    ) &
    WATCHER=$!
  fi
  wait "$SERVER"
  STATUS=$?
  [ -n "$WATCHER" ] && kill "$WATCHER" 2>/dev/null
  if [ "$STATUS" -ne 0 ] && [ "$STATUS" -lt 128 ]; then
    echo "ClipForge could not start. Is another program using port $CLIPFORGE_PORT? Close it, or set CLIPFORGE_PORT to another number and run again." >&2
  fi
  exit "$STATUS"
}

if is_python3 python3; then
  run_server python3 serve.py
elif is_python3 python; then
  run_server python serve.py
elif command -v node >/dev/null 2>&1; then
  run_server node serve.mjs
fi

echo "Install Python 3 (python.org) or Node.js (nodejs.org), then run this again" >&2
exit 1
