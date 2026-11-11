// Overlay clips have no media (Plan 4 Task 12 audit): every place that looks up media, sound, effects, blend, fit,
// merge, split and reframe treats them correctly.
import { describe, it, expect } from 'vitest';
import type { Project } from '../src/core/model';
import { TimelineError, splitClip } from '../src/core/timeline';
import { setTrackFlags } from '../src/core/tracks';
import { reframeProject } from '../src/core/merge';
import { addOverlayClip, overlayDefaultTransform } from '../src/core/overlays';
import { addVideoEffect, applyLook, setClipBlend } from '../src/core/videoEffectEdits';
import { audibleClips } from '../src/audio/plan';
import { referencedMedia } from '../src/media/gc';
import { clipsUsingMedia, hiddenLayerClipCount, mergeRefusal, replaceWithMedia, setClipFit } from '../src/ui/edits';
import { laneRejects } from '../src/ui/drag';
import { resetClipTransform, setClipTransform } from '../src/ui/transformEdits';
import { visualClipsAt } from '../src/render/visible';
import { skippedEffectTypes } from '../src/render/effects/unavailable';
import { all, base, overlays } from './overlay-fixtures';

describe('overlay clips are not media', () => {
  const p = (): Project => addOverlayClip(base(), 'v', 'lowerThird', 6);
  it('refuses picture effects, looks, blend modes and fit modes', () => {
    const q = p();
    const id = overlays(q)[0].id;
    const msg = new TimelineError('Overlays cannot have effects');
    expect(() => addVideoEffect(q, id, 'colour')).toThrow(msg);
    expect(() => applyLook(q, id, 'bw')).toThrow(msg);
    expect(() => setClipBlend(q, id, 'multiply')).toThrow(new TimelineError('Overlays cannot have a blend mode'));
    expect(() => setClipFit(q, id, 'blur')).toThrow(new TimelineError('Overlays have no frame to fit'));
  });
  it('is never audible, never referenced as media and never counted as a media use', () => {
    const q = p();
    expect(audibleClips(q).map((c) => c.id)).toEqual(['c1']);
    const refs = referencedMedia({ past: [], present: q, future: [] });
    expect([...refs]).toEqual(['m1']);
    expect(clipsUsingMedia(q, 'm1')).toBe(1);
    expect(clipsUsingMedia(q, '')).toBe(0);
  });
  it('is drawn on visible tracks only, and its (impossible) effects never count as skipped', () => {
    const q = p();
    expect(visualClipsAt(q, 7).map((c) => c.kind)).toEqual(['overlay']);
    const hidden = setTrackFlags(q, 'v', { hidden: true });
    expect(visualClipsAt(hidden, 7)).toEqual([]);
    const forced = { ...q, tracks: q.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.kind === 'overlay' ? { ...c, effects: [{ id: 'e', type: 'glow' as const, enabled: true, params: {} }] } : c)) })) };
    expect(skippedEffectTypes(forced, ['glow'])).toEqual([]);
  });
  it('merge-all counts overlay clips like any clip and replaces them', () => {
    const q = p();
    expect(mergeRefusal(q)).toBeNull();
    expect(mergeRefusal(setTrackFlags(q, 'v', { locked: true }))).toBe('Track is locked');
    expect(hiddenLayerClipCount(setTrackFlags(q, 'v', { hidden: true }))).toBe(2);
    const merged = replaceWithMedia(q, { id: 'mm', name: 'merged.mp4', kind: 'video', duration: 11, width: 1920, height: 1080, hasAudio: true });
    expect(overlays(merged)).toEqual([]);
    expect(all(merged).map((c) => c.mediaId)).toEqual(['mm']);
  });
  it('splits into two overlays with the same spec and new ids', () => {
    const q = p();
    const o = overlays(q)[0];
    const r = splitClip(q, o.id, 8);
    const parts = overlays(r);
    expect(parts).toHaveLength(2);
    expect(parts[0].overlay).toEqual(o.overlay);
    expect(parts[1].overlay).toEqual(o.overlay);
    expect(parts[0].id).not.toBe(parts[1].id);
  });
  it('moves with the transform fields and resets to its default place', () => {
    const q = p();
    const id = overlays(q)[0].id;
    const moved = setClipTransform(q, id, { x: 10, y: 20, scale: 2, rotation: 30, opacity: 0.4 });
    expect(overlays(resetClipTransform(moved, id))[0].transform).toEqual(overlayDefaultTransform('lowerThird', q.format));
    expect(resetClipTransform(q, id)).toBe(q);
  });
  it('lanes take overlays on video tracks only', () => {
    expect(laneRejects('video', 'overlay')).toBeNull();
    expect(laneRejects('audio', 'overlay')).not.toBeNull();
  });
});

describe('reframeProject with overlays', () => {
  it('moves a default-placed overlay to the new default; keeps a customised one relative', () => {
    let q = addOverlayClip(base(), 'v', 'subscribe', 6);
    q = addOverlayClip(q, 'v', 'sticker', 12);
    const custom = overlays(q)[1].id;
    q = { ...q, tracks: q.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === custom ? { ...c, transform: { ...c.transform, x: 100, y: -50, scale: 2, rotation: 15, opacity: 0.5 } } : c)) })) };
    const r = reframeProject(q, 'vertical');
    const [sub, st] = overlays(r);
    expect(sub.transform).toEqual(overlayDefaultTransform('subscribe', r.format));
    expect(st.transform).toEqual({ x: 100 * (1080 / 1920), y: -50 * (1920 / 1080), scale: 2, rotation: 15, opacity: 0.5 });
    const back = reframeProject(r, 'youtube');
    expect(overlays(back)[0].transform).toEqual(overlays(q)[0].transform);
    expect(overlays(back)[1].transform.x).toBeCloseTo(100, 9);
    expect(overlays(back)[1].transform.y).toBeCloseTo(-50, 9);
  });
});
