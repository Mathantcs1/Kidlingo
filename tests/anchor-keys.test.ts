// Plan 5E Task 5: the anchor as a fifth keyed transform target (D5), resolved by the one resolver.
import { describe, it, expect } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { animatedTargets, setAnimated, setValueAt, removeKeys, targetValueAt } from '../src/core/keyframeEdits';
import { anchorToCropCentre, fitToCrop, resetAnchor, setAnchor, setCrop } from '../src/core/cropEdits';
import { splitClip } from '../src/core/clipEdits';
import { migrateProject } from '../src/core/migrate';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { resetClipTransform } from '../src/core/transformEdits';
import { setKeyLoop } from '../src/core/loopEdits';
import { base, ok, saved } from './migrate-v7-fixtures';

const A = { kind: 'transform', prop: 'anchor' } as const;
const lin = { kind: 'linear' as const };
const vclip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c1', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
function proj(clip: Clip = vclip()): Project {
  const p = emptyProject('youtube');
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: [clip] };
  return p;
}
const get = (p: Project, id = 'c1') => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;
const F = { width: 1920, height: 1080, fps: 30 };
const keyed = (extra: Partial<Clip> = {}) =>
  vclip({ keys: { anchor: [{ t: 0, x: -0.5, y: -0.5, ease: lin }, { t: 2, x: 0.5, y: 0.5, ease: lin }] }, ...extra });

describe('resolver', () => {
  it('evaluates the anchor at the clip-local time and drops the keys', () => {
    const r = resolveClip(keyed(), 1, F);
    expect(r.anchor!.x).toBeCloseTo(0, 9);
    expect(r.anchor!.y).toBeCloseTo(0, 9);
    expect(r.keys).toBeUndefined();
    expect(resolveClip(keyed(), 0.5, F).anchor!.x).toBeCloseTo(-0.25, 9);
    expect(resolveClip(keyed(), 9, F).anchor).toEqual({ x: 0.5, y: 0.5 });
  });
  it('a loop repeats it; keys win over the static anchor', () => {
    const c = keyed({ anchor: { x: 0.3, y: 0.3 } });
    c.keys = { ...c.keys!, loops: { anchor: { mode: 'repeat', count: null } } };
    expect(resolveClip(c, 2.5, F).anchor!.x).toBeCloseTo(-0.25, 9);
    expect(resolveClip(keyed({ anchor: { x: 0.3, y: 0.3 } }), 0, F).anchor).toEqual({ x: -0.5, y: -0.5 });
  });
  it('clamps to ±2 and keeps a static anchor when not keyed', () => {
    const c = keyed();
    c.keys!.anchor = [{ t: 0, x: 50, y: -50, ease: lin }];
    expect(resolveClip(c, 0, F).anchor).toEqual({ x: 2, y: -2 });
    const s = vclip({ anchor: { x: 0.1, y: 0.2 } });
    expect(resolveClip(s, 1, F)).toBe(s);
  });
});

describe('an offset loop cannot push the anchor past ±2', () => {
  it('the resolver and the inspector value (targetValueAt) both clamp', () => {
    const c = vclip({ keys: { anchor: [{ t: 0, x: 0, y: 0, ease: lin }, { t: 1, x: 1, y: -1, ease: lin }], loops: { anchor: { mode: 'offset', count: null } } } });
    expect(resolveClip(c, 3.5, F).anchor).toEqual({ x: 2, y: -2 });
    expect(targetValueAt(c, A, 3.5, 30)).toEqual({ x: 2, y: -2 });
  });
});

describe('stopwatch and values', () => {
  it('turning it on keys the static anchor; off writes the value at the playhead back and drops keys and loop', () => {
    const on = setAnimated(proj(vclip({ anchor: { x: 0.2, y: -0.1 } })), 'c1', A, true, 0);
    expect(get(on).keys!.anchor).toEqual([{ t: 0, x: 0.2, y: -0.1, ease: lin }]);
    expect(animatedTargets(get(on))).toEqual([A]);
    const moved = setValueAt(on, 'c1', A, { x: 0.4, y: 0.4 }, 1);
    const looped = setKeyLoop(moved, 'c1', A, { mode: 'repeat', count: null });
    expect(get(looped).keys!.loops!.anchor).toBeDefined();
    const off = setAnimated(looped, 'c1', A, false, 1);
    expect(get(off).keys).toBeUndefined();
    expect(get(off).anchor!.x).toBeGreaterThan(0.2 - 1e-9);
  });
  it('setValueAt on a static anchor is the static edit; on a keyed one it adds a clamped key', () => {
    const s = setValueAt(proj(), 'c1', A, { x: 0.25, y: 0.5 }, 0);
    expect(get(s).anchor).toEqual({ x: 0.25, y: 0.5 });
    const on = setAnimated(proj(), 'c1', A, true, 0);
    const k = setValueAt(on, 'c1', A, { x: 9, y: -9 }, 1);
    expect(get(k).keys!.anchor!.at(-1)).toMatchObject({ x: 2, y: -2 });
    expect(targetValueAt(get(k), A, 1, 30)).toEqual({ x: 2, y: -2 });
  });
  it('removing the last key makes the anchor static at that key', () => {
    const on = setValueAt(setAnimated(proj(), 'c1', A, true, 0), 'c1', A, { x: 0.3, y: 0.3 }, 0);
    const gone = removeKeys(on, 'c1', [{ target: A, t: 0 }]);
    expect(get(gone).keys).toBeUndefined();
    expect(get(gone).anchor).toEqual({ x: 0.3, y: 0.3 });
  });
  it('overlay, adjustment and audio clips cannot animate the anchor', () => {
    for (const kind of ['overlay', 'adjustment', 'audio'] as const) {
      expect(() => setAnimated(proj(vclip({ kind, mediaId: kind === 'audio' ? 'm1' : '' })), 'c1', A, true, 0)).toThrow();
    }
  });
});

