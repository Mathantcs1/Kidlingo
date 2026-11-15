// Plan 5E Task 3: pure crop / flip / anchor edits (D2, D3, D4, D8) and how clip operations treat them (D9).
import { describe, it, expect } from 'vitest';
import { anchorToCropCentre, fitToCrop, resetAnchor, resetCrop, setAnchor, setCrop, setFlip } from '../src/core/cropEdits';
import { detachAudio } from '../src/core/detachAudio';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { splitClip, trimClip } from '../src/core/clipEdits';
import { clipCorners } from '../src/render/overlayGeometry';

const vclip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c1', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 4, transform: { ...defaultTransform(), scale: 0.5 }, volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
function proj(clip: Clip = vclip(), locked = false): Project {
  const p = emptyProject('youtube'); // 1920x1080
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, width: 3840, height: 2160, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', locked, clips: [clip] };
  return p;
}
const get = (p: Project, id = 'c1') => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;

describe('setCrop', () => {
  it('stores the edges, merges patches, and returns the same project for a no-op', () => {
    const p = setCrop(proj(), 'c1', { left: 0.1, top: 0.2 });
    expect(get(p).crop).toEqual({ left: 0.1, top: 0.2, right: 0, bottom: 0 });
    expect(setCrop(p, 'c1', { left: 0.1 })).toBe(p);
    expect(get(setCrop(p, 'c1', { right: 0.3 })).crop).toEqual({ left: 0.1, top: 0.2, right: 0.3, bottom: 0 });
  });
  it('an all-zero crop removes the field', () => {
    const p = setCrop(proj(), 'c1', { left: 0.1 });
    expect(get(setCrop(p, 'c1', { left: 0 }))).not.toHaveProperty('crop');
    expect(get(resetCrop(p, 'c1'))).not.toHaveProperty('crop');
    expect(resetCrop(proj(), 'c1')).toBeInstanceOf(Object);
  });
  it('caps the edited edge so the opposite one is not squeezed (D2)', () => {
    const p = setCrop(proj(), 'c1', { right: 0.5 });
    const q = setCrop(p, 'c1', { left: 0.9 });
    expect(get(q).crop!.right).toBe(0.5);
    expect(get(q).crop!.left).toBeCloseTo(0.5 - 0.02, 12 - 2);
  });
  it('keeps at least 8 source pixels on a small source', () => {
    const p = proj();
    p.media.m1 = { ...p.media.m1, width: 100, height: 100 };
    const q = setCrop(p, 'c1', { left: 0.95 });
    expect(get(q).crop!.left).toBeCloseTo(1 - 0.08, 12);
  });
  it('throws on non-finite values, audio/overlay/adjustment clips and locked tracks', () => {
    expect(() => setCrop(proj(), 'c1', { left: NaN })).toThrow();
    expect(() => setCrop(proj(vclip({ kind: 'audio' })), 'c1', { left: 0.1 })).toThrow();
    expect(() => setCrop(proj(vclip({ kind: 'adjustment', mediaId: '' })), 'c1', { left: 0.1 })).toThrow();
    expect(() => setCrop(proj(vclip(), true), 'c1', { left: 0.1 })).toThrow(/locked/i);
  });
  it('never mutates its input', () => {
    const p = proj();
    const snap = JSON.stringify(p);
    setCrop(p, 'c1', { left: 0.1 });
    expect(JSON.stringify(p)).toBe(snap);
  });
});

describe('setFlip', () => {
  it('sets, clears and no-ops; false is never stored', () => {
    const p = setFlip(proj(), 'c1', { h: true });
    expect(get(p).flip).toEqual({ h: true });
    expect(setFlip(p, 'c1', { h: true })).toBe(p);
    expect(get(setFlip(p, 'c1', { v: true })).flip).toEqual({ h: true, v: true });
    expect(get(setFlip(p, 'c1', { h: false }))).not.toHaveProperty('flip');
  });
  it('is refused on a locked track', () => expect(() => setFlip(proj(vclip(), true), 'c1', { h: true })).toThrow(/locked/i));
});

