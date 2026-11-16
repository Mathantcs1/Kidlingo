// Plan 5C Task 6: the crossfade envelopes (D12) and the clip gain with a crossfade on an edge.
import { describe, it, expect } from 'vitest';
import { XFADE_SEGMENTS, crossfadeEnvelopes, crossfadeInfo } from '../src/audio/crossfade';
import { clipGainPoints, envelopeAt, fadePoints } from '../src/audio/fade';
import { audibleClips } from '../src/audio/plan';
import { addTransition } from '../src/core/transitionEdits';
import type { Transition } from '../src/core/transitionTypes';
import { base, mk, trackOf } from './transition-fixtures';

const tr = (over: Partial<Transition> = {}): Transition => ({ id: 't', fromClipId: 'a', toClipId: 'b', type: 'dissolve', duration: 1, ease: { kind: 'linear' }, ...over });

describe('crossfadeEnvelopes', () => {
  it('33 breakpoints per side over the window; the outgoing clip goes 1 -> 0 and the incoming 0 -> 1 exactly', () => {
    const [out, inn] = crossfadeEnvelopes(tr(), 3.5);
    expect(out).toHaveLength(XFADE_SEGMENTS + 1);
    expect(inn).toHaveLength(XFADE_SEGMENTS + 1);
    expect([out[0].t, out[32].t]).toEqual([3.5, 4.5]);
    expect([out[0].gain, out[32].gain, inn[0].gain, inn[32].gain]).toEqual([1, 0, 0, 1]);
  });
  it('equal power keeps the summed POWER at 1 at every breakpoint; the midpoint is -3 dB each', () => {
    const [out, inn] = crossfadeEnvelopes(tr(), 0);
    for (let k = 0; k <= 32; k++) expect(out[k].gain ** 2 + inn[k].gain ** 2).toBeCloseTo(1, 12);
    expect(out[16].gain).toBeCloseTo(Math.SQRT1_2, 12);
    expect(inn[16].gain).toBeCloseTo(Math.SQRT1_2, 12);
  });
  it('constant gain keeps the summed AMPLITUDE at 1', () => {
    const [out, inn] = crossfadeEnvelopes(tr({ audio: 'gain' }), 0);
    for (let k = 0; k <= 32; k++) expect(out[k].gain + inn[k].gain).toBeCloseTo(1, 12);
    expect(out[16].gain).toBeCloseTo(0.5, 12);
  });
  it('the equal-power chord error between breakpoints stays below 3.1e-4 in amplitude', () => {
    const [out] = crossfadeEnvelopes(tr(), 0);
    let worst = 0;
    for (let i = 0; i < 1000; i++) {
      const t = i / 1000;
      worst = Math.max(worst, Math.abs(envelopeAt(out, t) - Math.cos((t * Math.PI) / 2)));
    }
    expect(worst).toBeLessThan(3.1e-4);
  });
  it('follows the transition ease: easeIn delays the incoming clip', () => {
    const [, lin] = crossfadeEnvelopes(tr(), 0);
    const [, slow] = crossfadeEnvelopes(tr({ ease: { kind: 'easeIn' } }), 0);
    expect(slow[8].gain).toBeLessThan(lin[8].gain);
  });
});

describe('crossfadeInfo', () => {
  const p = () => addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
  it('each clip of a valid transition sounds half a duration into its handle; others are absent', () => {
    const info = crossfadeInfo(p(), audibleClips(p()));
    expect(info.get('a')).toMatchObject({ before: 0, after: 0.5 });
    expect(info.get('b')).toMatchObject({ before: 0.5, after: 0 });
    expect(info.has('c')).toBe(false);
    expect(info.get('a')!.outPoints).toBeDefined();
    expect(info.get('b')!.inPoints).toBeDefined();
  });
  it('a clip in the middle of two transitions has both halves', () => {
    const q = addTransition(p(), 'v', 'b', 'c', { type: 'dissolve', duration: 1 });
    expect(crossfadeInfo(q, audibleClips(q)).get('b')).toMatchObject({ before: 0.5, after: 0.5 });
  });
  it('nothing without transitions; a partner that cannot sound leaves the other clip alone', () => {
    expect(crossfadeInfo(base(), audibleClips(base())).size).toBe(0);
    const q = p();
    const silent = { ...q, tracks: q.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'b' ? { ...c, audio: { ...c.audio, silent: true } } : c)) })) };
    expect(crossfadeInfo(silent, audibleClips(silent)).size).toBe(0);
  });
  it('an invalid transition (a gap after a move) is ignored', () => {
    const q = p();
    const moved = { ...q, tracks: q.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'b' ? { ...c, start: 5 } : c)) })) };
    expect(crossfadeInfo(moved, audibleClips(moved)).size).toBe(0);
  });
});

