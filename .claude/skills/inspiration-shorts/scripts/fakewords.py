#!/usr/bin/env python3
"""LAYOUT-TEST ONLY: writes words.json (+ silent vo.mp3) with estimated timings from script.txt into <project>, so specs/QA/stills can be built
before any real voice is recorded. Use a scratch copy of the project; tts.py overwrites both files with the real recording.
usage: fakewords.py <project> [--wps 2.9]"""
import json, os, re, subprocess, sys
P = sys.argv[1]; wps = float(sys.argv[sys.argv.index('--wps') + 1]) if '--wps' in sys.argv else 2.9
text = open(os.path.join(P, 'script.txt')).read().split(); t = 0.3; out = []
for w in text:
    d = max(.18, len(re.sub(r'\W', '', w)) * .075 + .08); out.append({'w': w, 's': round(t, 3), 'e': round(t + d, 3)}); t += d + (.28 if re.search(r'[.?!:]$', w) else (.1 if w.endswith(',') else .03))
json.dump(out, open(os.path.join(P, 'words.json'), 'w'), indent=0)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', f'{t + .5:.2f}', '-q:a', '9', os.path.join(P, 'vo.mp3')], check=True)
print(len(out), 'fake words,', round(t, 1), 's (estimate; real voice will differ)')
