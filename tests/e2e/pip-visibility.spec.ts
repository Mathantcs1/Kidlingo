// When the on-canvas transform overlay shows, how a drag ends when the clip changes under it, handles outside the
// canvas, rotated video, format switches, and export parity of a placement made on the overlay.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures, ffmpegFrame } from './fixtures';
import { addToTimeline, importFiles, open, toast, trackErrors } from './helpers';
import { px } from './harness-helpers';
import { canvasBox, dragTo, expectOverlayFollows, holding, overlayBounds, setupPip, toPage, transformOf, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const C = { x: 960, y: 540 };
const overlay = (page: Page) => page.getByTestId('transform-overlay');
type Act =
  | { select: string[] }
  | { playhead: number }
  | { flag: 'hidden' | 'locked'; on: boolean }
  | { opacity: number };

/** Changes the store as the UI would (selection, playhead, a layer flag on 'v2', the pip clip's opacity). */
const act = (page: Page, a: Act) =>
  page.evaluate((a) => {
    const s = window.__clipforge!.getState();
    if ('select' in a) s.select(a.select);
    else if ('playhead' in a) s.setPlayhead(a.playhead);
    else if ('flag' in a) s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, [a.flag]: a.on } : t)) }));
    else {
      s.apply((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, transform: { ...c.transform, opacity: a.opacity } } : c)),
        })),
      }));
    }
  }, a);

