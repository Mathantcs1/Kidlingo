import { describe, expect, it } from 'vitest';
import { newTrack } from '../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../src/core/model';
import { cssPerFormat, cssToFormat, formatToCss, overlayTarget, sourceSizeFor, toleranceInFormatPx } from '../src/ui/overlayMath';

const FHD = { width: 1920, height: 1080 };

describe('css <-> format conversion', () => {
  const cases: [string, { left: number; top: number; width: number; height: number }, { width: number; height: number }][] = [
    ['16:9 at half size', { left: 0, top: 0, width: 960, height: 540 }, FHD],
    ['letterboxed in a stage (offsets)', { left: 312.5, top: 48, width: 640, height: 360 }, FHD],
    ['vertical 9:16', { left: 100, top: 20, width: 270, height: 480 }, { width: 1080, height: 1920 }],
    ['square, enlarged', { left: -10, top: 7, width: 2160, height: 2160 }, { width: 1080, height: 1080 }],
    ['portrait 4:5', { left: 33.3, top: 0, width: 400, height: 500 }, { width: 1080, height: 1350 }],
  ];
  for (const [name, box, format] of cases) {
    it(`round trips: ${name}`, () => {
      for (const pt of [{ x: 0, y: 0 }, { x: 123.4, y: -56.7 }, { x: box.left + box.width, y: box.top + box.height }]) {
        const f = cssToFormat(pt, box, format);
        const back = formatToCss(f, box, format);
        expect(back.x).toBeCloseTo(pt.x, 9);
        expect(back.y).toBeCloseTo(pt.y, 9);
      }
    });
  }

  it('maps the box corners to the format corners and its centre to the canvas centre', () => {
    const box = { left: 312.5, top: 48, width: 640, height: 360 };
    expect(cssToFormat({ x: 312.5, y: 48 }, box, FHD)).toEqual({ x: 0, y: 0 });
    expect(cssToFormat({ x: 952.5, y: 408 }, box, FHD)).toEqual({ x: 1920, y: 1080 });
    expect(cssToFormat({ x: 632.5, y: 228 }, box, FHD)).toEqual({ x: 960, y: 540 });
    // Outside the box works too (the rotate handle of a full-frame clip lies above the canvas).
    expect(cssToFormat({ x: 312.5, y: 38 }, box, FHD)).toEqual({ x: 0, y: -30 });
  });

  it('cssPerFormat is the uniform display scale', () => {
    expect(cssPerFormat({ left: 0, top: 0, width: 960, height: 540 }, FHD)).toBe(0.5);
    expect(cssPerFormat({ left: 5, top: 9, width: 270, height: 480 }, { width: 1080, height: 1920 })).toBe(0.25);
    // A box a pixel off the exact aspect (rounding) uses the mean of both axes.
    expect(cssPerFormat({ left: 0, top: 0, width: 961, height: 540 }, FHD)).toBeCloseTo((961 / 1920 + 0.5) / 2, 12);
  });

  it('converts a CSS tolerance to format pixels', () => {
    expect(toleranceInFormatPx(10, { left: 0, top: 0, width: 960, height: 540 }, FHD)).toBe(20);
    expect(toleranceInFormatPx(8, { left: 0, top: 0, width: 3840, height: 2160 }, FHD)).toBe(4);
  });

  it('degenerate boxes or formats give finite results (no NaN)', () => {
    const zero = { left: 0, top: 0, width: 0, height: 0 };
    expect(Number.isFinite(cssToFormat({ x: 1, y: 1 }, zero, FHD).x)).toBe(true);
    expect(Number.isFinite(toleranceInFormatPx(10, zero, FHD))).toBe(true);
    expect(Number.isFinite(formatToCss({ x: 1, y: 1 }, zero, { width: 0, height: 0 }).y)).toBe(true);
  });
});

