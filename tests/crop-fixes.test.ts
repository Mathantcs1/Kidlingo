// Plan 5E review wave: Reset/fit with a pivot, movePivotTo refusals, resolver identity, inset clamp, golden matrices.
import { describe, it, expect } from 'vitest';
import { resolveClip, resolvedTransform } from '../src/core/animate';
import { movePivotTo, setAnchor } from '../src/core/cropEdits';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { resetClipTransform } from '../src/core/transformEdits';
import { setClipFit } from '../src/ui/edits';
import { croppedUvMatrix } from '../src/render/cropGeometry';
import { applyMat3, clipMatrix, uvMatrix } from '../src/render/geometry';
import { frameCorners } from '../src/render/overlayGeometry';

const lin = { kind: 'linear' as const };
const vclip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c1', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
function proj(clip: Clip = vclip(), media = { width: 1920, height: 1080 }): Project {
  const p = emptyProject('youtube'); // 1920x1080
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, ...media, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: [clip] };
  return p;
}
const get = (p: Project) => p.tracks[0].clips[0];
const FMT = { width: 1920, height: 1080 };
const mean = (q: { x: number; y: number }[]) => ({ x: q.reduce((s, c) => s + c.x, 0) / 4, y: q.reduce((s, c) => s + c.y, 0) / 4 });

describe('Reset transform', () => {
  it('is a no-op (same project) when only anchor keys exist and the clip is already at its fit', () => {
    const p = proj(vclip({ keys: { anchor: [{ t: 0, x: 0.1, y: 0, ease: lin }, { t: 1, x: 0.2, y: 0, ease: lin }] } }));
    expect(resetClipTransform(p, 'c1')).toBe(p);
  });
  it('with a static pivot the PICTURE returns to the fit framing (its centre on the canvas centre)', () => {
    const p = proj(vclip({ anchor: { x: 0.25, y: -0.1 }, transform: { ...defaultTransform(), x: 400, y: 70, scale: 0.3, rotation: 40 } }));
    const t = get(resetClipTransform(p, 'c1')).transform;
    const c = mean(frameCorners({ width: 1920, height: 1080 }, t, FMT, { anchor: { x: 0.25, y: -0.1 } }));
    expect(c.x).toBeCloseTo(960, 9);
    expect(c.y).toBeCloseTo(540, 9);
    expect(t.scale).toBe(1);
    expect(t.rotation).toBe(0);
  });
  it('is still a no-op at the pivot-aware fit, and keeps the anchor', () => {
    const p = proj(vclip({ anchor: { x: 0.25, y: -0.1 } }));
    const once = resetClipTransform(p, 'c1');
    expect(get(once).anchor).toEqual({ x: 0.25, y: -0.1 });
    expect(resetClipTransform(once, 'c1')).toBe(once);
  });
});

describe('Frame mode with a pivot', () => {
  it('setClipFit keeps the picture framed (rotation kept)', () => {
    const p = proj(vclip({ anchor: { x: -0.2, y: 0.3 }, fit: 'fit', transform: { ...defaultTransform(), rotation: 30 } }));
    const t = get(setClipFit(p, 'c1', 'fill')).transform;
    const c = mean(frameCorners({ width: 1920, height: 1080 }, t, FMT, { anchor: { x: -0.2, y: 0.3 } }));
    expect(c.x).toBeCloseTo(960, 9);
    expect(c.y).toBeCloseTo(540, 9);
    expect(t.rotation).toBe(30);
  });
});

describe('movePivotTo refusals', () => {
  it('refuses a pivot so far away that the anchor would clamp (the picture would jump)', () => {
    expect(() => movePivotTo(proj(vclip({ transform: { ...defaultTransform(), scale: 0.15 } })), 'c1', { x: 1900, y: 540 })).toThrow(/far/i);
  });
  it('refuses a static scale of 0 and never stores NaN', () => {
    expect(() => movePivotTo(proj(vclip({ transform: { ...defaultTransform(), scale: 0 } })), 'c1', { x: 10, y: 10 })).toThrow();
    expect(() => movePivotTo(proj(vclip({ transform: { ...defaultTransform(), scale: NaN } })), 'c1', { x: 10, y: 10 })).toThrow();
  });
  it('refuses a position beyond four format sizes instead of clamping it', () => {
    expect(() => movePivotTo(proj(vclip({ transform: { ...defaultTransform(), scale: 20 } })), 'c1', { x: 20000, y: 540 })).toThrow();
  });
  it('setAnchor still works for the same far value (the field path clamps)', () => {
    expect(get(setAnchor(proj(), 'c1', { x: 9, y: 0 })).anchor).toEqual({ x: 2, y: 0 });
  });
});

