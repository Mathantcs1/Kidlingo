// Shared helpers for the overlay clip specs (Plan 4 Task 12).
import type { Page } from '@playwright/test';
import { newTrack } from '../../src/core/model';
import type { Clip, MediaRef, OverlaySpec, OverlayType, Project, Track } from '../../src/core/model';
import { newOverlayClip, overlayBaseSize } from '../../src/core/overlays';

export type Rgb = [number, number, number];
export const FMT = { width: 320, height: 180, fps: 30 };

let n = 0;
/** An overlay clip of `type` from `start` lasting `duration` s at its default place; `over` replaces fields. */
export function overlayClip(type: OverlayType, start = 0, duration = 5, over: Partial<Clip> & { spec?: Partial<OverlaySpec> } = {}): Clip {
  const { spec, ...rest } = over;
  const c = newOverlayClip(type, start, duration, FMT);
  return { ...c, id: `ov-${++n}`, ...rest, overlay: { ...c.overlay!, ...spec } };
}

/** One video track per entry of `layers` (bottom first) plus an audio track. */
export function layered(layers: Clip[][], media: MediaRef[] = [], hidden: number[] = []): Project {
  const tracks: Track[] = layers.map((clips, i) => ({ ...newTrack('video'), id: `v${i}`, hidden: hidden.includes(i), clips }));
  return { version: 5, format: FMT, tracks: [...tracks, { ...newTrack('audio'), id: 'audio' }], media: Object.fromEntries(media.map((m) => [m.id, m])) };
}

/** The overlay's box on a FMT-sized canvas, in canvas pixels (from its transform at scale 1, no rotation). */
export function boxOf(c: Clip): { l: number; r: number; t: number; b: number } {
  const s = overlayBaseSize(c.overlay!.type, FMT);
  const cx = FMT.width / 2 + c.transform.x;
  const cy = FMT.height / 2 + c.transform.y;
  return { l: cx - s.width / 2, r: cx + s.width / 2, t: cy - s.height / 2, b: cy + s.height / 2 };
}

export interface Frame {
  width: number; height: number; data: number[]; glError: number;
  blendPasses: number; effectPasses: number; overlayTextures: { count: number; bytes: number };
}

export async function renderFrames(page: Page, ps: Project[], times: number[], canvas?: { width: number; height: number }): Promise<Frame[]> {
  const r = await page.evaluate(({ ps, times, canvas }) => window.cf.renderBlend(ps, times, { canvas }), { ps, times, canvas });
  if (r.error) throw new Error(r.error);
  return r.frames;
}

export function at(f: Frame, x: number, y: number): Rgb {
  const i = (y * f.width + x) * 4;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
}

export const hex = (s: string): Rgb => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as Rgb;
export const near = (a: Rgb, b: Rgb, tol: number): boolean => a.every((v, k) => Math.abs(v - b[k]) <= tol);
const lit = (p: Rgb): boolean => p[0] + p[1] + p[2] > 0;

/** Lit pixels inside `box` (as a fraction of its area) and lit pixels outside it grown by `margin` px. */
export function coverage(f: Frame, box: { l: number; r: number; t: number; b: number }, margin = 2): { inside: number; outside: number } {
  let inside = 0;
  let area = 0;
  let outside = 0;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const inBox = x + 0.5 > box.l && x + 0.5 < box.r && y + 0.5 > box.t && y + 0.5 < box.b;
      const nearBox = x + 0.5 > box.l - margin && x + 0.5 < box.r + margin && y + 0.5 > box.t - margin && y + 0.5 < box.b + margin;
      if (inBox) {
        area++;
        if (lit(at(f, x, y))) inside++;
      } else if (!nearBox && lit(at(f, x, y))) outside++;
    }
  }
  return { inside: inside / Math.max(1, area), outside };
}

/** Columns of row `y` whose pixel is within `tol` of `rgb`, as a fraction of the row. */
export function rowFraction(f: Frame, y: number, rgb: Rgb, tol: number): number {
  let k = 0;
  for (let x = 0; x < f.width; x++) if (near(at(f, x, y), rgb, tol)) k++;
  return k / f.width;
}

/** Byte-exact equality of two frames' pixels (fast; a deep toEqual on ~10^5 numbers is slow). */
export const samePixels = (a: Frame, b: Frame): boolean => Buffer.from(Uint8Array.from(a.data)).equals(Buffer.from(Uint8Array.from(b.data)));

/** The raw saved project (idb-keyval's store), or undefined. */
export function savedProject(page: Page): Promise<Project | undefined> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onsuccess = () => {
      const get = req.result.transaction('keyval').objectStore('keyval').get('clipforge:current');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    };
    req.onerror = () => reject(req.error);
  }));
}

/** Overwrites the saved project in idb-keyval's store. */
export function writeSaved(page: Page, value: unknown): Promise<void> {
  return page.evaluate((v) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onsuccess = () => {
      const tx = req.result.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put(v, 'clipforge:current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), value);
}

/** The preview canvas pixel at (fx, fy) fractions of its size. */
export function previewPixel(page: Page, fx: number, fy: number): Promise<Rgb> {
  return page.evaluate(({ fx, fy }) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = c.width;
    o.height = c.height;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
    return [d[0], d[1], d[2]] as Rgb;
  }, { fx, fy });
}
