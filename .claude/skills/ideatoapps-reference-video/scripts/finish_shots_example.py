"""Rebuild shots.json for ideatoapps-freeclaude (idempotent): build_shots_ia + title + meaningful transitions."""
import json, subprocess, sys
P = 'projects/ideatoapps-freeclaude'
subprocess.check_call(['python3', 'tools/build_shots_ia.py', P])
d = json.load(open(f'{P}/story/shots.json')); d['title'] = "I Tested Every 'Free Claude Code' Setup (the truth)"
IN = {'S01': 'cut', 'S02': 'dip', 'S03': 'whip', 'S04': 'whip', 'S05': 'whip', 'S06': 'whip', 'S07': 'zoom', 'S08': 'whip', 'S09': 'dip', 'S10': 'lightleak', 'S11': 'ripple'}
for s in d['shots']: s['in'] = {'type': IN.get(s['src'], 'whip')}
json.dump(d, open(f'{P}/story/shots.json', 'w'), indent=1); print({s['src']: s['in']['type'] for s in d['shots']})