describe('setAnchor', () => {
  it('stores, clamps to ±2, clears at {0,0}', () => {
    const p = setAnchor(proj(), 'c1', { x: 0.25, y: -0.25 });
    expect(get(p).anchor).toEqual({ x: 0.25, y: -0.25 });
    expect(setAnchor(p, 'c1', { x: 0.25, y: -0.25 })).toBe(p);
    expect(get(setAnchor(p, 'c1', { x: 9, y: -9 })).anchor).toEqual({ x: 2, y: -2 });
    expect(get(setAnchor(p, 'c1', { x: 0, y: 0 }))).not.toHaveProperty('anchor');
    expect(get(resetAnchor(p, 'c1'))).not.toHaveProperty('anchor');
    expect(() => setAnchor(p, 'c1', { x: NaN, y: 0 })).toThrow();
  });
  it('does not touch the transform (the picture moves, D4)', () => {
    const p = proj();
    expect(get(setAnchor(p, 'c1', { x: 0.3, y: 0.1 })).transform).toEqual(get(p).transform);
  });
});

describe('anchorToCropCentre', () => {
  it('puts the pivot at the centre of the visible rectangle', () => {
    const p = setCrop(proj(), 'c1', { left: 0.2, right: 0.1, top: 0.4, bottom: 0 });
    const q = anchorToCropCentre(p, 'c1');
    expect(get(q).anchor!.x).toBeCloseTo((0.2 - 0.1) / 2, 12);
    expect(get(q).anchor!.y).toBeCloseTo((0.4 - 0) / 2, 12);
  });
  it('without a crop clears the anchor', () => {
    const p = setAnchor(proj(), 'c1', { x: 0.2, y: 0 });
    expect(get(anchorToCropCentre(p, 'c1'))).not.toHaveProperty('anchor');
  });
});

