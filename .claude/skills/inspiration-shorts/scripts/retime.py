#!/usr/bin/env python3
"""Reuse an EXISTING voiceover (no ElevenLabs credit): tighten long pauses and write words.json for the engine.
usage: retime.py <project> --audio voiceover.mp3 --words words.json [--max-gap 0.45]
words.json may be [{w,s,e}] or [{word,start,end}] or {"words":[...]} (whisper style). Writes <project>/vo.mp3 + <project>/words.json."""
import argparse, json, os, subprocess
ap = argparse.ArgumentParser(); ap.add_argument('project'); ap.add_argument('--audio', required=True); ap.add_argument('--words', required=True); ap.add_argument('--max-gap', type=float, default=.45)
a = ap.parse_args(); P = a.project; os.makedirs(P, exist_ok=True)
raw = json.load(open(a.words)); raw = raw['words'] if isinstance(raw, dict) else raw
words = [{'w': x.get('w', x.get('word')), 's': x.get('s', x.get('start')), 'e': x.get('e', x.get('end'))} for x in raw]
segs = []; cs = [max(0, words[0]['s'] - .05), words[0]['e'] + .05]
for x, y in zip(words, words[1:]):
    if y['s'] - x['e'] > a.max_gap: cs[1] = x['e'] + .12; segs.append(cs); cs = [y['s'] - .10, y['e'] + .05]
    else: cs[1] = y['e'] + .05
cs[1] = words[-1]['e'] + .35; segs.append(cs)
m = []; t = 0
for s0, s1 in segs: m.append((s0, s1, t)); t += s1 - s0
def remap(x):
    for s0, s1, o in m:
        if s0 - 1e-6 <= x <= s1 + 1e-6: return o + (x - s0)
fc = ''.join(f'[0:a]atrim={s0:.3f}:{s1:.3f},asetpts=PTS-STARTPTS[a{i}];' for i, (s0, s1, o) in enumerate(m)) + ''.join(f'[a{i}]' for i in range(len(m))) + f'concat=n={len(m)}:v=0:a=1[out]'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.audio, '-filter_complex', fc, '-map', '[out]', os.path.join(P, 'vo.mp3')], check=True)
json.dump([{'w': w['w'], 's': round(remap(w['s']), 3), 'e': round(remap(w['e']), 3)} for w in words], open(os.path.join(P, 'words.json'), 'w'))
print(f'{len(words)} words; narration {t:.1f}s (was {words[-1]["e"]:.1f}s)')
