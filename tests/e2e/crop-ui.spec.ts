// Plan 5E Task 6: the Crop & Flip and Anchor point sections of the inspector, through the real app.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { canvasBox, expectPixel, isBlue, isRed, isYellow, setupPip, toPage, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const clipOf = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!);

async function setField(page: Page, testId: string, value: string): Promise<void> {
  const f = page.getByTestId(testId);
  await f.fill(value);
  await f.press('Enter');
}

test('crop fields: one undo step each, the mask hides pixels without moving the rest', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split'); // red | yellow, 300x100 centred at (960, 540)
  await expectPixel(page, 880, 540, isRed, 'red left half');
  const depth = await undoDepth(page);
  await setField(page, 'crop-left', '50');
  expect((await clipOf(page)).crop).toEqual({ left: 0.5, top: 0, right: 0, bottom: 0 });
  expect(await undoDepth(page)).toBe(depth + 1);
  await expectPixel(page, 880, 540, isBlue, 'the cropped half shows the background');
  await expectPixel(page, 1030, 540, isYellow, 'the right half stays where it was');
  await setField(page, 'crop-right', '25');
  expect((await clipOf(page)).crop).toMatchObject({ left: 0.5, right: 0.25 });
  await expectPixel(page, 1100, 540, isBlue, 'right edge cropped');
  expect(await undoDepth(page)).toBe(depth + 2);
  await page.getByTestId('btn-undo').click();
  await page.getByTestId('btn-undo').click();
  expect((await clipOf(page)).crop).toBeUndefined();
  await expectPixel(page, 880, 540, isRed, 'undo restores the picture');
  expect(errors).toEqual([]);
});

test('an edge cannot squeeze the opposite one; reset removes the crop in one step', async ({ page }) => {
  await setupPip(page, 'split');
  await setField(page, 'crop-right', '60');
  await setField(page, 'crop-left', '90');
  const c = (await clipOf(page)).crop!;
  expect(c.right).toBeCloseTo(0.6, 9);
  expect(c.left).toBeCloseTo(1 - 0.6 - 8 / 300, 9); // at least 8 px of the 300 px picture stay visible
  const depth = await undoDepth(page);
  await page.getByTestId('crop-reset').click();
  expect((await clipOf(page)).crop).toBeUndefined();
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(page.getByTestId('crop-reset')).toBeDisabled();
});

test('flip buttons mirror the picture; pressed state follows; undo restores', async ({ page }) => {
  await setupPip(page, 'split');
  await page.getByTestId('flip-h').click();
  await expect(page.getByTestId('flip-h')).toHaveAttribute('aria-pressed', 'true');
  expect((await clipOf(page)).flip).toEqual({ h: true });
  await expectPixel(page, 880, 540, isYellow, 'yellow now on the left');
  await expectPixel(page, 1030, 540, isRed, 'red now on the right');
  await page.getByTestId('flip-h').click();
  expect((await clipOf(page)).flip).toBeUndefined();
  await expectPixel(page, 880, 540, isRed, 'flipped back');
  await page.getByTestId('flip-v').click();
  expect((await clipOf(page)).flip).toEqual({ v: true });
  await page.getByTestId('btn-undo').click();
  expect((await clipOf(page)).flip).toBeUndefined();
});

test('anchor fields move the pivot (and so the picture); reset and "to crop centre"; stopwatch keys it', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split');
  await expect(page.getByTestId('anchor-reset')).toBeDisabled();
  await setField(page, 'anchor-x', '-50');
  expect((await clipOf(page)).anchor).toEqual({ x: -0.5, y: 0 });
  await expectPixel(page, 880, 540, isBlue, 'the picture moved right: nothing at the old left');
  await expectPixel(page, 1030, 540, isRed, 'its left edge now sits at the canvas centre');
  await expectPixel(page, 1200, 540, isYellow, 'and its right half follows');
  await page.getByTestId('anchor-reset').click();
  expect((await clipOf(page)).anchor).toBeUndefined();
  await expectPixel(page, 880, 540, isRed, 'centred again');

  await setField(page, 'crop-left', '50');
  await page.getByTestId('anchor-to-crop').click();
  expect((await clipOf(page)).anchor).toEqual({ x: 0.25, y: 0 });

  await page.getByTestId('kf-toggle-anchor').click();
  expect((await clipOf(page)).keys?.anchor).toHaveLength(1);
  await expect(page.getByTestId('anchor-reset')).toBeDisabled();
  await expect(page.getByTestId('anchor-to-crop')).toBeDisabled();
  await page.getByTestId('kf-toggle-anchor').click();
  expect((await clipOf(page)).keys).toBeUndefined();
  expect((await clipOf(page)).anchor).toEqual({ x: 0.25, y: 0 });
  expect(errors).toEqual([]);
});

