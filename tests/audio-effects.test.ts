import { describe, it, expect } from 'vitest';
import { EFFECT_SCHEMAS, MAX_PRE_ROLL, chainMargins, clampParams, defaultParams } from '../src/audio/effects/params';
import { reverbImpulse } from '../src/audio/effects/impulse';
import { normaliseGainDb } from '../src/audio/effects/normalise';
import { PRESETS, availablePresets } from '../src/audio/presets';
import { applyPreset, setGainEffect } from '../src/core/audioPresets';
import { addEffect } from '../src/core/audioEdits';
import { clampEffectParams, defaultEffectParams } from '../src/core/effectParams';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { AudioEffect, AudioEffectType, Clip, Project } from '../src/core/model';
import { setTrackFlags } from '../src/core/tracks';
import type { Peaks } from '../src/media/peaks';

const TYPES: AudioEffectType[] = ['eq', 'highpass', 'lowpass', 'compressor', 'reverb', 'echo', 'pitch', 'denoise', 'gain'];

describe('clampParams', () => {
  it.each(TYPES)('%s: clamps, fills missing, drops unknown, non-finite => default', (type) => {
    const defs = EFFECT_SCHEMAS[type].params;
    expect(defs.length).toBeGreaterThan(0);
    const defaults = defaultParams(type);
    expect(Object.keys(defaults).sort()).toEqual(defs.map((d) => d.key).sort());
    for (const d of defs) {
      expect(d.def).toBeGreaterThanOrEqual(d.min);
      expect(d.def).toBeLessThanOrEqual(d.max);
      expect(clampParams(type, { [d.key]: d.max + 1000 })[d.key]).toBe(d.max);
      expect(clampParams(type, { [d.key]: d.min - 1000 })[d.key]).toBe(d.min);
      expect(clampParams(type, { [d.key]: NaN })[d.key]).toBe(d.def);
      expect(clampParams(type, { [d.key]: Infinity })[d.key]).toBe(d.def);
      const mid = (d.min + d.max) / 2;
      expect(clampParams(type, { [d.key]: mid })[d.key]).toBe(mid);
    }
    // Missing keys are filled with defaults; unknown keys are dropped.
    const out = clampParams(type, { nope: 1 } as Record<string, number>);
    expect(out).toEqual(defaults);
    expect('nope' in out).toBe(false);
  });

  it('the core delegates to the registry schema', () => {
    expect(defaultEffectParams('eq')).toEqual({ low: 0, mid: 0, high: 0 });
    expect(clampEffectParams('eq', { high: 99, x: 1 })).toEqual({ low: 0, mid: 0, high: 12 });
    expect(clampEffectParams('lowpass', { freq: 10 })).toEqual({ freq: 1000 });
    expect(clampEffectParams('highpass', { freq: 5000 })).toEqual({ freq: 1000 });
    expect(clampEffectParams('gain', { gainDb: -99 })).toEqual({ gainDb: -24 });
  });

  it('pitch and denoise are registered but not yet available', () => {
    expect(EFFECT_SCHEMAS.pitch.available).toBe(false);
    expect(EFFECT_SCHEMAS.denoise.available).toBe(false);
    expect(defaultParams('pitch')).toEqual({ semitones: 0 });
    expect(defaultParams('denoise')).toEqual({ strength: 0.5 });
    for (const t of TYPES.filter((t) => t !== 'pitch' && t !== 'denoise')) expect(EFFECT_SCHEMAS[t].available).toBe(true);
  });
});

const fx = (type: AudioEffectType, params: Record<string, number> = {}, enabled = true): AudioEffect => ({
  id: `${type}-${Math.random()}`,
  type,
  enabled,
  params: { ...defaultParams(type), ...params },
});

