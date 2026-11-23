#!/usr/bin/env python3
"""Procedural sound design: voiceover + sound effects placed on the engine's event times (+ optional music bed).
usage: sfx.py <project> [--music file.mp3] [--music-db -24]
needs <project>/out/events.json (render.mjs events) and <project>/vo.mp3 ; writes <project>/out/mix.wav"""
import argparse, json, os, subprocess, wave
import numpy as np
SR = 44100
ap = argparse.ArgumentParser(); ap.add_argument('project'); ap.add_argument('--music'); ap.add_argument('--music-db', type=float, default=-24)
ap.add_argument('--sfx-db', type=float, default=-13)
a = ap.parse_args(); P = a.project; out = os.path.join(P, 'out')
ev = json.load(open(os.path.join(out, 'events.json'))); dur = ev['duration']
def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
n = int((dur + .5) * SR); mix = np.zeros(n, dtype=np.float32)
vo = load(os.path.join(P, 'vo.mp3')); vo = vo / (np.abs(vo).max() + 1e-9) * .9; mix[:min(n, len(vo))] += vo[:n]
rng = np.random.default_rng(7)
def env(k, att, dec): x = np.arange(k) / SR; return np.minimum(x / att, 1) * np.exp(-x / dec)
def lp(x, c):
    y = np.zeros_like(x); s = 0.
    for i in range(len(x)): s += (x[i] - s) * c[i] if hasattr(c, '__len__') else (x[i] - s) * c; y[i] = s
    return y
def snd(kind):
    if kind in ('pop', 'pop2'):
        k = int(.14 * SR); x = np.arange(k) / SR; f = (700 if kind == 'pop' else 1000) + 500 * np.exp(-x / .03); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(k, .002, .04) * .8
    if kind == 'thud':
        k = int(.5 * SR); x = np.arange(k) / SR; f = 45 + 70 * np.exp(-x / .06); b = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(k, .001, .13); nz = lp(rng.standard_normal(k).astype(np.float32), .08) * env(k, .001, .05); return (b * 1.1 + nz * .6).astype(np.float32)
    if kind in ('whoosh', 'whoosh2'):
        d = .55 if kind == 'whoosh' else .3; k = int(d * SR); x = np.arange(k) / SR; e = np.sin(np.pi * np.clip(x / d, 0, 1)) ** 2; c = .02 + .35 * (x / d) ** 1.5
        return (lp(rng.standard_normal(k).astype(np.float32), c) * e * (.9 if kind == 'whoosh' else .5)).astype(np.float32)
    if kind == 'coin':
        k = int(.3 * SR); x = np.arange(k) / SR; return ((np.sin(2 * np.pi * 1318 * x) + np.sin(2 * np.pi * 1760 * np.maximum(x - .07, 0)) * (x > .07)) * env(k, .001, .09) * .5).astype(np.float32)
    if kind == 'tick':
        k = int(.03 * SR); x = np.arange(k) / SR; return (np.sin(2 * np.pi * 2200 * x) * env(k, .0005, .006) * .3).astype(np.float32)
    return None
cache = {}; last_tick = -1
for e in ev['events']:
    kind = e['type']
    if kind == 'tick':
        if e['t'] - last_tick < .09: continue
        last_tick = e['t']
    if kind not in cache: cache[kind] = snd(kind)
    s = cache[kind]
    if s is None: continue
    i = int(e['t'] * SR); j = min(n, i + len(s))
    if i < n: mix[i:j] += s[:j - i] * (10 ** (a.sfx_db / 20))
if a.music:
    m = load(a.music); m = np.tile(m, int(np.ceil(n / len(m))))[:n]; m = m / (np.abs(m).max() + 1e-9) * (10 ** (a.music_db / 20)); mix += m
mix = np.tanh(mix * 1.05) * .95
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(out, 'mix.wav'), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('mix.wav', round(len(mix) / SR, 1), 's;', len(ev['events']), 'events')