describe('clipGainPoints', () => {
  const faded = (extra = {}) => mk('b', 4, 2, 6, { audio: { fadeIn: 1, fadeOut: 1, pan: 0, silent: false, effects: [], ...extra } });
  it('is exactly fadePoints without a crossfade', () => {
    const c = faded();
    expect(clipGainPoints(c, 4, 8)).toEqual(fadePoints(c, 4, 8));
    expect(clipGainPoints(c, 4, 8, {})).toEqual(fadePoints(c, 4, 8));
  });
  it('the incoming clip\'s fade-in is replaced by the crossfade: not silenced at its start, the crossfade gain there', () => {
    const c = faded();
    const [, inn] = crossfadeEnvelopes(tr(), 3.5);
    const pts = clipGainPoints(c, 3.5, 8, { inPoints: inn });
    expect(pts[0]).toEqual({ t: 3.5, gain: 0 });
    expect(envelopeAt(pts, 4)).toBeCloseTo(Math.SQRT1_2, 3); // would be 0 with the fade-in
    expect(envelopeAt(pts, 4.5)).toBeCloseTo(1, 12);
    expect(envelopeAt(pts, 7.5)).toBeCloseTo(0.5, 12); // the far edge keeps its own fade-out
  });
  it('the outgoing clip plays on after its end with the falling envelope; the fade-out on that edge is replaced', () => {
    const c = mk('a', 0, 2, 6, { audio: { fadeIn: 0, fadeOut: 1, pan: 0, silent: false, effects: [] } });
    const [out] = crossfadeEnvelopes(tr(), 3.5);
    const pts = clipGainPoints(c, 0, 4.5, { outPoints: out });
    expect(envelopeAt(pts, 3.5)).toBe(1); // the fade-out would already be 0.5 here
    expect(envelopeAt(pts, 4)).toBeCloseTo(Math.SQRT1_2, 3);
    expect(pts[pts.length - 1]).toEqual({ t: 4.5, gain: 0 });
  });
  it('a window cut gives the same number on both sides', () => {
    const [, inn] = crossfadeEnvelopes(tr(), 3.5);
    const whole = clipGainPoints(faded(), 3.5, 8, { inPoints: inn });
    const left = clipGainPoints(faded(), 3.5, 4.2, { inPoints: inn });
    const right = clipGainPoints(faded(), 4.2, 8, { inPoints: inn });
    expect(left[left.length - 1].gain).toBe(right[0].gain);
    expect(right[0].gain).toBeCloseTo(envelopeAt(whole, 4.2), 12);
  });
});

describe('audio transitions on audio tracks', () => {
  it('an audio-type transition between two audio clips crossfades them', () => {
    const p = base();
    const a = mk('x', 0, 2, 6, { kind: 'audio', mediaId: 'm2' });
    const b = mk('y', 4, 2, 6, { kind: 'audio', mediaId: 'm2' });
    p.media.m2 = { id: 'm2', name: 'a.wav', kind: 'audio', duration: 60, hasAudio: true } as never;
    p.tracks.push({ ...trackOf(p), id: 'au', kind: 'audio', clips: [a, b], transitions: undefined });
    const q = addTransition(p, 'au', 'x', 'y', { type: 'audio', duration: 1 });
    const info = crossfadeInfo(q, audibleClips(q));
    expect(info.get('x')!.after).toBe(0.5);
    expect(info.get('y')!.before).toBe(0.5);
  });
});
