#!/bin/bash
# Builds release/clipforge-mvp.zip from a fresh production build. Run from the repo root: bash packaging/build-zip.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf release/clipforge-mvp release/clipforge-mvp.zip
mkdir -p release/clipforge-mvp
cp -R dist release/clipforge-mvp/app
cp packaging/server.mjs packaging/README-FIRST.txt packaging/LICENSE-TERMS.txt \
   packaging/start-mac.command packaging/start-windows.bat packaging/start-linux.sh release/clipforge-mvp/
grep -rl "__clipforge" release/clipforge-mvp/app && { echo "dev hook found in build"; exit 1; } || true
(cd release && zip -qr clipforge-mvp.zip clipforge-mvp -x '*.DS_Store')
echo "built release/clipforge-mvp.zip ($(du -h release/clipforge-mvp.zip | cut -f1))"
