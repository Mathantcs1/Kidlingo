// Shared helpers for the keyframe render/parity specs (Plan 5 Task 5): keyed clips on solid-colour fixtures, rendered
// through the real compositor (window.cf.renderBlend: one compositor, one project per frame), and frame measurements.
import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { newTrack } from '../../src/core/model';
import type { Clip, Keyframe, MediaRef, PositionKeyframe, Project, Track } from '../../src/core/model';
import type { Ease, EaseKind } from '../../src/core/easing';
import { CURRENT_VERSION } from '../helpers/project';

export type Rgb = [number, number, number];

export interface Frame {
  width: number; height: number; data: number[]; glError: number;
  blendPasses: number; effectPasses: number; overlayTextures: { count: number; bytes: number }; overlayUploads: number;
}

export const ease = (kind: EaseKind): Ease => ({ kind });
export const key = (t: number, v: number, kind: EaseKind = 'linear'): Keyframe => ({ t, v, ease: ease(kind) });
export const pos = (t: number, x: number, y: number, kind: EaseKind = 'linear'): PositionKeyframe => ({ t, x, y, ease: ease(kind) });

/** Stores a solid (or two-tone, see cf.makePng) PNG as image media. */
export function solid(page: Page, width: number, height: number, rgb: Rgb, opts: { right?: Rgb; bottom?: Rgb } = {}): Promise<MediaRef> {
  return page.evaluate(({ width, height, rgb, opts }) => window.cf.putImageMedia(width, height, rgb, opts), { width, height, rgb, opts });
}

let n = 0;
/** An image clip of `m` at scale 1, centred, from `start` for `duration` s; `over` replaces fields. */
export function imageClip(m: MediaRef, over: Partial<Clip> = {}, start = 0, duration = 2): Clip {
  return {
    id: `kc-${++n}`, mediaId: m.id, kind: 'image', start, in: 0, out: duration,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1, fit: 'fit', audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] }, effects: [], blend: 'normal', ...over,
  };
}

/** An adjustment clip from 0 for `duration` s; `over` replaces fields. */
export function adjustmentClip(over: Partial<Clip> = {}, duration = 2): Clip {
  return { ...imageClip({ id: '' } as MediaRef, {}, 0, duration), kind: 'adjustment', mediaId: '', ...over };
}

/** One video track per entry of `layers` (bottom first) plus an audio track. */
export function stack(format: Project['format'], layers: Clip[][], media: MediaRef[], hidden: number[] = []): Project {
  const tracks: Track[] = layers.map((clips, i) => ({ ...newTrack('video'), id: `v${i}`, hidden: hidden.includes(i), clips }));
  return { version: CURRENT_VERSION, format, tracks: [...tracks, { ...newTrack('audio'), id: 'audio' }], media: Object.fromEntries(media.map((m) => [m.id, m])) };
}

/** Renders frame i of `projects[min(i, last)]` at `times[i]` through ONE compositor (canvas = format size by default). */
export async function frames(page: Page, projects: Project[], times: number[], canvas?: { width: number; height: number }): Promise<Frame[]> {
  const r = await page.evaluate(({ projects, times, canvas }) => window.cf.renderBlend(projects, times, { canvas }), { projects, times, canvas });
  if (r.error) throw new Error(r.error);
  return r.frames;
}

export function at(f: Frame, x: number, y: number): Rgb {
  const i = (y * f.width + x) * 4;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
}

/** Mean of the RGB channels over the whole frame (0..255). */
export function mean(f: Frame): number {
  let s = 0;
  for (let i = 0; i < f.data.length; i += 4) s += f.data[i] + f.data[i + 1] + f.data[i + 2];
  return s / (f.data.length / 4) / 3;
}

const lit = (f: Frame, x: number, y: number, threshold: number): boolean => {
  const [r, g, b] = at(f, x, y);
  return r + g + b > threshold;
};

/** Centroid and bounding box (inclusive pixel ranges) of pixels brighter than `threshold` (sum of RGB). */
export function shape(f: Frame, threshold = 127): { cx: number; cy: number; l: number; r: number; t: number; b: number; count: number } {
  let sx = 0, sy = 0, count = 0, l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (!lit(f, x, y, threshold)) continue;
      sx += x + 0.5; sy += y + 0.5; count++;
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
  }
  return { cx: sx / count, cy: sy / count, l, r, t, b, count };
}

/** Largest per-channel difference between two frames' RGB. */
export function maxDiff(a: Frame, b: Frame): number {
  let m = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) m = Math.max(m, Math.abs(a.data[i] - b.data[i]));
  return m;
}

export const hash = (f: Frame): string => createHash('sha256').update(Uint8Array.from(f.data)).digest('hex').slice(0, 16);
export const samePixels = (a: Frame, b: Frame): boolean => Buffer.from(Uint8Array.from(a.data)).equals(Buffer.from(Uint8Array.from(b.data)));
