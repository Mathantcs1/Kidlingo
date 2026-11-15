import { describe, it, expect } from 'vitest';
import { emptyProject, newTrack } from '../src/core/model';
import type { Clip, OverlayType, Project } from '../src/core/model';
import { addOverlay, updateOverlay } from '../src/core/overlayEdits';
import { reframeProject } from '../src/core/merge';
import { moveClip, splitClip, TimelineError } from '../src/core/timeline';
import { OVERLAY_DEFAULTS, OVERLAY_SIZES, clampOverlayParams, initialTransform } from '../src/overlays/spec';

const overlays = (p: Project): Clip[] => p.tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'overlay');
const videoTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'video');
const TYPES: OverlayType[] = ['lowerThird', 'subscribe', 'progress', 'sticker'];

describe('overlay spec', () => {
  it('clamps params, fills missing keys with defaults and drops unknown ones', () => {
    const p = clampOverlayParams('progress', { corner: 9, source: 0.4, bogus: 1, accent: -5 });
    expect(p.corner).toBe(1);
    expect(p.source).toBe(0);
    expect(p.accent).toBe(0);
    expect(p).not.toHaveProperty('bogus');
    expect(p.background).toBe(OVERLAY_DEFAULTS.progress.params.background);
    expect(clampOverlayParams('sticker', { shape: 99 }).shape).toBe(11);
    expect(clampOverlayParams('sticker', { shape: NaN }).shape).toBe(OVERLAY_DEFAULTS.sticker.params.shape);
  });

  it('places each overlay inside a 1920x1080 canvas at its documented spot and size', () => {
    const f = { width: 1920, height: 1080 };
    const box = (type: OverlayType) => {
      const t = initialTransform(type, f);
      const s = OVERLAY_SIZES[type];
      const w = s.width * t.scale;
      const h = s.height * t.scale;
      return { left: f.width / 2 + t.x - w / 2, right: f.width / 2 + t.x + w / 2, top: f.height / 2 + t.y - h / 2, bottom: f.height / 2 + t.y + h / 2, w, h };
    };
    for (const type of TYPES) {
      const b = box(type);
      expect(b.left, type).toBeGreaterThanOrEqual(-1e-9);
      expect(b.right, type).toBeLessThanOrEqual(1920 + 1e-9);
      expect(b.top, type).toBeGreaterThanOrEqual(-1e-9);
      expect(b.bottom, type).toBeLessThanOrEqual(1080 + 1e-9);
    }
    expect(box('lowerThird').w / 1920).toBeCloseTo(0.45, 6);
    expect(box('lowerThird').left).toBeLessThan(960);
    expect(box('subscribe').w / 1920).toBeCloseTo(0.22, 6);
    expect(box('subscribe').right).toBeGreaterThan(960);
    expect(box('progress').w).toBeCloseTo(1920, 6);
    expect(box('progress').bottom).toBeCloseTo(1080, 6);
    expect(box('sticker').w / 1080).toBeCloseTo(0.2, 6);
    expect((box('sticker').left + box('sticker').right) / 2).toBeCloseTo(960, 6);
  });
});

