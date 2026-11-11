// Overlay clips (Plan 4 Task 12): defaults, geometry, placement on the timeline and spec edits. Pure.
import { describe, it, expect } from 'vitest';
import { defaultClipAudio, newTrack } from '../src/core/model';
import type { Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { MAX_TRACKS_PER_KIND, setTrackFlags } from '../src/core/tracks';
import {
  addOverlayClip, newOverlayClip, overlayBaseSize, overlayDefaultTransform, overlayLabel, updateOverlay,
} from '../src/core/overlays';
import { OVERLAY_TYPES, STICKER_KINDS, overlayDefaults } from '../src/core/overlaySpec';
import { base, overlays, video } from './overlay-fixtures';

describe('overlayDefaults', () => {
  it('gives every type its own default text and colours, a sticker only for stickers', () => {
    for (const type of OVERLAY_TYPES) {
      const s = overlayDefaults(type);
      expect(s.type).toBe(type);
      expect(s.colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof s.text).toBe('string');
      expect(typeof s.subtext).toBe('string');
      expect('sticker' in s).toBe(type === 'sticker');
    }
    expect(overlayDefaults('sticker').sticker).toBe('heart');
    expect(overlayDefaults('lowerThird').text).toBe('Your Name');
    expect(overlayDefaults('subscribe').text).toBe('SUBSCRIBE');
    expect(STICKER_KINDS).toEqual(['heart', 'star', 'arrow', 'like', 'bell', 'fire', 'check', 'sparkle']);
  });
  it('returns a fresh object each call', () => {
    expect(overlayDefaults('lowerThird')).not.toBe(overlayDefaults('lowerThird'));
  });
});

describe('overlay geometry', () => {
  const hd = { width: 1920, height: 1080 };
  const tall = { width: 1080, height: 1920 };
  it('sizes overlays from the short side; the progress bar spans the full width', () => {
    expect(overlayBaseSize('lowerThird', hd)).toEqual({ width: 864, height: 216 });
    expect(overlayBaseSize('lowerThird', tall)).toEqual({ width: 864, height: 216 });
    expect(overlayBaseSize('subscribe', hd)).toEqual({ width: 432, height: 119 });
    expect(overlayBaseSize('progressBar', hd)).toEqual({ width: 1920, height: 27 });
    expect(overlayBaseSize('progressBar', tall)).toEqual({ width: 1080, height: 27 });
    expect(overlayBaseSize('sticker', hd)).toEqual({ width: 324, height: 324 });
    expect(overlayBaseSize('progressBar', { width: 10, height: 10 }).height).toBeGreaterThanOrEqual(1);
  });
  it('places lower thirds bottom-left, subscribe bottom-right, the bar on the bottom edge, stickers centred', () => {
    for (const f of [hd, tall]) {
      const box = (type: (typeof OVERLAY_TYPES)[number]) => {
        const t = overlayDefaultTransform(type, f);
        const s = overlayBaseSize(type, f);
        expect(t).toMatchObject({ scale: 1, rotation: 0, opacity: 1 });
        return { l: t.x - s.width / 2, r: t.x + s.width / 2, top: t.y - s.height / 2, b: t.y + s.height / 2 };
      };
      const W = f.width / 2;
      const H = f.height / 2;
      const lt = box('lowerThird');
      expect(lt.l).toBeGreaterThan(-W);
      expect(lt.l).toBeLessThan(-W + 0.1 * f.width);
      expect(lt.b).toBeLessThan(H);
      expect(lt.b).toBeGreaterThan(H - 0.15 * f.height);
      const sub = box('subscribe');
      expect(sub.r).toBeLessThan(W);
      expect(sub.r).toBeGreaterThan(W - 0.1 * f.width);
      expect(sub.b).toBeLessThan(H);
      expect(sub.b).toBeGreaterThan(H - 0.1 * f.height);
      const bar = box('progressBar');
      expect([bar.l, bar.r, bar.b]).toEqual([-W, W, H]);
      expect(overlayDefaultTransform('sticker', f)).toMatchObject({ x: 0, y: 0 });
    }
  });
});

describe('newOverlayClip', () => {
  it('has no media, no effects, normal blend, fit and the default placement and spec', () => {
    const c = newOverlayClip('subscribe', 2, 3, { width: 1920, height: 1080 });
    expect(c).toMatchObject({ kind: 'overlay', mediaId: '', start: 2, in: 0, out: 3, effects: [], blend: 'normal', fit: 'fit' });
    expect(c.overlay).toEqual(overlayDefaults('subscribe'));
    expect(c.transform).toEqual(overlayDefaultTransform('subscribe', { width: 1920, height: 1080 }));
    expect(c.audio).toEqual(defaultClipAudio());
  });
  it('labels overlays by type and sticker', () => {
    expect(overlayLabel(newOverlayClip('lowerThird', 0, 1, { width: 10, height: 10 }))).toBe('Lower third');
    const s = newOverlayClip('sticker', 0, 1, { width: 10, height: 10 });
    expect(overlayLabel({ ...s, overlay: { ...s.overlay!, sticker: 'fire' } })).toBe('Sticker: Fire');
  });
});

describe('addOverlayClip', () => {
  it('adds to the target video track when it has room, without mutating the input', () => {
    const p = base();
    const snap = JSON.stringify(p);
    const q = addOverlayClip(p, 'v', 'lowerThird', 5);
    expect(JSON.stringify(p)).toBe(snap);
    expect(q.tracks).toHaveLength(2);
    const o = q.tracks[0].clips.find((c) => c.kind === 'overlay')!;
    expect(o).toMatchObject({ start: 5, in: 0, out: 5, mediaId: '' });
    expect(q.tracks[0].clips.map((c) => c.start)).toEqual([0, 5]);
  });
  it('uses the given duration and clamps a negative start to 0', () => {
    const q = addOverlayClip({ ...base(), tracks: [{ ...newTrack('video'), id: 'v' }] }, 'v', 'sticker', -3, 2);
    expect(overlays(q)[0]).toMatchObject({ start: 0, out: 2 });
  });
  it('makes a new video layer above the others when the target has no room', () => {
    const p = base();
    const q = addOverlayClip(p, 'v', 'progressBar', 1);
    expect(q.tracks.map((t) => t.kind)).toEqual(['video', 'video', 'audio']);
    expect(q.tracks[0].clips).toHaveLength(1);
    expect(q.tracks[1].clips[0]).toMatchObject({ kind: 'overlay', start: 1 });
  });
  it('refuses a locked target, an audio track, a full layer stack and bad times', () => {
    const p = base();
    expect(() => addOverlayClip(setTrackFlags(p, 'v', { locked: true }), 'v', 'sticker', 6)).toThrow(new TimelineError('Track is locked'));
    expect(() => addOverlayClip(p, 'a', 'sticker', 6)).toThrow(new TimelineError('Overlays go on a video track'));
    expect(() => addOverlayClip(p, 'nope', 'sticker', 6)).toThrow(TimelineError);
    let full = p;
    for (let i = 1; i < MAX_TRACKS_PER_KIND; i++) full = { ...full, tracks: [{ ...newTrack('video'), clips: [video(`x${i}`)] }, ...full.tracks] };
    expect(() => addOverlayClip(full, 'v', 'sticker', 1)).toThrow(new TimelineError(`At most ${MAX_TRACKS_PER_KIND} video tracks`));
    expect(() => addOverlayClip(p, 'v', 'sticker', NaN)).toThrow(TimelineError);
    expect(() => addOverlayClip(p, 'v', 'sticker', 6, 0)).toThrow(TimelineError);
    expect(() => addOverlayClip(p, 'v', 'sticker', 6, Infinity)).toThrow(TimelineError);
    expect(() => addOverlayClip(p, 'v', 'nope' as never, 6)).toThrow(new TimelineError('Unknown overlay: nope'));
  });
});

describe('updateOverlay', () => {
  const withOverlay = () => addOverlayClip(base(), 'v', 'sticker', 6);
  const oid = (p: Project) => overlays(p)[0].id;
  it('changes text and colours; same project when nothing changes', () => {
    const p = withOverlay();
    const q = updateOverlay(p, oid(p), { text: 'Hi', colour: '#AABBCC', sticker: 'star' });
    expect(overlays(q)[0].overlay).toMatchObject({ text: 'Hi', colour: '#aabbcc', sticker: 'star' });
    expect(updateOverlay(q, oid(q), { text: 'Hi' })).toBe(q);
    expect(updateOverlay(q, oid(q), {})).toBe(q);
  });
  it('cuts long text to 80 code points', () => {
    const p = withOverlay();
    const q = updateOverlay(p, oid(p), { subtext: '😀'.repeat(100) });
    expect(Array.from(overlays(q)[0].overlay!.subtext)).toHaveLength(80);
  });
  it('refuses bad colours, unknown stickers, stickers on other types, locked tracks and non-overlay clips', () => {
    const p = withOverlay();
    expect(() => updateOverlay(p, oid(p), { accent: 'red' })).toThrow(new TimelineError('Invalid colour: red'));
    expect(() => updateOverlay(p, oid(p), { sticker: 'cat' as never })).toThrow(new TimelineError('Unknown sticker: cat'));
    const lt = addOverlayClip(base(), 'v', 'lowerThird', 6);
    expect(() => updateOverlay(lt, oid(lt), { sticker: 'star' })).toThrow(new TimelineError('Only stickers have a sticker'));
    expect(() => updateOverlay(setTrackFlags(p, 'v', { locked: true }), oid(p), { text: 'x' })).toThrow(new TimelineError('Track is locked'));
    expect(() => updateOverlay(p, 'c1', { text: 'x' })).toThrow(new TimelineError('Not an overlay'));
  });
});
