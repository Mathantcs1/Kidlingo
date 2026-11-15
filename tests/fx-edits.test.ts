import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject, newTrack } from '../src/core/model';
import type { Clip, Project, VisualEffect } from '../src/core/model';
import { addFx, addLut, applyLook, moveFx, removeFx, removeLut, setFxStack, updateFx } from '../src/core/fxEdits';
import { MAX_FX_PER_CLIP, defaultFxParams } from '../src/fx/params';
import { splitClip, TimelineError } from '../src/core/timeline';

const clip = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), fx: [], fit: 'fit', ...over,
});

function projectWith(c: Clip, trackOver: Record<string, unknown> = {}): Project {
  const p = emptyProject();
  return { ...p, tracks: [{ ...newTrack('video'), id: 'v', clips: [c], ...trackOver }, { ...newTrack('audio'), id: 'a', clips: [clip('au', { kind: 'audio' })] }] };
}
const fxOf = (p: Project, id = 'c'): VisualEffect[] => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.fx;

describe('addFx / updateFx / removeFx / moveFx', () => {
  it('adds an enabled effect with default params, at the end', () => {
    let p = projectWith(clip('c'));
    p = addFx(p, 'c', 'blur');
    p = addFx(p, 'c', 'color');
    expect(fxOf(p).map((e) => e.type)).toEqual(['blur', 'color']);
    expect(fxOf(p)[0]).toMatchObject({ enabled: true, params: defaultFxParams('blur') });
    expect(new Set(fxOf(p).map((e) => e.id)).size).toBe(2);
  });

  it('updates params (clamped), enabled and a lut ref; a no-op returns the same project', () => {
    let p = addFx(projectWith(clip('c')), 'c', 'blur');
    const id = fxOf(p)[0].id;
    const q = updateFx(p, 'c', id, { params: { radius: 500 } });
    expect(fxOf(q)[0].params.radius).toBe(100);
    expect(updateFx(q, 'c', id, { params: { radius: 100 } })).toBe(q);
    expect(updateFx(q, 'c', id, { enabled: true })).toBe(q);
    expect(fxOf(updateFx(q, 'c', id, { enabled: false }))[0].enabled).toBe(false);
    p = addFx(q, 'c', 'lut');
    const lutId = fxOf(p)[1].id;
    expect(fxOf(updateFx(p, 'c', lutId, { ref: 'l1' }))[1].ref).toBe('l1');
    expect(() => updateFx(p, 'c', 'nope', { enabled: false })).toThrow(TimelineError);
  });

  it('removes and moves effects', () => {
    let p = projectWith(clip('c'));
    for (const t of ['blur', 'color', 'bw'] as const) p = addFx(p, 'c', t);
    const [a, , c] = fxOf(p).map((e) => e.id);
    expect(fxOf(moveFx(p, 'c', c, 0)).map((e) => e.type)).toEqual(['bw', 'blur', 'color']);
    expect(fxOf(moveFx(p, 'c', a, 99)).map((e) => e.type)).toEqual(['color', 'bw', 'blur']);
    expect(moveFx(p, 'c', a, 0)).toBe(p);
    expect(fxOf(removeFx(p, 'c', a)).map((e) => e.type)).toEqual(['color', 'bw']);
    expect(() => removeFx(p, 'c', 'nope')).toThrow(TimelineError);
  });

  it('refuses audio clips, locked tracks and a 13th effect, and never mutates its input', () => {
    const p = projectWith(clip('c'));
    const copy = structuredClone(p);
    expect(() => addFx(p, 'au', 'blur')).toThrow(/no picture/);
    expect(() => addFx(projectWith(clip('c'), { locked: true }), 'c', 'blur')).toThrow(/locked/);
    let q = p;
    for (let i = 0; i < MAX_FX_PER_CLIP; i++) q = addFx(q, 'c', 'invert');
    expect(() => addFx(q, 'c', 'invert')).toThrow('A clip can have at most 12 effects');
    addFx(p, 'c', 'blur');
    expect(p).toEqual(copy);
  });

  it('works on image and overlay clips', () => {
    for (const kind of ['image', 'overlay'] as const) {
      const p = addFx(projectWith(clip('c', { kind })), 'c', 'sepia');
      expect(fxOf(p)).toHaveLength(1);
    }
  });
});