test('a keyed anchor: a field commit at another time adds a key, and the shown value follows the playhead', async ({ page }) => {
  await setupPip(page, 'split');
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0));
  await page.getByTestId('kf-toggle-anchor').click();
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(1));
  await setField(page, 'anchor-x', '-50');
  const keys = (await clipOf(page)).keys!.anchor!;
  expect(keys).toHaveLength(2);
  expect(keys[1]).toMatchObject({ x: -0.5, y: 0 });
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0.5));
  await expect.poll(async () => Number(await page.getByTestId('anchor-x').inputValue())).toBeCloseTo(-25, 0);
});

test('a locked track disables every crop, flip and anchor control', async ({ page }) => {
  await setupPip(page, 'split');
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, locked: true } : t)) })));
  for (const id of ['crop-left', 'crop-top', 'crop-right', 'crop-bottom', 'crop-mode-toggle', 'flip-h', 'flip-v', 'anchor-x', 'anchor-y', 'kf-toggle-anchor']) {
    await expect(page.getByTestId(id), id).toBeDisabled();
  }
  await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
  await expect(page.getByTestId('anchor-handle')).toHaveCount(0);
});

test('crop mode on the canvas needs the clip under the playhead (the toggle says why when it is not)', async ({ page }) => {
  await setupPip(page, 'split'); // the pip clip spans 0..2 s
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(3));
  await expect(page.getByTestId('crop-mode-toggle')).toBeDisabled();
  await expect(page.getByTestId('crop-mode-toggle')).toHaveAttribute('title', /playhead/i);
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(1));
  await expect(page.getByTestId('crop-mode-toggle')).toBeEnabled();
  await page.getByTestId('crop-mode-toggle').click();
  await expect(page.getByTestId('crop-overlay')).toBeVisible();
  // crop mode ends with the selection even when the preview overlay is not what notices
  await page.evaluate(() => window.__clipforge!.getState().select([]));
  await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__clipforge!.getState().select(['pip']));
  await expect(page.getByTestId('crop-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('a pivot drag far outside the picture is refused with a message, nothing changes', async ({ page }) => {
  await setupPip(page, 'split'); // 300 px wide: more than 2 widths away is 600+ px
  const b = await canvasBox(page);
  const depth = await undoDepth(page);
  const from = await center(page, 'anchor-handle');
  const to = toPage(b, { x: 1800, y: 540 });
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const c = await clipOf(page);
  expect(c.anchor).toBeUndefined();
  expect(c.transform.x).toBe(0);
  expect(await undoDepth(page)).toBe(depth);
  await expect(page.getByTestId('error-toast')).toContainText(/far/i);
});