const media = (over: Partial<MediaRef>): MediaRef => ({ id: 'm', name: 'm', kind: 'video', duration: 5, hasAudio: false, ...over });
const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c',
  mediaId: 'm',
  kind: 'video',
  start: 0,
  in: 0,
  out: 5,
  volume: 1,
  fit: 'fit',
  transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  ...over,
});

describe('sourceSizeFor', () => {
  it('uses the media display size for video (already rotated) and images', () => {
    expect(sourceSizeFor(clip(), media({ width: 72, height: 128 }))).toEqual({ width: 72, height: 128 });
    expect(sourceSizeFor(clip({ kind: 'image' }), media({ kind: 'image', width: 200, height: 100 }))).toEqual({ width: 200, height: 100 });
  });
  it('falls back to a decoded frame size only when the media has none', () => {
    expect(sourceSizeFor(clip(), media({}), { width: 64, height: 32 })).toEqual({ width: 64, height: 32 });
    expect(sourceSizeFor(clip(), media({ width: 10, height: 20 }), { width: 64, height: 32 })).toEqual({ width: 10, height: 20 });
  });
  it('is null without dimensions, for audio and for unknown media', () => {
    expect(sourceSizeFor(clip(), media({}))).toBeNull();
    expect(sourceSizeFor(clip(), media({ width: 0, height: 10 }))).toBeNull();
    expect(sourceSizeFor(clip({ kind: 'audio' }), media({ kind: 'audio', width: 10, height: 10 }))).toBeNull();
    expect(sourceSizeFor(clip(), undefined)).toBeNull();
    expect(sourceSizeFor(clip(), media({ width: Number.NaN, height: 10 }))).toBeNull();
  });
});

describe('overlayTarget', () => {
  const v = (id: string, clips: Clip[], over: Partial<Track> = {}): Track => ({ ...newTrack('video'), id, clips, ...over });
  const build = (over: Partial<Track> = {}, extraMedia: Partial<MediaRef> = {}): Project => ({
    version: 2,
    format: { ...FHD, fps: 30 },
    tracks: [
      v('bottom', [clip({ id: 'bg', kind: 'image', mediaId: 'img', out: 5 })]),
      v('top', [clip({ id: 'pip', kind: 'image', mediaId: 'img', start: 1, out: 1 })], over),
      { ...newTrack('audio'), id: 'a', clips: [clip({ id: 'tone', kind: 'audio', mediaId: 'snd', out: 5 })] },
    ],
    media: {
      img: media({ id: 'img', kind: 'image', width: 200, height: 200, ...extraMedia }),
      snd: media({ id: 'snd', kind: 'audio' }),
    },
  });

  it('is the one selected visual clip under the playhead, with its source size', () => {
    const t = overlayTarget(build(), ['pip'], 1.5);
    expect(t?.clip.id).toBe('pip');
    expect(t?.size).toEqual({ width: 200, height: 200 });
  });
  it('is null for no selection, two clips, an audio clip or a stale id', () => {
    expect(overlayTarget(build(), [], 1.5)).toBeNull();
    expect(overlayTarget(build(), ['pip', 'bg'], 1.5)).toBeNull();
    expect(overlayTarget(build(), ['tone'], 1.5)).toBeNull();
    expect(overlayTarget(build(), ['gone'], 1.5)).toBeNull();
  });
  it('a stale id next to a live one still counts as one live clip', () => {
    expect(overlayTarget(build(), ['gone', 'pip'], 1.5)?.clip.id).toBe('pip');
  });
  it('is null when the clip is not under the playhead, its track is hidden or locked, or the size is unknown', () => {
    expect(overlayTarget(build(), ['pip'], 0.5)).toBeNull();
    expect(overlayTarget(build(), ['pip'], 2)).toBeNull();
    expect(overlayTarget(build({ hidden: true }), ['pip'], 1.5)).toBeNull();
    expect(overlayTarget(build({ locked: true }), ['pip'], 1.5)).toBeNull();
    expect(overlayTarget(build({}, { width: undefined }), ['pip'], 1.5)).toBeNull();
  });
});
