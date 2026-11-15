// Plan 4 Task 10: overlay clips (lower third, subscribe button, progress bar, stickers) rendered through the compositor.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { expectNear, openHarness, render } from './harness-helpers';
import type { Frame } from './harness-helpers';
import { fx, pixelAt } from './fx-helpers';
import { emptyProject } from '../../src/core/model';
import type { Clip, OverlayType, Project, VisualEffect } from '../../src/core/model';
import { addOverlay, updateOverlay } from '../../src/core/overlayEdits';

test.setTimeout(240_000);

const fmt = (width: number, height: number, fps = 10) => ({ width, height, fps });

/** An empty project of the given size holding one overlay clip; `patch` can adjust the clip. */
function overlayProject(type: OverlayType, size: { width: number; height: number; fps?: number }, edit: { text?: string; subtext?: string; params?: Record<string, number> } = {}, patch: Partial<Clip> = {}, hidden = false): Project {
  let p: Project = { ...emptyProject(), format: fmt(size.width, size.height, size.fps ?? 10) };
  p = addOverlay(p, type, { start: 0 });
  const id = p.tracks.flatMap((t) => t.clips)[0].id;
  if (Object.keys(edit).length) p = updateOverlay(p, id, edit);
  return {
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, hidden: t.kind === 'video' ? hidden : t.hidden, clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  };
}

const lit = (f: Frame, x0: number, y0: number, x1: number, y1: number, ok: (c: number[]) => boolean): number => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ok(pixelAt(f, x, y))) n++;
  return n;
};
const white = (c: number[]): boolean => c.every((v) => v >= 200);
const notBlack = (c: number[]): boolean => c.some((v) => v > 8);

test('lower third: accent bar, dark panel and text pixels; empty text draws only the shapes', async ({ page }) => {
  await openHarness(page);
  const size = fmt(480, 270);
  const withText = overlayProject('lowerThird', size, { text: 'Mathan', subtext: 'Creator' });
  const [f] = await render(page, withText, [0.5]);
  // Box: 216 x 40.5 at a 4 % margin from the bottom-left (x 19..235, y 210..251).
  expectNear(pixelAt(f, 20, 230), [255, 59, 48], 10, 'accent bar');
  expectNear(pixelAt(f, 225, 220), [15, 18, 22], 10, 'panel');
  expect(lit(f, 19, 210, 236, 251, white), 'text pixels').toBeGreaterThan(10);
  const [empty] = await render(page, overlayProject('lowerThird', size, { text: '', subtext: '' }), [0.5]);
  expectNear(pixelAt(empty, 20, 230), [255, 59, 48], 10, 'accent bar without text');
  expect(lit(empty, 19, 210, 236, 251, white)).toBe(0);
  expect(f.glError).toBe(0);
});

test('subscribe button: red pill with a white play triangle and label', async ({ page }) => {
  await openHarness(page);
  const [f] = await render(page, overlayProject('subscribe', fmt(480, 270)), [0.5]);
  // 22 % wide at the bottom-right: x 355..461, y 220..251.
  expectNear(pixelAt(f, 450, 246), [255, 0, 0], 12, 'pill');
  expect(lit(f, 356, 221, 460, 250, white), 'triangle and label').toBeGreaterThan(20);
  expectNear(pixelAt(f, 50, 50), [0, 0, 0], 0, 'rest of the canvas');
});

test('progress bar: empty on the first frame, filled to the clip fraction in between, full on the last frame', async ({ page }) => {
  await openHarness(page);
  const p = overlayProject('progress', fmt(480, 270));
  const [first, mid, last] = await render(page, p, [0, 1.5, 2.9]);
  const row = (f: Frame): number[] => Array.from({ length: f.width }, (_, x) => pixelAt(f, x, 268)[0]);
  const edge = Math.round((480 * 15) / 29);
  expect(row(first).filter((v) => v > 200)).toHaveLength(0);
  expect(Math.abs(row(mid).filter((v) => v > 200).length - edge)).toBeLessThanOrEqual(2);
  expect(row(mid)[edge - 8]).toBeGreaterThan(200);
  expect(row(mid)[edge + 8]).toBeLessThan(60);
  expect(row(last).filter((v) => v > 200)).toHaveLength(480);
});

test('every sticker shape draws inside its box and nowhere else', async ({ page }) => {
  await openHarness(page);
  for (let shape = 0; shape < 12; shape++) {
    const [f] = await render(page, overlayProject('sticker', fmt(320, 320), { params: { shape } }), [0.5]);
    // 20 % of 320 = a 64 px box centred at 128..192.
    const inside = lit(f, 128, 128, 192, 192, notBlack);
    const total = lit(f, 0, 0, 320, 320, notBlack);
    expect(inside, `shape ${shape} inside`).toBeGreaterThan(0.03 * 64 * 64);
    expect(total - inside, `shape ${shape} outside`).toBe(0);
  }
});

test('an overlay takes effects; a tiny one renders; a hidden layer is not drawn; a frame renders identically twice', async ({ page }) => {
  await openHarness(page);
  const size = fmt(480, 270);
  const inverted: VisualEffect[] = [fx('invert')];
  const [f] = await render(page, overlayProject('progress', size, {}, { fx: inverted }), [2.9]);
  const px = pixelAt(f, 150, 268);
  expect(px[0]).toBeLessThan(40);
  expect(px[1]).toBeGreaterThan(150);

  const tiny = overlayProject('lowerThird', size, { text: 'x' }, { transform: { x: 0, y: 0, scale: 0.02, rotation: 0, opacity: 1 } });
  const [t] = await render(page, tiny, [0.5]);
  expect(t.glError).toBe(0);

  const [hidden] = await render(page, overlayProject('lowerThird', size, {}, {}, true), [0.5]);
  expectNear(pixelAt(hidden, 20, 230), [0, 0, 0], 0, 'hidden overlay');

  const [a, b] = await render(page, overlayProject('lowerThird', size, { text: 'Same' }), [0.5, 0.5]);
  expect(a.data).toEqual(b.data);
});

test('the overlay texture cache stays bounded while scrubbing a long progress bar', async ({ page }) => {
  await openHarness(page);
  const p = overlayProject('progress', fmt(640, 360, 30), {}, { out: 10 });
  const times = Array.from({ length: 200 }, (_, i) => i / 30);
  const s = await page.evaluate(({ p, times }) => window.cf.renderStats(p, times), { p, times });
  expect(s.after.overlayTextures).toBeLessThanOrEqual(32);
  expect(s.after.overlayTextures).toBeGreaterThan(0);
  expect(s.glError).toBe(0);
});

test('an exported overlay frame matches the preview frame', async ({ page }) => {
  await openHarness(page);
  const p = overlayProject('lowerThird', fmt(320, 180), { text: 'Mathan', subtext: 'Creator' });
  const b64 = await page.evaluate((p) => window.cf.exportBase64(p, 320), p);
  const dir = join(process.cwd(), 'test-results', 'fx-overlay-parity');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'lower-third.mp4');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  const [preview] = await render(page, p, [0.5]);
  const exp = ffmpegFrame(file, 5);
  expect([exp.width, exp.height]).toEqual([320, 180]);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) for (let k = 0; k < 3; k++, n++) sum += Math.abs(exp.rgb[(y * 320 + x) * 3 + k] - preview.data[(y * 320 + x) * 4 + k]);
  expect(sum / n).toBeLessThanOrEqual(4);
});