describe('static edits refuse a keyed anchor', () => {
  it('setAnchor, resetAnchor, anchorToCropCentre, fitToCrop', () => {
    const p = proj(keyed());
    expect(() => setAnchor(p, 'c1', { x: 0.1, y: 0.1 })).toThrow(/animated/i);
    expect(() => resetAnchor(p, 'c1')).toThrow(/animated/i);
    const c = setCrop(p, 'c1', { left: 0.2 });
    expect(() => anchorToCropCentre(c, 'c1')).toThrow(/animated/i);
    expect(() => fitToCrop(c, 'c1', 'fit')).toThrow(/animated/i);
  });
  it('Reset transform keeps the anchor keys', () => {
    const p = proj(keyed({ transform: { ...defaultTransform(), x: 50 }, keys: { anchor: keyed().keys!.anchor, opacity: [{ t: 0, v: 0.5, ease: lin }] } }));
    const r = get(resetClipTransform(p, 'c1'));
    expect(r.keys!.anchor).toHaveLength(2);
    expect(r.keys!.opacity).toBeUndefined();
  });
});

describe('split', () => {
  it('each half keeps the anchor keys that decide its own range', () => {
    const c = vclip({ keys: { anchor: [{ t: 0, x: 0, y: 0, ease: lin }, { t: 1, x: 0.1, y: 0, ease: lin }, { t: 3, x: 0.3, y: 0, ease: lin }] } });
    const p = splitClip(proj(c), 'c1', 2);
    const [l, r] = p.tracks[0].clips;
    expect(l.keys!.anchor!.length).toBeGreaterThanOrEqual(2);
    expect(r.keys!.anchor!.length).toBeGreaterThanOrEqual(2);
    // same picture across the cut
    const at = (cl: Clip, t: number) => resolveClip(cl, t, F).anchor!.x;
    expect(at(l, 1.9)).toBeCloseTo(resolveClip(c, 1.9, F).anchor!.x, 9);
    expect(at(r, 2.1)).toBeCloseTo(resolveClip(c, 2.1, F).anchor!.x, 9);
  });
});

describe('migration repair', () => {
  const kk = (list: unknown[], extra: Record<string, unknown> = {}) => ok(saved(8, [base('c', 'video', { keys: { anchor: list, ...extra } })])).tracks[0].clips[0];
  it('keeps valid keys sorted, clamps to ±2 and strips tangents', () => {
    const c = kk([{ t: 1, x: 3, y: -3, ease: lin, in: { x: 5, y: 5 }, out: { x: 1, y: 1 }, broken: true }, { t: 0, x: 0.5, y: 0, ease: lin }]);
    expect(c.keys!.anchor).toEqual([{ t: 0, x: 0.5, y: 0, ease: lin }, { t: 1, x: 2, y: -2, ease: lin }]);
  });
  it('drops junk; an emptied list removes the keys; loops need keys', () => {
    expect(kk([{ t: 'x', x: 1, y: 1 }, { t: 0, x: NaN, y: 0 }])).not.toHaveProperty('keys');
    const c = kk([{ t: 0, x: 0, y: 0, ease: lin }, { t: 1, x: 1, y: 0, ease: lin }], { loops: { anchor: { mode: 'pingPong', count: 3 } } });
    expect(c.keys!.loops!.anchor).toEqual({ mode: 'pingPong', count: 3 });
    expect(kk([{ t: 'x' }], { loops: { anchor: { mode: 'repeat', count: null } } })).not.toHaveProperty('keys');
  });
  it('audio, overlay and adjustment clips lose anchor keys', () => {
    const p = ok(saved(8, [base('j', 'adjustment', { keys: { anchor: [{ t: 0, x: 1, y: 1, ease: lin }], opacity: [{ t: 0, v: 1, ease: lin }] } })]));
    expect(p.tracks[0].clips[0].keys).toEqual({ opacity: [{ t: 0, v: 1, ease: lin }] });
    expect(migrateProject(saved(8, [])).ok).toBe(true);
  });
});

describe('copy/paste of the whole animation and format switches', () => {
  it('the anchor keys travel with the animation (fractions, no size adaptation)', async () => {
    const { copyAnimation } = await import('../src/core/animPayload');
    const { pasteAnimation } = await import('../src/core/animTransfer');
    const p = proj(keyed());
    p.tracks[0] = { ...p.tracks[0], clips: [keyed(), vclip({ id: 'c2', start: 10 })] };
    const payload = copyAnimation(p, 'c1');
    expect(payload.keys!.anchor).toHaveLength(2);
    const r = pasteAnimation(p, ['c2'], payload);
    expect(get(r.project, 'c2').keys!.anchor!.map((k) => [k.x, k.y])).toEqual([[-0.5, -0.5], [0.5, 0.5]]);
    // not for an audio/overlay destination
    const o = pasteAnimation({ ...p, tracks: [{ ...p.tracks[0], clips: [keyed(), vclip({ id: 'c3', start: 10, kind: 'overlay', mediaId: '', overlay: { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#ff0000', sticker: 'heart' } })] }, ...p.tracks.slice(1)] }, ['c3'], payload);
    expect(get(o.project, 'c3').keys?.anchor).toBeUndefined();
    expect(o.skipped).toBeGreaterThan(0);
  });
  it('a format switch leaves anchor keys untouched', async () => {
    const { reframeProject } = await import('../src/core/merge');
    const p = proj(keyed());
    const q = reframeProject(p, 'vertical');
    expect(get(q).keys!.anchor).toEqual(get(p).keys!.anchor);
  });
});