describe('chainMargins', () => {
  it('is zero for no effects and for gain only', () => {
    expect(chainMargins([])).toEqual({ pre: 0, post: 0 });
    expect(chainMargins([fx('gain')])).toEqual({ pre: 0, post: 0 });
  });
  it('filters, EQ and compressor warm up for 0.5 s or more', () => {
    for (const t of ['eq', 'highpass', 'lowpass'] as const) expect(chainMargins([fx(t)])).toEqual({ pre: 0.5, post: 0 });
    expect(chainMargins([fx('compressor')]).pre).toBeGreaterThanOrEqual(0.5);
  });
  it('reverb needs its impulse length of history; echo enough repeats to fall below -80 dB', () => {
    expect(chainMargins([fx('reverb', { seconds: 2 })]).pre).toBeCloseTo(2, 9);
    const echo = chainMargins([fx('echo', { delay: 0.25, feedback: 0.5 })]).pre;
    // 0.5^n < 1e-4 needs n = 14 repeats.
    expect(echo).toBeCloseTo(0.25 * 14, 9);
    expect(chainMargins([fx('echo', { delay: 0.25, feedback: 0 })]).pre).toBeCloseTo(0.25, 9);
    // Long, high-feedback echoes are capped.
    expect(chainMargins([fx('echo', { delay: 1, feedback: 0.9 })]).pre).toBe(30);
  });
  it('compressor pre-roll covers recovery from its worst-case gain reduction (10 dB per release time)', () => {
    // Defaults: threshold -24, ratio 4, knee 6 => ceil((18 + 6) / 10) = 3 releases, plus one, plus warm-up.
    expect(chainMargins([fx('compressor')]).pre).toBeCloseTo(0.5 + 0.25 * 3 + 0.25, 9);
    // -60 dB, 20:1 => ceil((57 + 6) / 10) = 7 releases of 1 s.
    expect(chainMargins([fx('compressor', { threshold: -60, ratio: 20, release: 1 })]).pre).toBeCloseTo(0.5 + 7 + 1, 9);
  });
  it('caps the total pre-roll at MAX_PRE_ROLL', () => {
    const long = fx('echo', { delay: 1, feedback: 0.9 });
    expect(chainMargins([long, { ...long, id: 'b' }, fx('compressor', { threshold: -60, ratio: 20, release: 1 })]).pre).toBe(MAX_PRE_ROLL);
    expect(MAX_PRE_ROLL).toBe(30);
  });
  it('sums enabled effects and ignores disabled ones', () => {
    const list = [fx('eq'), fx('reverb', { seconds: 1 }), fx('lowpass', {}, false), fx('pitch'), fx('denoise', {}, false)];
    const m = chainMargins(list);
    expect(m.pre).toBeCloseTo(0.5 + 1 + 0.2, 9);
    expect(m.post).toBeCloseTo(0.2, 9);
  });
});

describe('reverbImpulse', () => {
  it('is deterministic per seed and decays', () => {
    const a = reverbImpulse(48000, 1.5);
    const b = reverbImpulse(48000, 1.5, 1);
    expect(a.length).toBe(72000);
    expect(Array.from(a)).toEqual(Array.from(b));
    const c = reverbImpulse(48000, 1.5, 2);
    expect(Array.from(c)).not.toEqual(Array.from(a));
    const energy = (from: number, to: number) => a.subarray(from, to).reduce((s, v) => s + v * v, 0);
    const tenth = Math.floor(a.length / 10);
    expect(energy(a.length - tenth, a.length)).toBeLessThan(energy(0, tenth) * 1e-3);
    expect(a.every(Number.isFinite)).toBe(true);
    // Unit energy, so the wet level does not depend on the length.
    expect(energy(0, a.length)).toBeCloseTo(1, 6);
  });
});

/** Peaks whose every bucket spans [-amp, amp] (quantised like finishPeaks). */
function flatPeaks(amp: number, seconds = 10): Peaks {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 127.5 + 127.5)));
  const data = new Uint8Array(seconds * 100 * 2);
  for (let i = 0; i < data.length; i += 2) {
    data[i] = q(-amp);
    data[i + 1] = q(amp);
  }
  return { rate: 100, duration: seconds, data };
}

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c1', mediaId: 'm1', kind: 'audio', start: 0, in: 1, out: 4, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), fit: 'fit', ...over,
});

