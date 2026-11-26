#!/usr/bin/env python3
"""Chapters + SRT from the studio timeline. usage: python3 make_pack.py projects/<name> "Chapter 1|Chapter 2|..." (one name per scene, in order)
Writes out/upload_pack/chapters.txt and captions.srt. Then write description/tags/pinned comment from templates/example_description.txt."""
import json, os, re, sys
P = sys.argv[1]; names = sys.argv[2].split('|'); O = f'{P}/out/upload_pack/'; os.makedirs(O, exist_ok=True)
sc = json.load(open(f'{P}/timeline/scene_times.json')); mm = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"
open(O + 'chapters.txt', 'w').write('\n'.join(f"{mm(x['start'])} {n}" for x, n in zip(sc, names)) + '\n')
w = json.load(open(f'{P}/timeline/words.json')); w = w['words'] if isinstance(w, dict) else w
ts = lambda t: f"{int(t // 3600):02d}:{int(t % 3600 // 60):02d}:{int(t % 60):02d},{int(round((t % 1) * 1000)):03d}"; cues = []; cur = []
for x in w:
    if cur and (len(cur) >= 7 or x['start'] - cur[-1]['end'] > 0.6 or x['end'] - cur[0]['start'] > 3.4 or re.search(r'[.?!]$', cur[-1]['word'])): cues.append(cur); cur = []
    cur.append(x)
if cur: cues.append(cur)
open(O + 'captions.srt', 'w').write('\n'.join(f"{i}\n{ts(c[0]['start'])} --> {ts(c[-1]['end'] + 0.3)}\n{' '.join(x['word'] for x in c)}\n" for i, c in enumerate(cues, 1)))
print(len(sc), 'chapters,', len(cues), 'caption cues ->', O)
