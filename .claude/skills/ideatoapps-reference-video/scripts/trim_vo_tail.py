#!/usr/bin/env python3
"""Remove a spoken tail from the LAST scene's voice without spending credits (keeps alignment + shot_texts consistent).
usage: python3 trim_vo_tail.py projects/<name> S11 " The voice is AI."   then edit brief/script.md the same way, rerun gen_vo.py (assembles) and regen_times.py."""
import json, os, shutil, subprocess, sys
P, S, tail = sys.argv[1], sys.argv[2], sys.argv[3]; a = f'{P}/input/vo/{S}.align.json'; m = f'{P}/input/vo/{S}.mp3'
os.makedirs(f'{P}/input/_{S}_orig', exist_ok=True); shutil.copy(a, f'{P}/input/_{S}_orig/'); shutil.copy(m, f'{P}/input/_{S}_orig/')
al = json.load(open(a)); A = al['alignment']; full = al['text']; assert full.endswith(tail), full[-40:]
cut = len(full) - len(tail); t_end = A['character_end_times_seconds'][cut - 1] + 0.25
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', m, '-t', f'{t_end:.3f}', '-af', f'afade=t=out:st={t_end - 0.12:.3f}:d=0.12', '-c:a', 'libmp3lame', '-b:a', '128k', m + '.tmp.mp3']); os.replace(m + '.tmp.mp3', m)
al['text'] = full[:cut]; al['shot_texts'][-1] = al['shot_texts'][-1][:-len(tail)]
for k in A: A[k] = A[k][:cut]
json.dump(al, open(a, 'w')); print('trimmed to', round(t_end, 2), 's')
