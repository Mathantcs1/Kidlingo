#!/bin/bash
source "$(dirname "$0")/scene_common.sh"
D=/home/user/ideatoapps-free-claude-code/demo-kit/rec/box1; mkdir -p $D; cd $D
M=nvidia/nemotron-3-ultra-550b-a55b:free
say "Setup A: Claude Code -> OpenRouter, free model. Sample task, empty folder."
show "ls -A   # empty sample folder"; ls -A; 
show "export ANTHROPIC_BASE_URL=https://openrouter.ai/api  ANTHROPIC_AUTH_TOKEN=<my free-tier key, hidden>  ANTHROPIC_MODEL=$M"
show "claude -p \"$PROMPT\" --output-format stream-json"
env -i HOME=/tmp/cc-demo-home PATH="$PATH" ANTHROPIC_BASE_URL=https://openrouter.ai/api ANTHROPIC_AUTH_TOKEN=proxy-injected ANTHROPIC_API_KEY= ANTHROPIC_MODEL=$M ANTHROPIC_DEFAULT_SONNET_MODEL=$M ANTHROPIC_DEFAULT_OPUS_MODEL=$M ANTHROPIC_DEFAULT_HAIKU_MODEL=$M CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 SSL_CERT_FILE=/root/.ccr/ca-bundle.crt NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt HTTPS_PROXY="$HTTPS_PROXY" https_proxy="$HTTPS_PROXY" \
 timeout 300 claude -p "$PROMPT" --permission-mode acceptEdits --allowedTools "Write Edit Bash" --output-format stream-json --verbose --max-turns 8 2>/dev/null | python3 ../fmt.py
say "Check it ourselves:"
show "ls -A && python3 todo.py add 'check two' && python3 todo.py list"; ls -A; python3 todo.py add 'check two'; python3 todo.py list
say "Real spend on my OpenRouter account:"
show "curl openrouter.ai/api/v1/credits"; curl -s https://openrouter.ai/api/v1/credits -H "Authorization: Bearer proxy-injected"; echo
sleep 2