describe('addOverlay', () => {
  it('adds a 3 s overlay clip on the first video track with the default spec, in the format-sized place', () => {
    const p = addOverlay(emptyProject(), 'lowerThird', { start: 1.5 });
    const [c] = overlays(p);
    expect(c).toMatchObject({ kind: 'overlay', mediaId: '', start: 1.5, in: 0, out: 3, fit: 'fit', fx: [] });
    expect(c.overlay).toEqual(OVERLAY_DEFAULTS.lowerThird);
    expect(c.transform).toEqual(initialTransform('lowerThird', p.format));
    expect(p.tracks.find((t) => t.clips.includes(c))!.kind).toBe('video');
  });

  it('a progress bar spans the timeline after its start, between 3 and 10 seconds', () => {
    const base = emptyProject();
    expect(overlays(addOverlay(base, 'progress', { start: 0 }))[0].out).toBe(3);
    const long = addOverlay(addOverlay(base, 'sticker', { start: 0 }), 'sticker', { start: 40 });
    const bar = overlays(addOverlay(long, 'progress', { start: 5 })).find((c) => c.overlay!.type === 'progress')!;
    expect(bar.out).toBe(10);
  });

  it('goes to the requested track when free, else the next free video track, else a new one; 8 tracks full throws', () => {
    let p = emptyProject();
    const first = videoTracks(p)[0].id;
    p = addOverlay(p, 'sticker', { start: 0 });
    p = addOverlay(p, 'sticker', { start: 1, trackId: first });
    expect(videoTracks(p)).toHaveLength(2);
    expect(videoTracks(p)[0].clips).toHaveLength(1);
    expect(videoTracks(p)[1].clips).toHaveLength(1);
    for (let i = 0; i < 20; i++) {
      try {
        p = addOverlay(p, 'sticker', { start: 0 });
      } catch (e) {
        expect(e).toBeInstanceOf(TimelineError);
        break;
      }
    }
    expect(videoTracks(p)).toHaveLength(8);
    expect(() => addOverlay(p, 'sticker', { start: 0 })).toThrow(/At most 8/);
  });

  it('skips a locked track, refuses a bad start and never mutates its input', () => {
    const base = emptyProject();
    const locked: Project = { ...base, tracks: base.tracks.map((t) => (t.kind === 'video' ? { ...t, locked: true } : t)) };
    const copy = structuredClone(locked);
    const p = addOverlay(locked, 'subscribe', { start: 0, trackId: locked.tracks[0].id });
    expect(locked).toEqual(copy);
    expect(videoTracks(p)).toHaveLength(2);
    expect(videoTracks(p)[0].clips).toHaveLength(0);
    expect(() => addOverlay(base, 'subscribe', { start: NaN })).toThrow(TimelineError);
    expect(() => addOverlay(base, 'subscribe', { start: -1 })).toThrow(TimelineError);
    const audio = base.tracks.find((t) => t.kind === 'audio')!.id;
    expect(() => addOverlay(base, 'subscribe', { start: 0, trackId: audio })).toThrow(TimelineError);
  });
});

describe('updateOverlay', () => {
  const start = () => {
    const p = addOverlay(emptyProject(), 'lowerThird', { start: 0 });
    return { p, id: overlays(p)[0].id };
  };

  it('sets text (capped at 60 and 80 characters) and clamped params; a no-op returns the same project', () => {
    const { p, id } = start();
    const q = updateOverlay(p, id, { text: 'x'.repeat(100), subtext: 'y'.repeat(100), params: { corner: 7 } });
    const o = overlays(q)[0].overlay!;
    expect(Array.from(o.text)).toHaveLength(60);
    expect(Array.from(o.subtext)).toHaveLength(80);
    expect(o.params.corner).toBe(1);
    expect(updateOverlay(q, id, { text: 'x'.repeat(60) })).toBe(q);
    expect(updateOverlay(q, id, {})).toBe(q);
    expect(updateOverlay(q, id, { params: { corner: 1 } })).toBe(q);
  });

  it('refuses a non-overlay clip and a locked track', () => {
    const { p, id } = start();
    const clip: Clip = { ...overlays(p)[0], id: 'plain', kind: 'image', overlay: undefined, start: 10 };
    const withImage: Project = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [...t.clips, clip] } : t)) };
    expect(() => updateOverlay(withImage, 'plain', { text: 'x' })).toThrow(/not an overlay/i);
    const locked: Project = { ...p, tracks: p.tracks.map((t) => ({ ...t, locked: true })) };
    expect(() => updateOverlay(locked, id, { text: 'x' })).toThrow(/locked/);
  });
});

describe('overlay clips in the timeline', () => {
  it('split keeps the spec on both halves with separate effect ids; move works between video tracks but not onto audio', () => {
    let p = addOverlay(emptyProject(), 'sticker', { start: 0 });
    const id = overlays(p)[0].id;
    p = splitClip(p, id, 1.5);
    const [a, b] = overlays(p);
    expect(a.overlay).toEqual(b.overlay);
    const v2 = newTrack('video');
    const moved = moveClip({ ...p, tracks: [...p.tracks, v2] }, b.id, 4, v2.id);
    expect(moved.tracks.find((t) => t.id === v2.id)!.clips[0].id).toBe(b.id);
    const audio = p.tracks.find((t) => t.kind === 'audio')!.id;
    expect(() => moveClip(p, b.id, 4, audio)).toThrow(TimelineError);
  });

  it('a format switch keeps the relative placement and round-trips exactly', () => {
    const p = addOverlay(emptyProject(), 'lowerThird', { start: 0 });
    const before = overlays(p)[0].transform;
    const there = reframeProject(p, 'vertical');
    const t = overlays(there)[0].transform;
    expect(t).not.toEqual(before);
    expect(t.x / there.format.width).toBeCloseTo(before.x / p.format.width, 9);
    expect(t.y / there.format.height).toBeCloseTo(before.y / p.format.height, 9);
    const back = reframeProject(there, 'youtube');
    const r = overlays(back)[0].transform;
    for (const k of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) expect(r[k]).toBeCloseTo(before[k], 9);
  });
});
