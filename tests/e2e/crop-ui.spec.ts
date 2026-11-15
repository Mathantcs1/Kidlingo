// Plan 5E Task 6: the Crop & Flip and Anchor point sections of the inspector, through the real app.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isRed, isYellow, setupPip, undoDepth } from './pip-helpers';

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
});
