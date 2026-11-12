// Shared helpers for the keyframe robustness specs (Plan 5 Task 11): an animated project loaded into the REAL app
// (sourced image clips, a sourceless sticker overlay and an adjustment layer, all keyed), whole-canvas preview
// snapshots at exact timeline times, and the stored project.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newOverlayClip } from '../../src/core/overlays';
import { defaultParams } from '../../src/core/videoEffects';
import { newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../../src/core/model';
import { importFiles, open } from './helpers';
import { images } from './pip-helpers';
import { adjustmentClip, imageClip, key, pos } from './keyframe-helpers';
import { CURRENT_VERSION } from '../helpers/project';

export const FPS = 30;
export const FORMAT = { width: 1920, height: 1080, fps: FPS };

export const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
export const presentJson = (page: Page): Promise<string> => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
export const clipById = async (page: Page, id: string): Promise<Clip> => (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;
export const depth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);

/** Opens the app and imports the pip images (bg blue 192×108, lime 200×200, red|yellow 300×100); returns them by name. */
export async function openWithImages(page: Page): Promise<Record<'bg' | 'green' | 'split', MediaRef>> {
  await open(page);
  await importFiles(page, images(), 3);
  const media = (await present(page)).media;
  const by = (n: string) => Object.values(media).find((m) => m.name === n)!;
  return { bg: by('bg.png'), green: by('green.png'), split: by('split.png') };
}

/** Every transform property and two colour params keyed over local [lo, lo + len] (five keys, mixed eases). */
export function animate(c: Clip, lo: number, len: number, fx = true): Clip {
  const at = (f: number) => lo + f * len;
  return {
    ...c,
    keys: {
      position: [pos(at(0), -500, -200, 'easeOut'), pos(at(0.4), 200, 150, 'back'), pos(at(1), 450, -100)],
      scale: [key(at(0), 0.8, 'easeInOut'), key(at(0.5), 1.6, 'elastic'), key(at(1), 1.1)],
      rotation: [key(at(0), -30), key(at(0.7), 250, 'easeIn'), key(at(1), 400)],
      opacity: [key(at(0), 0.4, 'hold'), key(at(0.3), 0.9, 'bounce'), key(at(1), 0.6)],
    },
    effects: fx
      ? [{ id: `${c.id}-colour`, type: 'colour', enabled: true, params: defaultParams('colour'),
        keys: { brightness: [key(at(0), -0.3), key(at(1), 0.3, 'easeInOut')], saturation: [key(at(0), 0.5, 'easeOut'), key(at(1), -0.5)] } }]
      : c.effects,
  };
}

/**
 * The standard animated stack on 1920×1080 at 30 fps, clips from `start` for `len` s (default 0.5..3.5): 'bg' (blue,
 * full frame, 0..`bgLen` s, static), 'img' on v1 (lime square, SOURCED with in = 0.4: keys at local 0.4..0.4 + len),
 * 'ov' on v2 (sticker overlay, sourceless: keys at 0..len) and 'adj' on v3 (adjustment: opacity keys and a keyed
 * invert amount).
 */
export function animatedStack(m: Record<'bg' | 'green' | 'split', MediaRef>, { start = 0.5, len = 3, bgLen = 6 } = {}): Project {
  const bg = imageClip(m.bg, { id: 'bg', transform: { x: 0, y: 0, scale: 10, rotation: 0, opacity: 1 } }, 0, bgLen);
  const img = animate(imageClip(m.green, { id: 'img', in: 0.4, out: 0.4 + len }, start), 0.4, len);
  const ov = animate({ ...newOverlayClip('sticker', start, len, FORMAT), id: 'ov' }, 0, len, false);
  const adj = adjustmentClip({
    id: 'adj', start, in: 0, out: len,
    keys: { opacity: [key(0, 0.2, 'easeIn'), key(len, 0.7)] },
    effects: [{ id: 'adj-invert', type: 'invert', enabled: true, params: defaultParams('invert'), keys: { amount: [key(0, 0.1), key(len / 2, 0.6, 'easeOut'), key(len, 0.3)] } }],
  });
  return layered([[bg], [img], [ov], [adj]], Object.values(m));
}

/** One video track per entry (bottom first, ids v0..) plus an audio track. */
export function layered(layers: Clip[][], media: MediaRef[]): Project {
  const tracks: Track[] = layers.map((clips, i) => ({ ...newTrack('video'), id: `v${i}`, clips }));
  return { version: CURRENT_VERSION, format: { ...FORMAT }, tracks: [...tracks, { ...newTrack('audio'), id: 'audio' }], media: Object.fromEntries(media.map((x) => [x.id, x])) };
}

/** Replaces the project in ONE apply (history kept: the load is one undo step), then clears selection. */
export async function load(page: Page, p: Project): Promise<void> {
  await page.evaluate((p) => {
    const s = window.__clipforge!.getState();
    s.apply(() => p);
    s.select([]);
  }, p);
}

async function renderedAt(page: Page, t: number): Promise<void> {
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  const canvas = page.getByTestId('preview-canvas');
  await expect
    .poll(async () => {
      const [state, renderedT] = await Promise.all([canvas.getAttribute('data-render-state'), canvas.getAttribute('data-rendered-t')]);
      return state === 'idle' && Number(renderedT) === t;
    }, { message: `preview at ${t}`, timeout: 20_000, intervals: [30, 60, 100] })
    .toBe(true);
}

/** The whole preview canvas (RGB) at each timeline time, rendered from the CURRENT project (a sentinel frame first). */
export async function snapshots(page: Page, times: number[]): Promise<Uint8Array[]> {
  await renderedAt(page, 5.9876);
  const out: Uint8Array[] = [];
  for (const t of times) {
    await renderedAt(page, t);
    const b64 = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const o = document.createElement('canvas');
      o.width = c.width;
      o.height = c.height;
      const ctx = o.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const rgb = new Uint8Array((d.length / 4) * 3);
      for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
      let s = '';
      for (let i = 0; i < rgb.length; i += 0x8000) s += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
      return btoa(s);
    });
    out.push(new Uint8Array(Buffer.from(b64, 'base64')));
  }
  return out;
}

export const maxDiff = (a: Uint8Array, b: Uint8Array): number => {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

/** Each pair of frames equal (≤ `tol` per channel), and at least two of the `before` frames differ (animation visible). */
export function expectSameFrames(before: Uint8Array[], after: Uint8Array[], what: string, tol = 0): void {
  for (const [i, a] of before.entries()) expect(maxDiff(a, after[i]), `${what}: frame ${i}`).toBeLessThanOrEqual(tol);
  expect(before.some((f) => maxDiff(f, before[0]) > 20), `${what}: the frames show motion`).toBe(true);
}
