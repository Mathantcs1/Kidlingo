// Overlay menu and inspector (Plan 4 Task 13): Add overlay is one undo step on the active layer, the inspector fields
// each commit once and update the preview, transform fields and on-canvas handles work, trim/move/split work, a
// locked layer refuses, audio controls are absent and a reload restores everything.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, expectOnlyToast, importFiles, open, trackErrors } from './helpers';
import { solidPng } from './lut-helpers';
import { hex, near, previewPixel } from './overlay-helpers';
import { canvasBox, dragTo, toPage, undoDepth } from './pip-helpers';
import type { Clip } from '../../src/core/model';

test.setTimeout(120_000);

const f = (page: Page, id: string) => page.getByTestId(id);
const overlays = (page: Page): Promise<Clip[]> =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'overlay'));
const overlay = async (page: Page): Promise<Clip> => (await overlays(page))[0];

/** A black-ish image clip 0..5 s (selected), playhead at 1 s; the overlay goes on a new layer above it. */
async function setup(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [solidPng('bg.png', '0x202020')], 1);
  await addToTimeline(page, 'bg.png', 1);
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(1));
}

async function addOverlay(page: Page, type: string): Promise<void> {
  const n = (await overlays(page)).length;
  await f(page, 'overlay-add').click();
  await f(page, `overlay-add-${type}`).click();
  await expect.poll(async () => (await overlays(page)).length).toBe(n + 1);
}

test('Add overlay: a menu of four types plus Adjustment layer, one undo step, at the playhead, selected, drawn in the preview', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await f(page, 'overlay-add').click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  const depth = await undoDepth(page);
  await addOverlay(page, 'sticker');
  expect(await undoDepth(page)).toBe(depth + 1);
  const o = await overlay(page);
  expect([o.start, o.out - o.in, o.overlay?.type]).toEqual([1, 5, 'sticker']);
  await expect(f(page, 'overlay-sticker')).toBeVisible();
  await expect(page.locator('.clip-overlay')).toHaveCount(1);
  await expect.poll(async () => near(await previewPixel(page, 0.5, 0.5), hex(o.overlay!.colour), 8), { timeout: 15_000 }).toBe(true);
  await f(page, 'btn-undo').click();
  expect(await overlays(page)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('inspector fields commit once (Enter/blur/change), update the preview and keep Delete/Backspace for the field', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addOverlay(page, 'lowerThird');
  await expect(f(page, 'overlay-sticker')).toHaveCount(0);
  const depth = await undoDepth(page);
  await f(page, 'overlay-text').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Hello', { delay: 20 });
  await page.keyboard.press('Backspace');
  expect(await undoDepth(page)).toBe(depth);
  await expect(f(page, 'timeline-clip')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await overlay(page)).overlay?.text).toBe('Hell');
  expect(await undoDepth(page)).toBe(depth + 1);
  await f(page, 'overlay-subtext').fill('Producer');
  await f(page, 'overlay-subtext').blur();
  await expect.poll(async () => (await overlay(page)).overlay?.subtext).toBe('Producer');
  expect(await undoDepth(page)).toBe(depth + 2);
  // Escape reverts a draft; blur with no change adds no step.
  await f(page, 'overlay-text').fill('Nope');
  await f(page, 'overlay-text').press('Escape');
  await f(page, 'overlay-text').blur();
  expect((await overlay(page)).overlay?.text).toBe('Hell');
  expect(await undoDepth(page)).toBe(depth + 2);
  // Colours: one step each; the picker owns Delete/Backspace.
  await f(page, 'overlay-colour').fill('#00cc44');
  await expect.poll(async () => (await overlay(page)).overlay?.colour).toBe('#00cc44');
  await f(page, 'overlay-accent').fill('#ff00ff');
  await expect.poll(async () => (await overlay(page)).overlay?.accent).toBe('#ff00ff');
  expect(await undoDepth(page)).toBe(depth + 4);
  await f(page, 'overlay-colour').focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expect(f(page, 'timeline-clip')).toHaveCount(2);
  // The lower third box is drawn in the new colour at its default place (it has slid in by 2 s; 1920x1080 format).
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(2));
  await expect.poll(async () => near(await previewPixel(page, 0.45, 0.8), hex('#00cc44'), 8), { timeout: 15_000 }).toBe(true);
  await f(page, 'btn-undo').click();
  await expect.poll(async () => (await overlay(page)).overlay?.accent).not.toBe('#ff00ff');
  expect(errors).toEqual([]);
});

test('sticker select commits once and changes the shape; text fields are absent for stickers', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addOverlay(page, 'sticker');
  await expect(f(page, 'overlay-text')).toHaveCount(0);
  const depth = await undoDepth(page);
  await f(page, 'overlay-sticker').selectOption('star');
  await expect.poll(async () => (await overlay(page)).overlay?.sticker).toBe('star');
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(clipEl(page, (await overlay(page)).id)).toContainText('Sticker: Star');
  expect(errors).toEqual([]);
});

