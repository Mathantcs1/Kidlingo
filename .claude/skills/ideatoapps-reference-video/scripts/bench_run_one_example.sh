#!/bin/bash
# usage: run_one.sh <task: simple|bug> <setup: A|B|C> <i>   -> appends one JSON line to results.jsonl. Real runs only; success is checked by us, not by the model.
TASK=$1; S=$2; I=$3; B=/home/user/ideatoapps-free-claude-code/demo-kit/bench; D=$B/runs/${TASK}_${S}_${I}; rm -rf "$D"; mkdir -p "$D"; cd "$D"
SIMPLE="Create todo.py, a tiny command-line to-do tool with add, list and done commands that stores items in todo.json. Then run it once to add 'buy milk' and list. Keep it under 40 lines."
BUG="The tests in test_inventory.py fail. Fix inventory.py so that all tests pass. Do not edit the test file. Run the tests to check."
if [ "$TASK" = bug ]; then cp $B/bugkit/*.py .; P="$BUG"; else P="$SIMPLE"; fi
M=nvidia/nemotron-3-ultra-550b-a55b:free; ST=$(date +%s.%N)
case $S in
 A) env -i HOME=/tmp/cc-demo-home PATH="$PATH" ANTHROPIC_BASE_URL=https://openrouter.ai/api ANTHROPIC_AUTH_TOKEN=proxy-injected ANTHROPIC_API_KEY= ANTHROPIC_MODEL=$M ANTHROPIC_DEFAULT_SONNET_MODEL=$M ANTHROPIC_DEFAULT_OPUS_MODEL=$M ANTHROPIC_DEFAULT_HAIKU_MODEL=$M CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 SSL_CERT_FILE=/root/.ccr/ca-bundle.crt NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt HTTPS_PROXY="$HTTPS_PROXY" https_proxy="$HTTPS_PROXY" timeout 180 claude -p "$P" --permission-mode acceptEdits --allowedTools "Write Edit Bash" --output-format json --max-turns 12 > out.json 2> err.txt ;;
 B) UK=$(cat /tmp/fc_unified); env -i HOME=/tmp/cc-demo-home2 PATH="$PATH" ANTHROPIC_BASE_URL=http://localhost:3001 ANTHROPIC_AUTH_TOKEN="$UK" ANTHROPIC_API_KEY= ANTHROPIC_MODEL=auto CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 timeout 180 claude -p "$P" --permission-mode acceptEdits --allowedTools "Write Edit Bash" --output-format json --max-turns 12 > out.json 2> err.txt ;;
 C) HOME=/tmp/oc-home timeout 180 /home/user/ideatoapps-free-claude-code/demo-kit/oc/node_modules/.bin/opencode run -m opencode/big-pickle "$P" > out.txt 2>&1 ;;
esac
RC=$?; SECS=$(echo "$(date +%s.%N) - $ST" | bc -l | cut -c1-5)
if [ "$TASK" = bug ]; then python3 -m unittest -q > check.txt 2>&1 && OK=1 || OK=0; [ "$(sha256sum test_inventory.py | cut -c1-64)" = "$(sha256sum $B/bugkit/test_inventory.py | cut -c1-64)" ] || OK=0
else rm -f todo.json; { python3 todo.py add "bench item" && python3 todo.py list; } > check.txt 2>&1; grep -q "bench item" check.txt && OK=1 || OK=0; fi
echo "{\"task\":\"$TASK\",\"setup\":\"$S\",\"i\":$I,\"secs\":$SECS,\"exit\":$RC,\"ok\":$OK}" >> $B/results.jsonl
