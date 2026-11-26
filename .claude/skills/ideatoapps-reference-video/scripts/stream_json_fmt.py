#!/usr/bin/env python3
# Formats Claude Code's real stream-json events into readable lines (no content invented; just prints what the events contain).
import sys, json
C={'dim':'\x1b[2m','b':'\x1b[1m','g':'\x1b[32m','y':'\x1b[33m','c':'\x1b[36m','r':'\x1b[31m','x':'\x1b[0m'}
for line in sys.stdin:
    try: e=json.loads(line)
    except Exception: continue
    t=e.get('type')
    if t=='system' and e.get('subtype')=='init':
        print(f"{C['dim']}session start · model setting: {e.get('model')}{C['x']}",flush=True)
    elif t=='assistant':
        for b in e['message'].get('content',[]):
            if b.get('type')=='text' and b['text'].strip(): print(f"{C['c']}claude>{C['x']} {b['text'].strip()[:300]}",flush=True)
            elif b.get('type')=='tool_use':
                i=b.get('input',{}); a=i.get('command') or i.get('file_path') or ''
                print(f"{C['y']}tool  {b['name']}{C['x']} {str(a)[:120]}",flush=True)
    elif t=='user':
        for b in e['message'].get('content',[]) if isinstance(e['message'].get('content'),list) else []:
            if b.get('type')=='tool_result':
                c=b.get('content'); c=c if isinstance(c,str) else ' '.join(x.get('text','') for x in c if isinstance(x,dict))
                print(f"{C['dim']}  -> {c.strip()[:160].replace(chr(10),' | ')}{C['x']}",flush=True)
    elif t=='result':
        print(f"{C['g']}done{C['x']}  turns={e.get('num_turns')}  time={round(e.get('duration_ms',0)/1000,1)}s  {C['dim']}(Claude Code's cost estimate ignored: unknown model){C['x']}",flush=True)
