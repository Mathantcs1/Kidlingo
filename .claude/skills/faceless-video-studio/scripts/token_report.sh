#!/bin/bash
# Usage: token_report.sh [daily|session|monthly]  -- local, read-only token report (ccusage, MIT, pinned)
set -u
cd /tmp && timeout 180 npx --yes ccusage@20.0.51 "${1:-daily}" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | head -60