describe('resolver identity', () => {
  const F = { width: 1920, height: 1080, fps: 30 };
  it('a static clip with crop, flip and anchor all set comes back as the same object', () => {
    const c = vclip({ crop: { left: 0.1, top: 0, right: 0, bottom: 0 }, flip: { h: true }, anchor: { x: 0.1, y: 0.1 } });
    expect(resolveClip(c, 1, F)).toBe(c);
  });
  it('a clip whose only keys are anchor keys keeps its stored transform object', () => {
    const c = vclip({ keys: { anchor: [{ t: 0, x: 0, y: 0, ease: lin }, { t: 1, x: 1, y: 0, ease: lin }] } });
    expect(resolvedTransform(c, 0.5, 30)).toBe(c.transform);
  });
});

describe('golden clipMatrix (the 5B formula, written out)', () => {
  const old = (w: number, h: number, t: { x: number; y: number; scale: number; rotation: number }, cw: number, ch: number) => {
    const sw = w * t.scale; const sh = h * t.scale; const rad = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    const ax = 2 / cw; const ay = -2 / ch;
    return [ax * sw * cos, ay * sw * sin, 0, ax * -sh * sin, ay * sh * cos, 0, ax * (-0.5 * sw * cos + 0.5 * sh * sin + t.x), ay * (-0.5 * sw * sin - 0.5 * sh * cos + t.y), 1];
  };
  it('no view, an empty view and a zero view all equal the written-out formula', () => {
    for (const t of [{ x: 0, y: 0, scale: 1, rotation: 0 }, { x: 12.5, y: -80, scale: 0.37, rotation: 33 }, { x: -300, y: 40, scale: 3, rotation: -135 }]) {
      const tr = { ...t, opacity: 1 };
      const want = old(1280, 720, t, 1920, 1080);
      expect(clipMatrix({ width: 1280, height: 720 }, tr, FMT)).toEqual(want);
      expect(clipMatrix({ width: 1280, height: 720 }, tr, FMT, {})).toEqual(want);
      expect(clipMatrix({ width: 1280, height: 720 }, tr, FMT, { anchor: { x: 0, y: 0 } })).toEqual(want);
    }
  });
});

describe('croppedUvMatrix inset', () => {
  const I = uvMatrix(0);
  it('with a flip the inset still lands on the cropped edge', () => {
    const m = croppedUvMatrix(I, { left: 0.5, top: 0, right: 0, bottom: 0 }, { h: true }, { x: 0.01, y: 0.01 });
    const [u0] = applyMat3(m, 0, 0);
    const [u1] = applyMat3(m, 1, 0);
    expect(u0).toBeCloseTo(1, 12); // flipped: the left of the view is the right of the crop (no crop on that edge)
    expect(u1).toBeCloseTo(0.51, 12); // the cropped edge keeps its half-texel inset
  });
  it('on a rotated source the inset follows the displayed axes', () => {
    const o = uvMatrix(90);
    const m = croppedUvMatrix(o, { left: 0.5, top: 0, right: 0, bottom: 0 }, undefined, { x: 0.02, y: 0.001 });
    expect(applyMat3(m, 0, 0)).toEqual(applyMat3(o, 0.52, 0));
  });
  it('is clamped so a sub-texel remainder never mirrors the lookup', () => {
    const m = croppedUvMatrix(I, { left: 0.499, top: 0, right: 0.499, bottom: 0 }, undefined, { x: 0.1, y: 0 });
    const [a] = applyMat3(m, 0, 0);
    const [b] = applyMat3(m, 1, 0);
    expect(b).toBeGreaterThan(a);
  });
});