describe('setFxStack (paste)', () => {
  it('replaces the stack with copies that have new ids and clamped params', () => {
    const src: VisualEffect[] = [
      { id: 'x1', type: 'blur', enabled: true, params: { radius: 999 } },
      { id: 'x2', type: 'lut', enabled: false, params: {}, ref: 'l1' },
    ];
    const p = setFxStack(projectWith(clip('c')), 'c', src);
    const out = fxOf(p);
    expect(out.map((e) => e.type)).toEqual(['blur', 'lut']);
    expect(out[0].params.radius).toBe(100);
    expect(out[1]).toMatchObject({ enabled: false, ref: 'l1' });
    expect(out.map((e) => e.id)).not.toContain('x1');
    expect(src[0].id).toBe('x1');
  });

  it('refuses more than 12 effects, audio clips and locked tracks', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `e${i}`, type: 'invert' as const, enabled: true, params: {} }));
    expect(() => setFxStack(projectWith(clip('c')), 'c', many)).toThrow(/at most 12/);
    expect(() => setFxStack(projectWith(clip('c')), 'au', [])).toThrow(/no picture/);
    expect(() => setFxStack(projectWith(clip('c'), { locked: true }), 'c', [])).toThrow(/locked/);
  });
});

describe('applyLook', () => {
  it('adds one look effect and re-applying changes it instead of stacking another', () => {
    let p = applyLook(projectWith(clip('c')), 'c', 'tealOrange', 0.8);
    expect(fxOf(p)).toHaveLength(1);
    expect(fxOf(p)[0]).toMatchObject({ type: 'look', enabled: true, params: { preset: 3, intensity: 0.8 } });
    const id = fxOf(p)[0].id;
    p = applyLook(p, 'c', 'moody');
    expect(fxOf(p)).toHaveLength(1);
    expect(fxOf(p)[0]).toMatchObject({ id, params: { preset: 1, intensity: 1 } });
  });
});

describe('splitClip with effects', () => {
  it('gives both halves equal stacks with all-new, unique ids', () => {
    let p = projectWith(clip('c'));
    p = addFx(addFx(p, 'c', 'blur'), 'c', 'color');
    const before = fxOf(p);
    const q = splitClip(p, 'c', 2);
    const [left, right] = q.tracks[0].clips;
    expect(left.fx.map((e) => [e.type, e.params])).toEqual(before.map((e) => [e.type, e.params]));
    expect(right.fx.map((e) => [e.type, e.params])).toEqual(before.map((e) => [e.type, e.params]));
    const ids = [...left.fx, ...right.fx, ...before].map((e) => e.id);
    expect(new Set(ids).size).toBe(6);
  });
});

describe('LUT library', () => {
  it('addLut registers a LUT (same reference when identical); removeLut refuses while any clip references it', () => {
    let p = addLut(projectWith(clip('c')), { id: 'l1', name: 'Warm', size: 33 });
    expect(p.luts.l1).toEqual({ id: 'l1', name: 'Warm', size: 33 });
    expect(addLut(p, { id: 'l1', name: 'Warm', size: 33 })).toBe(p);
    p = addFx(p, 'c', 'lut');
    p = updateFx(p, 'c', fxOf(p)[0].id, { ref: 'l1', enabled: false });
    expect(() => removeLut(p, 'l1')).toThrow(/used by a clip/);
    p = removeFx(p, 'c', fxOf(p)[0].id);
    expect(removeLut(p, 'l1').luts).toEqual({});
    expect(removeLut(p, 'unknown')).toBe(p);
  });
});
