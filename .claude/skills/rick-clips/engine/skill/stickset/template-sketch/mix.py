"""mix.py <film-dir> <lib-dir>: timeline.json + voice/*.wav -> out/mix.wav (48 kHz stereo). Voice, ambience per set, foley on cuts and pops,
a synthesized score ducked under the voice, with two near-silences before the turns (shot 5 and the last line)."""
import sys, json, os
import numpy as np, soundfile as sf, soxr
film, lib = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(lib, 'core', 'audio'))
import sfx
SR = sfx.SR
tl = json.load(open(os.path.join(film, 'timeline.json')))
shots, DUR = tl['shots'], tl['DUR']
N = int(DUR * SR) + SR
buf = np.zeros((N, 2), dtype=np.float32)
rng = np.random.default_rng(11)

# 1. voice, each line starting on its shot start
voice = np.zeros(N, dtype=np.float32)
for s in tl.get('voice') or [{'id': q['id'], 't0': q['voiceT0']} for q in shots]:   # one narration file per script block (a block may hold several shots)
    x, sr = sf.read(os.path.join(film, 'voice', s['id'] + '.wav'), dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    x = soxr.resample(x, sr, SR); a = int(s['t0'] * SR); voice[a:a + len(x)] += x[:N - a]
buf[:, 0] += voice * 0.9; buf[:, 1] += voice * 0.9

# 2. ambience per set; each shot's bed runs 0.4 s early (J-cut) and 0.4 s late (L-cut) with fades
def put(x, c, a):   # add c into x at sample a, clipped to x
    if a >= len(x): return
    e = min(len(x), a + len(c)); x[a:e] += c[:e - a]
def bed(kind, d):
    n = int(d * SR)
    if kind == 'bakery':   # low oven hum + crackle
        x = sfx.lp(sfx.brown(d), 260) * 0.5 + sfx.lp(sfx.noise(d), 90) * 0.05
        for _ in range(int(d * 3)):
            put(x, sfx.click(0.5 + rng.random(), 0.25), int(rng.random() * d * SR))
        return x
    if kind == 'street':   # night wind + sparse crickets
        w = sfx.bp(sfx.noise(d), 180, 900) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.17 * sfx.t_(d)))
        for k in np.arange(0.4, d, 0.9):
            t = sfx.t_(0.09); put(w, np.sin(2 * np.pi * 4300 * t) * np.sin(np.pi * t / 0.09) * 0.05, int(k * SR))
        return w * 0.8
    return sfx.lp(sfx.brown(d), 200) * 0.4
for s in shots:
    a0, a1 = max(0, s['t0'] - 0.4), s['t1'] + 0.4; d = a1 - a0
    x = bed(s['set'], d); f = int(0.4 * SR); env = np.ones(len(x)); env[:f] = np.linspace(0, 1, f); env[-f:] = np.linspace(1, 0, f)
    sfx.add(buf, (x * env * 0.12).astype(np.float32), a0, 1.0)

# 3. foley: whoosh on every cut/fade, pops as neighbors appear, a ding when the camera view opens
for s in shots[1:]:   # foley by transition type, centred on the first word of the new shot (sketch transitions)
    k = s['transition']; t0 = s['t0']
    if k == 'scribble':   # pencil scratching, sped up and down like a zig-zag
        d = 0.4; t = sfx.t_(d); sc = sfx.bp(sfx.noise(d), 2500, 8000) * np.abs(np.sin(2 * np.pi * 16 * t)) * np.sin(np.pi * t / d); sfx.add(buf, sc, t0 - 0.2, 0.5)
    elif k == 'flip': sfx.add(buf, sfx.hp(sfx.noise(0.3), 1200) * sfx.env_exp(0.3, 0.08), t0 - 0.25, 0.22, pan=-0.3); sfx.add(buf, sfx.thump(0.6, f=110), t0 + 0.12, 0.1)   # paper flap + settle
    elif k == 'ink': sfx.add(buf, sfx.pop(1.0), t0 - 0.12, 0.35); sfx.add(buf, sfx.lp(sfx.noise(0.5), 400) * sfx.env_exp(0.5, 0.15), t0 - 0.1, 0.35)   # wet blot + swell
    elif k == 'whip': sfx.add(buf, sfx.whoosh(0.4, 1.0), t0 - 0.2, 0.4, pan=-0.4)
    elif k == 'fade': sfx.add(buf, sfx.whoosh(0.6, 1.0), t0 - 0.3, 0.18, pan=0.3)
    elif k == 'cut': sfx.add(buf, sfx.click(0.6, 0.5), t0 - 0.01, 0.07)   # a soft tick on every hard cut keeps fast cutting punchy
    if s['cam'] in ('fly', 'truck', 'pull', 'crane', 'dutch'): sfx.add(buf, sfx.whoosh(0.35, 1.0), t0 - 0.05, 0.1, pan=0.4 if s['cam'] == 'truck' else 0.0)   # camera moves breathe
for si, s in enumerate(shots):   # one pop per neighbour, when they first appear in a scene (not on every cut)
    if 'neighbours' in s['cast'] and not (si > 0 and shots[si - 1]['set'] == s['set'] and 'neighbours' in shots[si - 1]['cast']):
        for i in range(3): sfx.add(buf, sfx.pop(1.0), s['t0'] + 0.15 + i * 0.3, 0.3, pan=-0.6 + i * 0.6)   # one pop per neighbour, on its pop-in

# 4. score: 96 bpm, C - Am - F - G, soft plucks + bass; ducked under the voice; silent dips before the turns
bpm = 96; beat = 60 / bpm; bar = 4 * beat
chords = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]]
midi = lambda m: 440 * 2 ** ((m - 69) / 12)
def pluck(f, d):
    t = sfx.t_(d); return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)) * np.exp(-t / (0.22 + 0.0 * d)) * 0.5
music = np.zeros((N, 2), dtype=np.float32)
for b in range(int(DUR / bar) + 1):
    ch = chords[b % 4]; t0 = b * bar
    sfx.add(music, pluck(midi(ch[0] - 12), 1.2), t0, 0.5)
    for i in range(8):
        sfx.add(music, pluck(midi(ch[1 + i % 3] + 12), 0.6), t0 + i * beat / 2, 0.22, pan=-0.3 + 0.1 * (i % 5))
duck = np.convolve(np.abs(voice), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode='same'); duck = 1 - np.clip(duck * 14, 0, 0.7)
gain = duck.astype(np.float32)
for dip_at in [shots[len(shots) // 2]["t0"] - 0.6, shots[-1]['t0'] - 0.5]:            # near-silences before the turn and the last line
    a, b = int(max(0, dip_at) * SR), int((dip_at + 0.7) * SR); gain[a:b] *= np.concatenate([np.linspace(1, 0.0, (b - a) // 2), np.linspace(0.0, 1, (b - a) - (b - a) // 2)])
fo = int(1.2 * SR); gain[int(DUR * SR) - fo:int(DUR * SR)] *= np.linspace(1, 0, fo)
buf += music * gain[:, None] * 0.5

buf = sfx.limit(buf[:int(DUR * SR) + int(0.3 * SR)].T, 0.9).T if buf.ndim == 2 else buf
os.makedirs(os.path.join(film, 'out'), exist_ok=True)
sf.write(os.path.join(film, 'out', 'mix.wav'), buf, SR)
print('mix.wav', round(len(buf) / SR, 2), 's')
