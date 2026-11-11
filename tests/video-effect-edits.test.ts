import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { TimelineError, splitClip, trimClip } from '../src/core/timeline';
import { joinClips } from '../src/core/merge';
import { setTrackFlags } from '../src/core/tracks';
import { MAX_VIDEO_EFFECTS, defaultParams } from '../src/core/videoEffects';
import {
  addVideoEffect, applyLook, moveVideoEffect, removeVideoEffect, setClipBlend, updateVideoEffect,
} from '../src/core/videoEffectEdits';

const clip = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit', ...over,
});

function base(): Project {
  const p = emptyProject();
  return {
    ...p,
    media: {
      m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, fps: 30, hasAudio: true },
      lut1: { id: 'lut1', name: 'x.cube', kind: 'lut', duration: 0, hasAudio: false },
    },
    tracks: p.tracks.map((t) =>
      t.kind === 'video'
        ? { ...t, clips: [clip('v1')] }
        : { ...t, clips: [clip('a1', { kind: 'audio' })] },
    ),
  };
}
const get = (p: Project, id: string): Clip => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;
const fx = (p: Project, id = 'v1') => get(p, id).effects;
const vTrackId = (p: Project) => p.tracks.find((t) => t.kind === 'video')!.id;
const frozen = (p: Project): string => JSON.stringify(p);

describe('addVideoEffect', () => {
  it('appends an enabled effect with default params and a fresh id, without mutating the input', () => {
    const p = base();
    const snap = frozen(p);
    const q = addVideoEffect(p, 'v1', 'colour');
    expect(frozen(p)).toBe(snap);
    expect(fx(q)).toHaveLength(1);
    expect(fx(q)[0]).toMatchObject({ type: 'colour', enabled: true, params: defaultParams('colour') });
    expect(fx(q)[0].id).toBeTruthy();
    const r = addVideoEffect(q, 'v1', 'bw');
    expect(fx(r).map((e) => e.type)).toEqual(['colour', 'bw']);
    expect(fx(r)[0].id).not.toBe(fx(r)[1].id);
  });
  it('works on image clips', () => {
    let p = base();
    p = { ...p, tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, clips: [clip('v1', { kind: 'image' })] } : t)) };
    expect(fx(addVideoEffect(p, 'v1', 'blur'))).toHaveLength(1);
  });
  it('refuses the 9th effect', () => {
    let p = base();
    for (let i = 0; i < MAX_VIDEO_EFFECTS; i++) p = addVideoEffect(p, 'v1', 'bw');
    expect(() => addVideoEffect(p, 'v1', 'bw')).toThrow(new TimelineError('At most 8 effects per clip'));
  });
  it('lut needs a ref to LUT media; other types drop a ref', () => {
    const p = base();
    expect(() => addVideoEffect(p, 'v1', 'lut')).toThrow(TimelineError);
    expect(() => addVideoEffect(p, 'v1', 'lut', 'm1')).toThrow(TimelineError);
    expect(() => addVideoEffect(p, 'v1', 'lut', 'nope')).toThrow(TimelineError);
    expect(fx(addVideoEffect(p, 'v1', 'lut', 'lut1'))[0]).toMatchObject({ type: 'lut', ref: 'lut1' });
    expect('ref' in fx(addVideoEffect(p, 'v1', 'bw', 'lut1'))[0]).toBe(false);
  });
  it('refuses audio clips, unknown clips and locked tracks', () => {
    const p = base();
    expect(() => addVideoEffect(p, 'a1', 'bw')).toThrow(TimelineError);
    expect(() => addVideoEffect(p, 'zzz', 'bw')).toThrow(TimelineError);
    const locked = setTrackFlags(p, vTrackId(p), { locked: true });
    expect(() => addVideoEffect(locked, 'v1', 'bw')).toThrow('Track is locked');
  });
});

describe('updateVideoEffect', () => {
  const withOne = () => addVideoEffect(base(), 'v1', 'colour');
  it('merges and clamps params, toggles enabled', () => {
    const p = withOne();
    const id = fx(p)[0].id;
    const q = updateVideoEffect(p, 'v1', id, { params: { contrast: 5, exposure: 0.5, bogus: 1 } });
    expect(fx(q)[0].params).toEqual({ ...defaultParams('colour'), contrast: 1, exposure: 0.5 });
    const r = updateVideoEffect(q, 'v1', id, { enabled: false });
    expect(fx(r)[0].enabled).toBe(false);
    expect(fx(r)[0].params).toEqual(fx(q)[0].params);
  });
  it('is a same-reference no-op when nothing changes', () => {
    const p = withOne();
    const id = fx(p)[0].id;
    expect(updateVideoEffect(p, 'v1', id, {})).toBe(p);
    expect(updateVideoEffect(p, 'v1', id, { enabled: true })).toBe(p);
    expect(updateVideoEffect(p, 'v1', id, { params: { contrast: 0 } })).toBe(p);
    expect(updateVideoEffect(p, 'v1', id, { params: { contrast: 9 } })).not.toBe(p);
  });
  it('refuses unknown effects, non-finite values and locked tracks', () => {
    const p = withOne();
    const id = fx(p)[0].id;
    expect(() => updateVideoEffect(p, 'v1', 'nope', { enabled: false })).toThrow(TimelineError);
    expect(() => updateVideoEffect(p, 'v1', id, { params: { contrast: Number.NaN } })).toThrow(TimelineError);
    const locked = setTrackFlags(p, vTrackId(p), { locked: true });
    expect(() => updateVideoEffect(locked, 'v1', id, { enabled: false })).toThrow('Track is locked');
  });
});