test('transform fields and on-canvas handles move an overlay, one undo step each', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addOverlay(page, 'sticker');
  await expect(f(page, 'transform-overlay')).toBeVisible();
  let depth = await undoDepth(page);
  await f(page, 'inspector-x').fill('200');
  await f(page, 'inspector-x').press('Enter');
  await expect.poll(async () => (await overlay(page)).transform.x).toBe(200);
  expect(await undoDepth(page)).toBe(depth + 1);
  depth = await undoDepth(page);
  const b = await canvasBox(page);
  const size = 0.3 * 1080;
  const from = toPage(b, { x: 960 + 200, y: 540 });
  await dragTo(page, from, { x: from.x + 40, y: from.y + 20 });
  await expect.poll(async () => Math.round((await overlay(page)).transform.x)).toBeCloseTo(200 + 40 / b.s, -1);
  expect(Math.abs((await overlay(page)).transform.y - 20 / b.s)).toBeLessThanOrEqual(3);
  expect(await undoDepth(page)).toBe(depth + 1);
  // A corner handle scales (the sticker is 0.3 * 1080 px wide at scale 1).
  const before = (await overlay(page)).transform;
  const corner = toPage(b, { x: 960 + before.x + size / 2, y: 540 + before.y + size / 2 });
  await dragTo(page, corner, { x: corner.x + 30, y: corner.y + 30 });
  await expect.poll(async () => (await overlay(page)).transform.scale).toBeGreaterThan(1.05);
  expect(await undoDepth(page)).toBe(depth + 2);
  expect(errors).toEqual([]);
});

test('trim (both edges), move and split work on an overlay; audio controls are absent', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addOverlay(page, 'subscribe');
  const id = (await overlay(page)).id;
  for (const t of ['inspector-volume', 'audio-fx-panel']) await expect(f(page, t)).toHaveCount(0);
  await expect(f(page, 'audio-detach')).toBeDisabled();
  const box = (await clipEl(page, id).boundingBox())!;
  let depth = await undoDepth(page);
  // Start trim earlier (an overlay has no source: it may grow to the left); the end stays put.
  await dragTo(page, { x: box.x + 3, y: box.y + box.height / 2 }, { x: box.x - 27, y: box.y + box.height / 2 });
  await expect.poll(async () => (await overlay(page)).start).toBeLessThan(0.9);
  let o = await overlay(page);
  expect([o.in, +(o.start + o.out - o.in).toFixed(3), await undoDepth(page)]).toEqual([0, 6, depth + 1]);
  // End trim shorter.
  const b2 = (await clipEl(page, id).boundingBox())!;
  depth = await undoDepth(page);
  await dragTo(page, { x: b2.x + b2.width - 3, y: b2.y + b2.height / 2 }, { x: b2.x + b2.width - 63, y: b2.y + b2.height / 2 });
  await expect.poll(async () => { const c = await overlay(page); return c.out - c.in; }).toBeLessThan(o.out - o.in - 0.5);
  expect(await undoDepth(page)).toBe(depth + 1);
  // Move later.
  o = await overlay(page);
  const b3 = (await clipEl(page, id).boundingBox())!;
  await dragTo(page, { x: b3.x + b3.width / 2, y: b3.y + b3.height / 2 }, { x: b3.x + b3.width / 2 + 60, y: b3.y + b3.height / 2 });
  await expect.poll(async () => (await overlay(page)).start).toBeGreaterThan(o.start + 0.5);
  // Split at the playhead (selected clip): two overlay clips with the same spec.
  o = await overlay(page);
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), o.start + 1);
  await f(page, 'btn-split').click();
  await expect.poll(async () => (await overlays(page)).length).toBe(2);
  const [a, c] = await overlays(page);
  expect(a.overlay).toEqual(c.overlay);
  expect(c.start).toBeCloseTo(o.start + 1, 3);
  expect(errors).toEqual([]);
});

test('a locked layer refuses adding, editing and splitting with a plain-English toast', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addOverlay(page, 'lowerThird');
  const lock = (on: boolean) => page.evaluate((on) => {
    const s = window.__clipforge!.getState();
    const id = s.history.present.tracks.find((t) => t.clips.some((c) => c.kind === 'overlay'))!.id;
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, locked: on } : t)) }));
    s.setActiveTrack(id);
  }, on);
  await lock(true);
  await expect(f(page, 'overlay-text')).toBeDisabled();
  await expect(f(page, 'overlay-colour')).toBeDisabled();
  const depth = await undoDepth(page);
  await f(page, 'overlay-add').click();
  await f(page, 'overlay-add-sticker').click();
  await expectOnlyToast(page, 'Track is locked');
  expect(await overlays(page)).toHaveLength(1);
  expect(await undoDepth(page)).toBe(depth);
  expect(errors.filter((e) => !/Track is locked/.test(e))).toEqual([]);
});

test('a project with overlays reloads exactly', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addOverlay(page, 'lowerThird');
  await f(page, 'overlay-text').fill('Reloaded');
  await f(page, 'overlay-text').press('Enter');
  await addOverlay(page, 'progressBar');
  await expect.poll(async () => (await overlays(page)).length).toBe(2);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const before = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks);
  await page.reload();
  await expect(f(page, 'app')).toHaveAttribute('data-session', 'ready');
  expect(await page.evaluate(() => window.__clipforge!.getState().history.present.tracks)).toEqual(before);
  await clipEl(page, (await overlays(page))[0].id).click();
  await expect(f(page, 'overlay-text')).toHaveValue('Reloaded');
  expect(errors).toEqual([]);
});
