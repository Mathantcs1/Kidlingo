// On-canvas move, scale and rotate of a picture-in-picture clip: the overlay over the preview, one undo step per
// gesture, Escape and empty-canvas presses doing nothing, snapping and the inspector fields following.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';
import {
  canvasBox, dragTo, expectOverlayFollows, expectPixel, holding, isBlue, isGreen, isRed, isYellow, setupPip, toPage,
  transformOf, undoDepth,
} from './pip-helpers';

test.setTimeout(60_000);

const C = { x: 960, y: 540 };

test('dragging the body moves the clip on the preview, one undo step that undo restores exactly', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const before = await transformOf(page, 'pip');
  const depth = await undoDepth(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  const [dx, dy] = [120, 70];
  await holding(page, 'Alt', () => dragTo(page, from, { x: from.x + dx, y: from.y + dy }));
  const t = await transformOf(page, 'pip');
  expect(Math.abs(t.x - dx / b.s)).toBeLessThanOrEqual(2);
  expect(Math.abs(t.y - dy / b.s)).toBeLessThanOrEqual(2);
  expect([t.scale, t.rotation]).toEqual([1, 0]);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expectPixel(page, C.x, C.y, isBlue, 'background at the old centre');
  await expectPixel(page, C.x + t.x, C.y + t.y, isGreen, 'square at the new centre');
  await expectOverlayFollows(page, 'pip');
  // The inspector fields show the final transform.
  await expect.poll(async () => Number(await page.getByTestId('inspector-x').inputValue())).toBeCloseTo(t.x, 1);
  await expect.poll(async () => Number(await page.getByTestId('inspector-y').inputValue())).toBeCloseTo(t.y, 1);

  await page.getByTestId('btn-undo').click();
  expect(await transformOf(page, 'pip')).toEqual(before);
  await expectOverlayFollows(page, 'pip');
  await expectPixel(page, C.x, C.y, isGreen, 'square back at the centre');
  expect(errors).toEqual([]);
});

test('a corner drag scales about the centre, outward and inward, each one undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const corner = toPage(b, { x: C.x + 100, y: C.y + 100 });
  const centre = toPage(b, C);
  const depth = await undoDepth(page);
  const out = { x: corner.x + 40, y: corner.y + 40 };
  await dragTo(page, corner, out);
  let t = await transformOf(page, 'pip');
  const ratio = Math.hypot(out.x - centre.x, out.y - centre.y) / Math.hypot(corner.x - centre.x, corner.y - centre.y);
  expect(Math.abs(t.scale / ratio - 1)).toBeLessThanOrEqual(0.03);
  expect([t.x, t.y, t.rotation]).toEqual([0, 0, 0]);
  expect(await undoDepth(page)).toBe(depth + 1);
  // Grown: a point just outside the old square is now green.
  await expectPixel(page, C.x + 110, C.y + 110, isGreen, 'grown square');
  await expectOverlayFollows(page, 'pip');

  const big = t.scale;
  const corner2 = toPage(b, { x: C.x + 100 * big, y: C.y + 100 * big });
  const inward = { x: centre.x + (corner2.x - centre.x) / 2, y: centre.y + (corner2.y - centre.y) / 2 };
  await dragTo(page, corner2, inward);
  t = await transformOf(page, 'pip');
  expect(Math.abs(t.scale / (big / 2) - 1)).toBeLessThanOrEqual(0.03);
  expect([t.x, t.y]).toEqual([0, 0]);
  expect(await undoDepth(page)).toBe(depth + 2);
  const edge = 100 * t.scale;
  expect(edge).toBeLessThan(100 * big - 30);
  await expectPixel(page, C.x + edge + 15, C.y + edge + 15, isBlue, 'outside the shrunk square');
  await expectPixel(page, C.x + edge - 15, C.y + edge - 15, isGreen, 'inside the shrunk square');
  await expectPixel(page, C.x, C.y, isGreen, 'centre still green');
  expect(errors).toEqual([]);
});

