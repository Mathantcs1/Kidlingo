#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "ClipForge needs Node.js (free). Install the LTS version from https://nodejs.org then double-click this file again."
  read -r -p "Press Enter to close"; exit 1
fi
node server.mjs
