#!/usr/bin/env python3
"""After gen_vo.py: rebuild scenes/sets/fc_times.js (per-line start/end + scene starts) and config.json duration.
usage: python3 regen_times.py projects/<name>"""
import json, subprocess, sys
P = sys.argv[1]
c = json.load(open(f'{P}/config.json')); d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'{P}/input/voiceover.mp3']).decode())
c['duration'] = round(d, 3); json.dump(c, open(f'{P}/config.json', 'w'), indent=1)
st = json.load(open(f'{P}/timeline/shot_times.json')); sc = json.load(open(f'{P}/timeline/scene_times.json'))
open(f'{P}/scenes/sets/fc_times.js', 'w').write('// per-VO-line start/end (global seconds); regenerate if voice changes\nexport const LT = ' + json.dumps({k: [round(v['start'], 2), round(v['end'], 2)] for k, v in st.items()}) + ';\nexport const SC = ' + json.dumps([round(x['start'], 2) for x in sc] + [round(sc[-1]['start'] + sc[-1]['dur'], 2)]) + ';\n')
print('voiceover', round(d, 1), 's;', len(st), 'shots;', len(sc), 'scenes')
