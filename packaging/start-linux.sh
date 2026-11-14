#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "ClipForge needs Node.js (free): https://nodejs.org"; exit 1; }
node server.mjs