describe('fitToCrop (D8)', () => {
  const FORMAT = { width: 1920, height: 1080 };
  const bounds = (p: Project) => {
    const c = get(p);
    const m = p.media.m1;
    const corners = clipCorners({ width: m.width!, height: m.height! }, c.transform, FORMAT, { crop: c.crop, anchor: c.anchor });
    const xs = corners.map((q) => q.x);
    const ys = corners.map((q) => q.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  it('fit: the visible rectangle sits inside the canvas, centred, touching it on one axis', () => {
    const p = setCrop(proj(vclip({ transform: { ...defaultTransform(), x: 40, y: -30, scale: 0.3 } })), 'c1', { left: 0.25, right: 0.25 });
    const b = bounds(fitToCrop(p, 'c1', 'fit'));
    expect((b.x0 + b.x1) / 2).toBeCloseTo(960, 6);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(540, 6);
    expect(b.y1 - b.y0).toBeCloseTo(1080, 6);
    expect(b.x1 - b.x0).toBeLessThanOrEqual(1920 + 1e-6);
  });
  it('fill covers the canvas, with an anchor and an asymmetric crop', () => {
    const p = setAnchor(setCrop(proj(), 'c1', { left: 0.4, top: 0.1, right: 0, bottom: 0.3 }), 'c1', { x: 0.05, y: 0.25 });
    const b = bounds(fitToCrop(p, 'c1', 'fill'));
    expect((b.x0 + b.x1) / 2).toBeCloseTo(960, 6);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(540, 6);
    expect(b.x1 - b.x0).toBeGreaterThanOrEqual(1920 - 1e-6);
    expect(b.y1 - b.y0).toBeGreaterThanOrEqual(1080 - 1e-6);
  });
  it('stays centred when the clip is rotated (offset rotates with it)', () => {
    const p = setAnchor(setCrop(proj(vclip({ transform: { ...defaultTransform(), rotation: 40, scale: 0.4 } })), 'c1', { left: 0.4, top: 0.1, right: 0, bottom: 0.3 }), 'c1', { x: 0.05, y: 0.25 });
    const b = bounds(fitToCrop(p, 'c1', 'fit'));
    const c = get(fitToCrop(p, 'c1', 'fit'));
    expect(c.transform.rotation).toBe(40);
    // the crop's centre lands on the canvas centre: the mean of the quad corners
    const corners = clipCorners({ width: 3840, height: 2160 }, c.transform, FORMAT, { crop: c.crop, anchor: c.anchor });
    expect(corners.reduce((s, q) => s + q.x, 0) / 4).toBeCloseTo(960, 6);
    expect(corners.reduce((s, q) => s + q.y, 0) / 4).toBeCloseTo(540, 6);
    expect(b.x1).toBeGreaterThan(b.x0);
  });
  it('keeps rotation and opacity; refuses keyed position or scale', () => {
    const p = setCrop(proj(vclip({ transform: { ...defaultTransform(), rotation: 30, opacity: 0.5 } })), 'c1', { left: 0.2 });
    const q = get(fitToCrop(p, 'c1', 'fit')).transform;
    expect(q.rotation).toBe(30);
    expect(q.opacity).toBe(0.5);
    const keyed = proj(vclip({ keys: { position: [{ t: 0, x: 0, y: 0, ease: { kind: 'linear' } }] } }));
    expect(() => fitToCrop(setCrop(keyed, 'c1', { left: 0.2 }), 'c1', 'fit')).toThrow();
  });
  it('is a no-op without a crop', () => {
    const p = proj();
    expect(fitToCrop(p, 'c1', 'fit')).toBe(p);
  });
});

describe('clip operations keep crop, flip and anchor (D9)', () => {
  const full = () => setAnchor(setFlip(setCrop(proj(), 'c1', { left: 0.1, top: 0.1 }), 'c1', { h: true }), 'c1', { x: 0.1, y: 0 });
  it('split: both halves keep them; trim keeps them', () => {
    const p = splitClip(full(), 'c1', 2);
    for (const c of p.tracks[0].clips) {
      expect(c.crop).toEqual({ left: 0.1, top: 0.1, right: 0, bottom: 0 });
      expect(c.flip).toEqual({ h: true });
      expect(c.anchor).toEqual({ x: 0.1, y: 0 });
    }
    const t = trimClip(full(), 'c1', 'end', 3);
    expect(get(t).crop).toBeDefined();
  });
  it('the detached audio twin drops them', () => {
    const p = detachAudio(full(), 'c1');
    const twin = p.tracks.flatMap((t) => t.clips).find((c) => c.kind === 'audio')!;
    for (const k of ['crop', 'flip', 'anchor']) expect(twin).not.toHaveProperty(k);
    expect(get(p).crop).toBeDefined();
  });
});

describe('resolver and reframe pass crop, flip and anchor through', () => {
  it('resolveClip returns the same object for a static cropped clip and keeps the fields on an animated one', async () => {
    const { resolveClip } = await import('../src/core/animate');
    const c = vclip({ crop: { left: 0.1, top: 0, right: 0, bottom: 0 }, flip: { v: true }, anchor: { x: 0.1, y: 0.1 } });
    const f = { width: 1920, height: 1080, fps: 30 };
    expect(resolveClip(c, 1, f)).toBe(c);
    const k = { ...c, keys: { scale: [{ t: 0, v: 1, ease: { kind: 'linear' as const } }, { t: 2, v: 2, ease: { kind: 'linear' as const } }] } };
    const r = resolveClip(k, 1, f);
    expect(r.crop).toEqual(c.crop);
    expect(r.flip).toEqual(c.flip);
    expect(r.anchor).toEqual(c.anchor);
  });
  it('a format switch keeps them and round-trips', async () => {
    const { reframeProject } = await import('../src/core/merge');
    const p = setAnchor(setFlip(setCrop(proj(), 'c1', { left: 0.1 }), 'c1', { h: true }), 'c1', { x: 0.1, y: 0 });
    const q = reframeProject(p, 'vertical');
    expect(get(q).crop).toEqual(get(p).crop);
    expect(get(q).flip).toEqual(get(p).flip);
    expect(get(q).anchor).toEqual(get(p).anchor);
    expect(get(reframeProject(q, 'youtube')).transform.scale).toBeCloseTo(get(p).transform.scale, 12);
  });
});
