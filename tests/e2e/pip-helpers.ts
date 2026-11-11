// Helpers for the on-canvas transform overlay specs (pip*.spec.ts): a layered project built in the app, the
// displayed canvas box, format <-> page coordinates and preview pixels.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { importFiles, open, tone } from './helpers';
import type { Transform } from '../../src/core/model';

export type Pt = { x: number; y: number };
export interface CanvasBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** CSS px per format px. */
  s: number;
}

function png(name: string, filter: string[]): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, name);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...filter, '-frames:v', '1', out], { stdio: 'pipe' });
  return out;
}

/** Blue 192×108 background (full frame at scale 10), a lime 200×200 square, and a 300×100 red|yellow split. */
export function images(): string[] {
  return [
    png('bg.png', ['-f', 'lavfi', '-i', 'color=c=blue:s=192x108']),
    png('green.png', ['-f', 'lavfi', '-i', 'color=c=lime:s=200x200']),
    png('split.png', ['-f', 'lavfi', '-i', 'color=c=red:s=150x100', '-f', 'lavfi', '-i', 'color=c=yellow:s=150x100', '-filter_complex', 'hstack']),
  ];
}

/**
 * Opens the editor with, in the 1920×1080 project: layer 1 ('v1') the blue background 'bg' (0..5 s), layer 2
 * ('v2') the 'pip' clip (green square, or the red|yellow split) at scale 1 from 0 to 2 s, and a tone on the audio
 * track ('tone'); `pip` is selected and the playhead is at 1 s.
 */
export async function setupPip(page: Page, which: 'green' | 'split' = 'green'): Promise<void> {
  await open(page);
  await importFiles(page, [...images(), tone], 4);
  await page.evaluate((which) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => {
      const byName = (n: string) => Object.values(p.media).find((m) => m.name === n)!;
      const t = (scale: number) => ({ x: 0, y: 0, scale, rotation: 0, opacity: 1 });
      const clip = (id: string, n: string, out: number, scale: number) => {
        const m = byName(n);
        return { id, mediaId: m.id, kind: m.kind, start: 0, in: 0, out, volume: 1, audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] }, fit: 'fit' as const, transform: t(scale) };
      };
      const flags = { hidden: false, muted: false, solo: false, locked: false, name: '', volume: 1, duck: null };
      return {
        ...p,
        tracks: [
          { ...flags, id: 'v1', kind: 'video' as const, clips: [clip('bg', 'bg.png', 5, 10)] },
          { ...flags, id: 'v2', kind: 'video' as const, clips: [clip('pip', `${which}.png`, 2, 1)] },
          { ...flags, id: 'a1', kind: 'audio' as const, clips: [clip('tone', 'tone.wav', 2, 1)] },
        ],
      };
    });
    s.select(['pip']);
    s.setPlayhead(1);
  }, which);
  await expect(page.getByTestId('transform-overlay')).toBeVisible();
}

/** The preview canvas's content box in page CSS px. */
export async function canvasBox(page: Page): Promise<CanvasBox> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const r = c.getBoundingClientRect();
    const f = window.__clipforge!.getState().history.present.format;
    return { left: r.left + c.clientLeft, top: r.top + c.clientTop, width: c.clientWidth, height: c.clientHeight, s: c.clientWidth / f.width };
  });
}

export const toPage = (b: CanvasBox, f: Pt): Pt => ({ x: b.left + f.x * b.s, y: b.top + f.y * b.s });

export function transformOf(page: Page, id: string): Promise<Transform> {
  return page.evaluate(
    (id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.transform,
    id,
  );
}

export const undoDepth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);

/** Presses at `from`, moves to `to` in steps (optionally Escape before releasing), releases. */
export async function dragTo(page: Page, from: Pt, to: Pt, opts: { escape?: boolean; steps?: number } = {}): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? 8 });
  if (opts.escape) await page.keyboard.press('Escape');
  await page.mouse.up();
}

/** Holds `key` (Alt/Shift) for the duration of `fn`. */
export async function holding(page: Page, key: string, fn: () => Promise<void>): Promise<void> {
  await page.keyboard.down(key);
  try {
    await fn();
  } finally {
    await page.keyboard.up(key);
  }
}

/** RGB of the preview at format pixel (fx, fy), through the letterbox the compositor draws into. */
export function pixelAt(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.evaluate(
    ({ fx, fy }) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const f = window.__clipforge!.getState().history.present.format;
      const s = Math.min(c.width / f.width, c.height / f.height);
      const x0 = Math.floor((c.width - Math.round(f.width * s)) / 2);
      const y0 = Math.floor((c.height - Math.round(f.height * s)) / 2);
      const o = document.createElement('canvas');
      o.width = c.width;
      o.height = c.height;
      const ctx = o.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      return [...ctx.getImageData(Math.floor(x0 + fx * s), Math.floor(y0 + fy * s), 1, 1).data.slice(0, 3)];
    },
    { fx, fy },
  );
}

export const isGreen = (p: number[]): boolean => p[1] > 180 && p[0] < 80 && p[2] < 80;
export const isBlue = (p: number[]): boolean => p[2] > 180 && p[0] < 80 && p[1] < 80;
export const isRed = (p: number[]): boolean => p[0] > 180 && p[1] < 80 && p[2] < 80;
export const isYellow = (p: number[]): boolean => p[0] > 180 && p[1] > 180 && p[2] < 80;

/** Waits until the preview pixel at (fx, fy) satisfies `ok`. */
export async function expectPixel(page: Page, fx: number, fy: number, ok: (p: number[]) => boolean, what: string): Promise<void> {
  await expect.poll(async () => ok(await pixelAt(page, fx, fy)), { message: `${what} at (${fx}, ${fy})` }).toBe(true);
}

/** Geometric bounding box of the overlay quad outline in page px (without the stroke, unlike `boundingBox()`). */
export function overlayBounds(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.getByTestId('overlay-body').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
}

/**
 * The page-px bounding box the overlay must have for clip `id` (from the store's transform and media size, and the
 * displayed canvas box).
 */
export async function expectedBounds(page: Page, id: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await canvasBox(page);
  const { t, w, h, fw, fh } = await page.evaluate((id) => {
    const p = window.__clipforge!.getState().history.present;
    const c = p.tracks.flatMap((tr) => tr.clips).find((x) => x.id === id)!;
    const m = p.media[c.mediaId];
    return { t: c.transform, w: m.width!, h: m.height!, fw: p.format.width, fh: p.format.height };
  }, id);
  const rad = (t.rotation * Math.PI) / 180;
  const hw = ((w * t.scale) / 2) * Math.abs(Math.cos(rad)) + ((h * t.scale) / 2) * Math.abs(Math.sin(rad));
  const hh = ((w * t.scale) / 2) * Math.abs(Math.sin(rad)) + ((h * t.scale) / 2) * Math.abs(Math.cos(rad));
  const c = toPage(b, { x: fw / 2 + t.x, y: fh / 2 + t.y });
  return { x: c.x - hw * b.s, y: c.y - hh * b.s, width: 2 * hw * b.s, height: 2 * hh * b.s };
}

/** The overlay outline matches the clip's transform within `tol` CSS px. */
export async function expectOverlayFollows(page: Page, id: string, tol = 2): Promise<void> {
  await expect
    .poll(async () => {
      const [a, e] = await Promise.all([overlayBounds(page), expectedBounds(page, id)]);
      return Math.max(Math.abs(a.x - e.x), Math.abs(a.y - e.y), Math.abs(a.width - e.width), Math.abs(a.height - e.height));
    })
    .toBeLessThanOrEqual(tol);
}