test('the overlay shows only for one selected visual clip under the playhead on a visible, unlocked layer', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const cases: [string, Act, Act][] = [
    ['nothing selected', { select: [] }, { select: ['pip'] }],
    ['two clips selected', { select: ['pip', 'bg'] }, { select: ['pip'] }],
    ['an audio clip selected', { select: ['tone'] }, { select: ['pip'] }],
    ['the clip is not under the playhead', { playhead: 3 }, { playhead: 1 }],
    ['its layer is hidden', { flag: 'hidden', on: true }, { flag: 'hidden', on: false }],
    ['its layer is locked', { flag: 'locked', on: true }, { flag: 'locked', on: false }],
  ];
  for (const [name, hide, restore] of cases) {
    await expect(overlay(page), `shown before: ${name}`).toBeVisible();
    await act(page, hide);
    await expect(overlay(page), name).toHaveCount(0);
    await act(page, restore);
  }
  await expect(overlay(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('a drag ends quietly, committing nothing, when the layer is locked or hidden, or undo runs mid-drag', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  for (const name of ['locked', 'hidden'] as const) {
    const before = await transformOf(page, 'pip');
    const depth = await undoDepth(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 30, { steps: 4 });
    await act(page, { flag: name, on: true });
    await expect(overlay(page), name).toHaveCount(0);
    await page.mouse.move(from.x + 120, from.y + 30, { steps: 2 });
    await page.mouse.up();
    expect(await transformOf(page, 'pip'), name).toEqual(before);
    expect(await undoDepth(page), name).toBe(depth + 1);
    await page.getByTestId('btn-undo').click();
    await expect(overlay(page)).toBeVisible();
  }
  // Undo (Ctrl+Z) mid-drag: the previous edit is undone and the drag commits nothing.
  await act(page, { opacity: 0.5 });
  const depth = await undoDepth(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 30, { steps: 4 });
  await page.keyboard.press('Control+z');
  await page.mouse.move(from.x + 100, from.y + 30, { steps: 2 });
  await page.mouse.up();
  expect(await undoDepth(page)).toBe(depth - 1);
  expect(await transformOf(page, 'pip')).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  await expect(toast(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a full-frame clip's rotate handle sits above the canvas and still turns it", async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await act(page, { select: ['bg'] });
  await expectOverlayFollows(page, 'bg');
  const b = await canvasBox(page);
  const hb = (await page.getByTestId('overlay-handle-rotate').boundingBox())!;
  const h = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
  expect(h.y).toBeLessThan(b.top - 20);
  // The handle is really on screen (not clipped away by the panel): it is the top-most element there.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="transform-overlay"]') !== null, h);
  expect(hit).toBe(true);
  const centre = toPage(b, C);
  await dragTo(page, h, { x: centre.x + (centre.y - h.y), y: centre.y });
  const t = await transformOf(page, 'bg');
  expect(Math.abs(t.rotation - 90)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('a rotated (90°) video shows an outline matching its displayed, upright picture', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [join(ensureFixtures(), 'quad-cw90.mp4')], 1);
  await addToTimeline(page, 'quad-cw90.mp4', 1);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.select([s.history.present.tracks[0].clips[0].id]);
    s.setPlayhead(0.5);
  });
  await expect(overlay(page)).toBeVisible();
  const b = await canvasBox(page);
  const body = await overlayBounds(page);
  // 72×128 displayed, fitted into 1920×1080 at 1080/128: 607.5 × 1080 format px, centred.
  expect(Math.abs(body.height - 1080 * b.s)).toBeLessThanOrEqual(2);
  expect(Math.abs(body.width - 607.5 * b.s)).toBeLessThanOrEqual(2);
  expect(Math.abs(body.x + body.width / 2 - (b.left + b.width / 2))).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('switching the format while a clip is selected re-fits the overlay', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await expectOverlayFollows(page, 'pip');
  for (const key of ['vertical', 'square', 'youtube']) {
    await page.getByTestId('format-select').selectOption(key);
    await expect(overlay(page)).toBeVisible();
    await expectOverlayFollows(page, 'pip');
  }
  expect(errors).toEqual([]);
});

test('an export of a placement made on the overlay matches its geometry', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  // Shrink to about half with the bottom-right corner, then move it up and left.
  const corner = toPage(b, { x: C.x + 100, y: C.y + 100 });
  const centre = toPage(b, C);
  await dragTo(page, corner, { x: (corner.x + centre.x) / 2, y: (corner.y + centre.y) / 2 });
  await holding(page, 'Alt', () => dragTo(page, centre, { x: centre.x - 150, y: centre.y - 90 }));
  const t = await transformOf(page, 'pip');
  expect(t.scale).toBeGreaterThan(0.4);
  expect(t.scale).toBeLessThan(0.6);
  const project = await page.evaluate(() => window.__clipforge!.getState().history.present);
  await page.evaluate(() => window.__clipforge!.flushAutosave());

  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
  const b64 = await page.evaluate((p) => window.cf.exportBase64(p, 320), project);
  mkdirSync(test.info().outputDir, { recursive: true });
  const out = join(test.info().outputDir, 'pip.mp4');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  const frame = ffmpegFrame(out, 5);
  expect([frame.width, frame.height]).toEqual([320, 180]);
  const k = 320 / 1920;
  const img = { width: frame.width, data: frame.rgb };
  const at = (fx: number, fy: number) => px(img, Math.round(fx * k), Math.round(fy * k), 3);
  const cx = C.x + t.x;
  const cy = C.y + t.y;
  const half = 100 * t.scale;
  const green = (p: number[]) => p[1] > 150 && p[0] < 100 && p[2] < 100;
  const blue = (p: number[]) => p[2] > 150 && p[0] < 100 && p[1] < 100;
  expect(green(at(cx, cy)), `centre ${at(cx, cy)}`).toBe(true);
  expect(green(at(cx - half + 12, cy - half + 12)), 'inside the top-left corner').toBe(true);
  expect(green(at(cx + half - 12, cy + half - 12)), 'inside the bottom-right corner').toBe(true);
  expect(blue(at(cx - half - 14, cy)), 'left of it').toBe(true);
  expect(blue(at(cx + half + 14, cy)), 'right of it').toBe(true);
  expect(blue(at(C.x, C.y)), 'old centre').toBe(true);
  expect(errors).toEqual([]);
});
