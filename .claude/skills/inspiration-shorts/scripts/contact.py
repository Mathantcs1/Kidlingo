#!/usr/bin/env python3
"""contact sheet of stills at word refs or seconds: contact.py <proj> "hook:1.0,Three-0.15,midnight+0.5" [cols=5] -> <proj>/out/contact.png
Each entry is seconds or a word ref (word, word#2, +/- offset), same syntax as spec time refs."""
import json, os, re, subprocess, sys
from PIL import Image, ImageDraw
P = sys.argv[1]; refs = sys.argv[2].split(','); cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
W = json.load(open(os.path.join(P, 'words.json')))
def norm(s): return re.sub(r"[^a-z0-9']", '', s.lower())
def R(ref):
    try: return float(ref)
    except ValueError: pass
    m = re.match(r"^([A-Za-z0-9']+)(?:#(\d+))?(@end)?([+-]\d*\.?\d+)?$", ref)
    w, n, e, off = m.group(1), int(m.group(2) or 1), m.group(3), float(m.group(4) or 0); k = 0
    for x in W:
        if norm(x['w']) == norm(w):
            k += 1
            if k == n: return (x['e'] if e else x['s']) + off
    raise SystemExit('word not found: ' + ref)
ts = [R(r) for r in refs]
subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'render.mjs'), P, 'stills', ','.join(f'{t:.3f}' for t in ts)], check=True)
ims = []
for r, t in zip(refs, ts):
    im = Image.open(os.path.join(P, 'out', f'still_{t:.3f}.png' if os.path.exists(os.path.join(P, 'out', f'still_{t:.3f}.png')) else f'still_{round(t,3)}.png')).convert('RGB').resize((360, 640))
    ImageDraw.Draw(im).text((8, 6), f'{r} {t:.1f}s', fill='#ffff00'); ims.append(im)
rows = (len(ims) + cols - 1) // cols; sheet = Image.new('RGB', (360 * cols, 640 * rows), 'black')
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * 360, (i // cols) * 640))
sheet.save(os.path.join(P, 'out', 'contact.png')); print('contact.png', len(ims))