async function center(page: Page, testId: string) {
  const r = (await page.getByTestId(testId).boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

test('crop mode: handles replace the move handles; dragging an edge crops live, one undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split'); // 300x100 at (960, 540): x 810..1110, y 490..590
  await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
  await page.getByTestId('crop-mode-toggle').click();
  await expect(page.getByTestId('crop-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('crop-overlay')).toBeVisible();
  await expect(page.getByTestId('overlay-handle-rotate')).toHaveCount(0);
  for (const h of ['l', 'r', 't', 'b', 'tl', 'tr', 'br', 'bl']) await expect(page.getByTestId(`crop-handle-${h}`), h).toBeVisible();
  const b = await canvasBox(page);
  const depth = await undoDepth(page);
  const from = await center(page, 'crop-handle-l');
  const to = toPage(b, { x: 885, y: 540 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, to.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  // live: the preview already shows the crop while the button is held, and nothing is committed yet
  await expectPixel(page, 830, 540, isBlue, 'live crop shows the background');
  expect((await clipOf(page)).crop).toBeUndefined();
  expect(await undoDepth(page)).toBe(depth);
  await page.mouse.up();
  const crop = (await clipOf(page)).crop!;
  expect(crop.left).toBeCloseTo(0.25, 1);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expectPixel(page, 830, 540, isBlue, 'cropped');
  await expectPixel(page, 930, 540, isRed, 'visible part stays where it was');
  await expect.poll(async () => Number(await page.getByTestId('crop-left').inputValue())).toBeCloseTo(25, 0);
  await page.getByTestId('btn-undo').click();
  expect((await clipOf(page)).crop).toBeUndefined();
  expect(errors).toEqual([]);
});

test('crop mode: a corner drag crops two edges at once; Escape cancels without a step; leaving the mode restores the handles', async ({ page }) => {
  await setupPip(page, 'split');
  await page.getByTestId('crop-mode-toggle').click();
  const b = await canvasBox(page);
  const depth = await undoDepth(page);
  const tl = await center(page, 'crop-handle-br');
  const to = toPage(b, { x: 1060, y: 565 });
  await page.mouse.move(tl.x, tl.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await clipOf(page)).crop).toBeUndefined();
  expect(await undoDepth(page)).toBe(depth);
  await expectPixel(page, 1100, 580, isYellow, 'nothing was cropped');
  // now for real
  const from2 = await center(page, 'crop-handle-br');
  await page.mouse.move(from2.x, from2.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const c = (await clipOf(page)).crop!;
  expect(c.right).toBeCloseTo(50 / 300, 1);
  expect(c.bottom).toBeCloseTo(25 / 100, 1);
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.getByTestId('crop-mode-toggle').click();
  await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
  await expect(page.getByTestId('overlay-handle-rotate')).toBeVisible();
});

test('crop mode follows a rotated clip and ends when the selection changes', async ({ page }) => {
  await setupPip(page, 'split');
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, clips: t.clips.map((c) => ({ ...c, transform: { ...c.transform, rotation: 90 } })) } : t)) })));
  await page.getByTestId('crop-mode-toggle').click();
  const b = await canvasBox(page);
  // Rotated 90 clockwise the picture covers x 910..1010, y 390..690 and the frame's TOP edge is on the screen's right
  // (x = 1010): dragging that handle left by 25 px crops 25 % of the frame's 100 px height.
  const from = await center(page, 'crop-handle-t');
  expect(from.x).toBeGreaterThan(toPage(b, { x: 1000, y: 540 }).x);
  const to = toPage(b, { x: 985, y: 540 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const crop = (await clipOf(page)).crop!;
  expect(crop.top).toBeCloseTo(0.25, 1);
  expect([crop.left, crop.right, crop.bottom].every((v) => v < 0.02)).toBe(true);
  await page.evaluate(() => window.__clipforge!.getState().select(['bg']));
  await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__clipforge!.getState().select(['pip']));
  await expect(page.getByTestId('crop-overlay')).toHaveCount(0);
  await expect(page.getByTestId('crop-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('pivot dot: Shift + drag moves the pivot without moving the picture, one undo step; Escape cancels', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split'); // 300x100 at (960, 540)
  const dot = page.getByTestId('anchor-handle');
  await expect(dot).toBeVisible();
  const b = await canvasBox(page);
  const depth = await undoDepth(page);
  const from = await center(page, 'anchor-handle');
  const to = toPage(b, { x: 1060, y: 520 });
  // Escape: nothing committed
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await clipOf(page)).anchor).toBeUndefined();
  expect(await undoDepth(page)).toBe(depth);
  // for real
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const c = await clipOf(page);
  expect(c.anchor!.x).toBeCloseTo((1060 - 810) / 300 - 0.5, 1);
  expect(c.anchor!.y).toBeCloseTo((520 - 490) / 100 - 0.5, 1);
  expect(c.transform.x).toBeCloseTo(100, 0);
  expect(c.transform.y).toBeCloseTo(-20, 0);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expectPixel(page, 880, 540, isRed, 'the picture did not move (red left half)');
  await expectPixel(page, 1030, 540, isYellow, 'nor the yellow half');
  await expectPixel(page, 800, 540, isBlue, 'nor its edge');
  // the dot now sits at the new pivot, which the rotation field turns about
  const moved = await center(page, 'anchor-handle');
  expect(Math.abs(moved.x - to.x)).toBeLessThan(3);
  await page.getByTestId('btn-undo').click();
  expect((await clipOf(page)).anchor).toBeUndefined();
  expect((await clipOf(page)).transform.x).toBe(0);
  expect(errors).toEqual([]);
});

test('without Shift a press on the dot still moves the clip; a keyed position cannot take the pivot drag', async ({ page }) => {
  await setupPip(page, 'split');
  const b = await canvasBox(page);
  const from = await center(page, 'anchor-handle');
  await page.mouse.move(from.x, from.y);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect((await clipOf(page)).anchor).toBeUndefined();
  expect((await clipOf(page)).transform.x).toBeGreaterThan(10);
  await page.getByTestId('btn-undo').click();
  await page.getByTestId('kf-toggle-position').click();
  const depth = await undoDepth(page);
  const f2 = await center(page, 'anchor-handle');
  await page.keyboard.down('Shift');
  await page.mouse.move(f2.x, f2.y);
  await page.mouse.down();
  await page.mouse.move(f2.x + 60, f2.y + 20, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const after = await clipOf(page);
  expect(after.anchor, 'no static pivot was set').toBeUndefined();
  expect(after.keys?.anchor, 'no anchor keys were added').toBeUndefined();
  expect(await undoDepth(page), 'Shift on a keyed position is just a normal drag, never a pivot step').toBeLessThanOrEqual(depth + 1);
  expect(b.s).toBeGreaterThan(0);
});