test('the rotate handle turns a non-square clip; Shift snaps to 15 degree steps', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split');
  await expectPixel(page, C.x - 100, C.y, isRed, 'left half red before rotating');
  const b = await canvasBox(page);
  const centre = toPage(b, C);
  const handle = await page.getByTestId('overlay-handle-rotate').boundingBox();
  const h = { x: handle!.x + handle!.width / 2, y: handle!.y + handle!.height / 2 };
  // The drawn handle sits 28 CSS px above the top edge's middle.
  expect(Math.abs(h.x - centre.x)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(centre.y - 50 * b.s - 28 - h.y)).toBeLessThanOrEqual(1.5);
  const r = centre.y - h.y;
  const depth = await undoDepth(page);
  await dragTo(page, h, { x: centre.x + r, y: centre.y });
  let t = await transformOf(page, 'pip');
  expect(Math.abs(t.rotation - 90)).toBeLessThanOrEqual(1);
  expect(await undoDepth(page)).toBe(depth + 1);
  // Turned a quarter clockwise: red on top, yellow below, the old red side is background.
  await expectPixel(page, C.x, C.y - 80, isRed, 'red on top');
  await expectPixel(page, C.x, C.y + 80, isYellow, 'yellow below');
  await expectPixel(page, C.x - 120, C.y, isBlue, 'background left');
  await expectOverlayFollows(page, 'pip');
  await expect.poll(async () => Number(await page.getByTestId('inspector-rotation').inputValue())).toBeCloseTo(t.rotation, 1);

  await page.getByTestId('btn-undo').click();
  expect((await transformOf(page, 'pip')).rotation).toBe(0);
  // Shift: a pointer 50° clockwise from straight up gives 45°.
  const a = (50 * Math.PI) / 180;
  await holding(page, 'Shift', () => dragTo(page, h, { x: centre.x + r * Math.sin(a), y: centre.y - r * Math.cos(a) }));
  t = await transformOf(page, 'pip');
  expect(t.rotation).toBe(45);
  expect(errors).toEqual([]);
});

test('Escape mid-drag restores the clip with no undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const before = await transformOf(page, 'pip');
  const depth = await undoDepth(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  await dragTo(page, from, { x: from.x + 150, y: from.y - 40 }, { escape: true });
  expect(await transformOf(page, 'pip')).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);
  await expectOverlayFollows(page, 'pip');
  await expectPixel(page, C.x, C.y, isGreen, 'square still centred');
  // A plain release afterwards commits nothing either.
  await page.mouse.move(from.x + 5, from.y + 5);
  expect(await undoDepth(page)).toBe(depth);
  expect(errors).toEqual([]);
});

test('a press and drag on empty canvas changes nothing and keeps the selection', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const before = await page.evaluate(() => window.__clipforge!.getState().history.present);
  const depth = await undoDepth(page);
  const b = await canvasBox(page);
  const from = toPage(b, { x: 300, y: 250 });
  await dragTo(page, from, { x: from.x + 100, y: from.y + 60 });
  await page.mouse.click(from.x, from.y);
  expect(await undoDepth(page)).toBe(depth);
  expect(await page.evaluate(() => window.__clipforge!.getState().history.present)).toEqual(before);
  expect(await page.evaluate(() => window.__clipforge!.getState().selection)).toEqual(['pip']);
  await expect(page.getByTestId('transform-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});

test('moving near the canvas centre snaps the clip centre exactly; Alt turns snapping off', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, transform: { ...c.transform, x: 300, y: 200 } } : c)) })),
  })));
  const b = await canvasBox(page);
  const from = toPage(b, { x: C.x + 300, y: C.y + 200 });
  // 3 and 2 CSS px short of the centre: within the 8 CSS px threshold.
  const near = { x: from.x - 300 * b.s + 3, y: from.y - 200 * b.s + 2 };
  await dragTo(page, from, near);
  let t = await transformOf(page, 'pip');
  expect([t.x, t.y]).toEqual([0, 0]);
  await page.getByTestId('btn-undo').click();
  await holding(page, 'Alt', () => dragTo(page, from, near));
  t = await transformOf(page, 'pip');
  expect(Math.abs(t.x - 3 / b.s)).toBeLessThanOrEqual(1);
  expect(Math.abs(t.y - 2 / b.s)).toBeLessThanOrEqual(1);
  expect(t.x).not.toBe(0);
  expect(errors).toEqual([]);
});
