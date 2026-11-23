#!/usr/bin/env python3
"""Narration with word timings (ElevenLabs), pauses tightened for Shorts.
usage: tts.py <project> [--voice VOICE_ID] [--speed 1.05] [--max-gap 0.45]
reads <project>/script.txt ; writes <project>/vo.mp3 and <project>/words.json
Write numbers as words in script.txt ("fifty thousand"): the on-screen text carries the digits."""
import argparse, base64, json, os, re, subprocess, sys, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('project'); ap.add_argument('--voice', default=None)
ap.add_argument('--speed', type=float, default=1.05); ap.add_argument('--max-gap', type=float, default=.45)
ap.add_argument('--stability', type=float, default=.4); ap.add_argument('--style', type=float, default=.35)
a = ap.parse_args()
P = a.project
text = open(os.path.join(P, 'script.txt')).read().strip()
if re.search(r'\d', text): print('WARNING: digits in script.txt; spell numbers out so word timings match speech', file=sys.stderr)
voice = a.voice
if not voice:
    try:
        sp = json.load(open(os.path.join(P, 'spec.json')))
        voice = (sp.get('voice') or {}).get('id')
        if not voice and sp.get('kitFile'): voice = (json.load(open(os.path.join(P, sp['kitFile']))).get('voice') or {}).get('id')
    except Exception: pass
voice = voice or 'TX3LPaxmHKxFdv7VOQHJ'  # Liam: energetic social-media creator
req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128',
    data=json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2', 'voice_settings': {'stability': a.stability, 'similarity_boost': .75, 'style': a.style, 'speed': a.speed}}).encode(),
    headers={'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req, timeout=120))
raw = os.path.join(P, 'vo_raw.mp3'); open(raw, 'wb').write(base64.b64decode(r['audio_base64']))
al = r['alignment']; words = []; cur = ''; s = e = 0
for c, t0, t1 in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']):
    if c.isspace():
        if cur: words.append({'w': cur, 's': s, 'e': e}); cur = ''
    else:
        if not cur: s = t0
        cur += c; e = t1
if cur: words.append({'w': cur, 's': s, 'e': e})
# tighten: shrink silences longer than max-gap, remap word times
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
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-filter_complex', fc, '-map', '[out]', os.path.join(P, 'vo.mp3')], check=True)
out = [{'w': w['w'], 's': round(remap(w['s']), 3), 'e': round(remap(w['e']), 3)} for w in words]
json.dump(out, open(os.path.join(P, 'words.json'), 'w'), indent=0)
print(f'{len(out)} words, {t:.1f}s of narration')