describe('normaliseGainDb', () => {
  it('lifts a 0.5 peak to -1 dBFS (+5.02 dB)', () => {
    // Peaks are 8-bit (step 1/127, about 0.07 dB at 0.5): 0.5 is stored as -0.5039 / +0.4961.
    expect(Math.abs(normaliseGainDb(flatPeaks(0.5), clip()) - 5.02)).toBeLessThan(0.1);
    expect(normaliseGainDb(flatPeaks(0.5), clip())).toBeCloseTo(20 * Math.log10(10 ** (-1 / 20) / (64 / 127)), 6);
    expect(Math.abs(normaliseGainDb(flatPeaks(0.5), clip(), -6) - 20 * Math.log10(0.5012 / 0.5))).toBeLessThan(0.1);
  });
  it('is 0 for silence or empty peaks', () => {
    expect(normaliseGainDb(flatPeaks(0), clip())).toBe(0);
    expect(normaliseGainDb({ rate: 100, duration: 0, data: new Uint8Array(0) }, clip())).toBe(0);
  });
  it('only looks at the clip source range [in, out)', () => {
    const p = flatPeaks(0.25);
    // A loud spike at 6 s, outside [1, 4).
    p.data[600 * 2 + 1] = 255;
    expect(Math.abs(normaliseGainDb(p, clip()) - 20 * Math.log10(0.8913 / 0.25))).toBeLessThan(0.1);
  });
  it('clamps to the gain effect range', () => {
    expect(normaliseGainDb(flatPeaks(0.01), clip())).toBe(24);
  });
});

function base(): Project {
  const p = emptyProject();
  return {
    ...p,
    media: { m1: { id: 'm1', name: 'a.wav', kind: 'audio', duration: 10, hasAudio: true } as Project['media'][string] },
    tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips: [clip()] } : t)),
  };
}
const effectsOf = (p: Project) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1')!.audio.effects;

describe('presets', () => {
  it('every preset list is valid under clampParams and uses known types', () => {
    for (const [key, list] of Object.entries(PRESETS)) {
      for (const e of list) {
        expect(TYPES, key).toContain(e.type);
        expect(clampParams(e.type, e.params), `${key}/${e.type}`).toEqual(e.params);
      }
    }
    expect(availablePresets().map(([k]) => k)).toEqual(['podcast', 'radio', 'telephone']);
  });
  it('applyPreset replaces the effect list in one edit with fresh ids; same reference when unchanged', () => {
    const p0 = addEffect(base(), 'c1', 'reverb');
    const before = JSON.stringify(p0);
    const p = applyPreset(p0, 'c1', 'telephone');
    expect(JSON.stringify(p0)).toBe(before);
    const list = effectsOf(p);
    expect(list.map((e) => e.type)).toEqual(PRESETS.telephone.map((e) => e.type));
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    const again = applyPreset(p, 'c1', 'telephone');
    expect(again).toBe(p);
  });
  it('refuses on a locked track and on an unavailable preset', () => {
    const p0 = base();
    const locked = setTrackFlags(p0, p0.tracks.find((t) => t.kind === 'audio')!.id, { locked: true });
    expect(() => applyPreset(locked, 'c1', 'podcast')).toThrow('Track is locked');
    expect(() => applyPreset(p0, 'c1', 'deep')).toThrow();
  });
});

describe('setGainEffect (Normalise)', () => {
  it('creates a gain effect, then updates (and re-enables) the first one; same reference when unchanged', () => {
    const p0 = addEffect(base(), 'c1', 'eq');
    const p1 = setGainEffect(p0, 'c1', 5.02);
    const list1 = effectsOf(p1);
    expect(list1.map((e) => e.type)).toEqual(['eq', 'gain']);
    expect(list1[1]).toMatchObject({ enabled: true, params: { gainDb: 5.02 } });
    expect(setGainEffect(p1, 'c1', 5.02)).toBe(p1);
    const off = { ...list1[1], enabled: false };
    const p2 = { ...p1, tracks: p1.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, audio: { ...c.audio, effects: [list1[0], off] } })) })) };
    const p3 = setGainEffect(p2, 'c1', -3);
    expect(effectsOf(p3)).toHaveLength(2);
    expect(effectsOf(p3)[1]).toMatchObject({ id: list1[1].id, enabled: true, params: { gainDb: -3 } });
    expect(effectsOf(setGainEffect(p3, 'c1', 99))[1].params.gainDb).toBe(24);
  });
  it('refuses on a locked track', () => {
    const p0 = base();
    const locked = setTrackFlags(p0, p0.tracks.find((t) => t.kind === 'audio')!.id, { locked: true });
    expect(() => setGainEffect(locked, 'c1', 3)).toThrow('Track is locked');
  });
});