describe('removeVideoEffect / moveVideoEffect', () => {
  const three = () => {
    let p = base();
    for (const t of ['colour', 'bw', 'sepia'] as const) p = addVideoEffect(p, 'v1', t);
    return p;
  };
  it('removes one effect and refuses unknown / locked', () => {
    const p = three();
    const id = fx(p)[1].id;
    expect(fx(removeVideoEffect(p, 'v1', id)).map((e) => e.type)).toEqual(['colour', 'sepia']);
    expect(() => removeVideoEffect(p, 'v1', 'nope')).toThrow(TimelineError);
    expect(() => removeVideoEffect(setTrackFlags(p, vTrackId(p), { locked: true }), 'v1', id)).toThrow('Track is locked');
  });
  it('moves to an index, clamping; same-reference when it stays put', () => {
    const p = three();
    const [a, b, c] = fx(p).map((e) => e.id);
    expect(fx(moveVideoEffect(p, 'v1', a, 2)).map((e) => e.id)).toEqual([b, c, a]);
    expect(fx(moveVideoEffect(p, 'v1', c, 0)).map((e) => e.id)).toEqual([c, a, b]);
    expect(fx(moveVideoEffect(p, 'v1', a, 99)).map((e) => e.id)).toEqual([b, c, a]);
    expect(fx(moveVideoEffect(p, 'v1', c, -5)).map((e) => e.id)).toEqual([c, a, b]);
    expect(moveVideoEffect(p, 'v1', b, 1)).toBe(p);
    expect(moveVideoEffect(p, 'v1', a, -3)).toBe(p);
    expect(() => moveVideoEffect(p, 'v1', 'nope', 0)).toThrow(TimelineError);
    expect(() => moveVideoEffect(setTrackFlags(p, vTrackId(p), { locked: true }), 'v1', a, 1)).toThrow('Track is locked');
  });
});

describe('applyLook', () => {
  it('replaces the whole stack in one edit with fresh ids', () => {
    let p = addVideoEffect(base(), 'v1', 'colour');
    const old = fx(p)[0].id;
    p = applyLook(p, 'v1', 'sepia');
    expect(fx(p).length).toBeGreaterThanOrEqual(1);
    expect(fx(p).length).toBeLessThanOrEqual(MAX_VIDEO_EFFECTS);
    expect(fx(p).map((e) => e.id)).not.toContain(old);
    expect(fx(p).some((e) => e.type === 'sepia')).toBe(true);
    expect(new Set(fx(p).map((e) => e.id)).size).toBe(fx(p).length);
  });
  it('is a same-reference no-op when the stack already is the look, refuses audio/locked/unknown looks', () => {
    const p = applyLook(base(), 'v1', 'bw');
    expect(applyLook(p, 'v1', 'bw')).toBe(p);
    expect(() => applyLook(base(), 'a1', 'bw')).toThrow(TimelineError);
    expect(() => applyLook(base(), 'v1', 'nope' as never)).toThrow(TimelineError);
    const b = base();
    expect(() => applyLook(setTrackFlags(b, vTrackId(b), { locked: true }), 'v1', 'bw')).toThrow('Track is locked');
  });
});

describe('setClipBlend', () => {
  it('sets the mode; same reference for a no-op; refuses audio, locked and unknown modes', () => {
    const p = base();
    const q = setClipBlend(p, 'v1', 'multiply');
    expect(get(q, 'v1').blend).toBe('multiply');
    expect(setClipBlend(q, 'v1', 'multiply')).toBe(q);
    expect(setClipBlend(p, 'v1', 'normal')).toBe(p);
    expect(() => setClipBlend(p, 'a1', 'screen')).toThrow(TimelineError);
    expect(() => setClipBlend(p, 'v1', 'bogus' as never)).toThrow(TimelineError);
    expect(() => setClipBlend(setTrackFlags(p, vTrackId(p), { locked: true }), 'v1', 'screen')).toThrow('Track is locked');
  });
});

describe('split / join / trim and effects', () => {
  it('split copies the stack with NEW ids to both halves (and keeps blend)', () => {
    let p = addVideoEffect(addVideoEffect(base(), 'v1', 'colour'), 'v1', 'bw');
    p = setClipBlend(p, 'v1', 'screen');
    const orig = fx(p);
    const q = splitClip(p, 'v1', 2);
    const [l, r] = q.tracks.find((t) => t.kind === 'video')!.clips;
    expect(l.effects.map((e) => e.type)).toEqual(['colour', 'bw']);
    expect(r.effects.map((e) => e.type)).toEqual(['colour', 'bw']);
    expect(l.effects.map((e) => e.params)).toEqual(orig.map((e) => e.params));
    const ids = [...orig, ...l.effects, ...r.effects].map((e) => e.id);
    expect(new Set(ids).size).toBe(6);
    expect(l.blend).toBe('screen');
    expect(r.blend).toBe('screen');
  });
  it('split gives audio clips empty stacks', () => {
    const q = splitClip(base(), 'a1', 2);
    for (const c of q.tracks.find((t) => t.kind === 'audio')!.clips) expect(c.effects).toEqual([]);
  });
  it('trim and join leave each clip stack untouched', () => {
    const p = addVideoEffect(base(), 'v1', 'colour');
    const t = trimClip(p, 'v1', 'end', 3);
    expect(fx(t)).toEqual(fx(p));
    const s = splitClip(p, 'v1', 2);
    const [l, r] = s.tracks.find((x) => x.kind === 'video')!.clips;
    const j = joinClips(s, [l.id, r.id]);
    expect(get(j, l.id).effects).toEqual(l.effects);
    expect(get(j, r.id).effects).toEqual(r.effects);
  });
});
