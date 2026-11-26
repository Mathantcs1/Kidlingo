say(){ printf '\n\x1b[1;35m# %s\x1b[0m\n' "$*"; sleep 1.2; }
show(){ printf '\x1b[32m$\x1b[0m %s\n' "$*"; sleep 0.8; }
PROMPT="Create todo.py, a tiny command-line to-do tool with add, list and done commands that stores items in todo.json. Then run it once to add 'buy milk' and list. Keep it under 40 lines."
