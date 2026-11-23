# sharpness.py <video> <timeline.json>: mean sharpness (variance of the Laplacian) of frames by time since each shot change.
import sys, json, subprocess, os, tempfile, numpy as np
from PIL import Image
video, tl = sys.argv[1], json.load(open(sys.argv[2]))
d = tempfile.mkdtemp(); subprocess.run(['ffmpeg', '-v', 'error', '-i', video, '-vf', 'scale=270:-1', f'{d}/f_%05d.png'], check=True)
n = len(os.listdir(d)); fps = 30
def sharp(i):
    a = np.asarray(Image.open(f'{d}/f_{i + 1:05d}.png').convert('L'), dtype=float)
    lap = a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    return lap.var()
S = np.array([sharp(i) for i in range(n)]); base = np.median(S)
bins = {}
for s in tl['shots'][1:]:
    f0 = round(s['t0'] * fps); typ = s['transition']
    for k in range(-6, 24, 3):
        if 0 <= f0 + k < n: bins.setdefault((typ, k / fps), []).append(S[f0 + k] / base)
for typ in sorted({t for t, _ in bins}):
    print(typ.ljust(9), ' '.join(f"{k:+.1f}s:{np.mean(v):.2f}" for (t, k), v in sorted(bins.items()) if t == typ))
print('(1.00 = the film\'s median sharpness; lower = softer)')
