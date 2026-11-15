// Plan 4 Task 11: the overlay panel and overlay inspector.
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { PPS, center, clipEl, clipStates, drag, open, playerState, trackErrors } from './helpers';
import { dragTo, overlayBounds, pixelAt, transformOf, undoDepth } from './pip-helpers';

test.setTimeout(180_000);

const f = (page: Page, id: string): Locator => page.getByTestId(id);
const near = (a: number[], b: number[], tol: number): boolean => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const waitPix = (page: Page, x: number, y: number, ok: (p: number[]) => boolean): Promise<void> => expect.poll(async () => ok(await pixelAt(page, x, y))).toBe(true);
const overlayClips = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'overlay'));

// The default lower third on a 1920x1080 canvas: its accent bar sits at about (82, 922).
const BAR: [number, number] = [82, 922];
const ACCENT = [255, 59, 48];

test('add a lower third at the playhead: one undo step, drawn in the preview, labelled on the timeline; undo removes it', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const d0 = await undoDepth(page);
  await f(page, 'overlay-add-lowerThird').click();
  expect(await undoDepth(page)).toBe(d0 + 1);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('timeline-clip')).toContainText('Your name');
  await expect(f(page, 'overlay-inspector')).toBeVisible();
  await waitPix(page, BAR[0], BAR[1], (p) => near(p, ACCENT, 12));
  await f(page, 'btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('text commits once on Enter or blur, Escape reverts, and typing does not trigger editor shortcuts', async ({ page }) => {
  await open(page);
  await f(page, 'overlay-add-lowerThird').click();
  const d0 = await undoDepth(page);
  const title = f(page, 'overlay-text');
  await title.fill('Hello');
  expect(await undoDepth(page)).toBe(d0);
  await title.press('Enter');
  expect(await undoDepth(page)).toBe(d0 + 1);
  await expect(page.getByTestId('timeline-clip')).toContainText('Hello');

  await title.fill('zzz');
  await title.press('Escape');
  await expect(title).toHaveValue('Hello');
  expect(await undoDepth(page)).toBe(d0 + 1);

  await title.focus();
  await title.press('End');
  await title.pressSequentially('s d 1');
  await title.press('Delete');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  expect((await playerState(page)).playing).toBe(false);
  expect(await undoDepth(page)).toBe(d0 + 1);
  await title.press('Escape');
  await expect(title).toHaveValue('Hello');
  await f(page, 'overlay-subtext').fill('Creator');
  await f(page, 'overlay-subtext').blur();
  expect(await undoDepth(page)).toBe(d0 + 2);
  expect((await overlayClips(page))[0].overlay!.subtext).toBe('Creator');
});

test('the on-canvas handles move the overlay in one undo step; undo restores the exact transform', async ({ page }) => {
  await open(page);
  await f(page, 'overlay-add-lowerThird').click();
  await expect(f(page, 'transform-overlay')).toBeVisible();
  const id = (await overlayClips(page))[0].id;
  const before = await transformOf(page, id);
  const d0 = await undoDepth(page);
  const b = await overlayBounds(page);
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await dragTo(page, from, { x: from.x + 60, y: from.y - 40 });
  expect(await undoDepth(page)).toBe(d0 + 1);
  const moved = await transformOf(page, id);
  expect(moved.x).toBeGreaterThan(before.x + 20);
  expect(moved.y).toBeLessThan(before.y - 10);
  await f(page, 'btn-undo').click();
  expect(await transformOf(page, id)).toEqual(before);
});

test('stickers: add one by shape and recolour it', async ({ page }) => {
  await open(page);
  await f(page, 'overlay-sticker-8').click();
  const clip = (await overlayClips(page))[0];
  expect(clip.overlay).toMatchObject({ type: 'sticker', params: { shape: 8 } });
  await waitPix(page, 960, 540, (p) => near(p, [255, 214, 10], 12));
  const d0 = await undoDepth(page);
  await f(page, 'overlay-accent').evaluate((el) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#00ff00');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(await undoDepth(page)).toBe(d0 + 1);
  await waitPix(page, 960, 540, (p) => near(p, [0, 255, 0], 12));
  await f(page, 'overlay-shape').selectOption('0');
  expect((await overlayClips(page))[0].overlay!.params.shape).toBe(0);
});

test('a reload restores the overlay and its text; a format switch keeps its relative placement', async ({ page }) => {
  await open(page);
  await f(page, 'overlay-add-lowerThird').click();
  await f(page, 'overlay-text').fill('Persist');
  await f(page, 'overlay-text').press('Enter');
  const before = (await overlayClips(page))[0];
  await f(page, 'format-select').selectOption({ index: 1 });
  const after = (await overlayClips(page))[0];
  const fmt = await page.evaluate(() => window.__clipforge!.getState().history.present.format);
  expect(after.transform.x / fmt.width).toBeCloseTo(before.transform.x / 1920, 6);
  expect(after.transform.y / fmt.height).toBeCloseTo(before.transform.y / 1080, 6);
  expect(after.overlay).toEqual(before.overlay);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('timeline-clip')).toContainText('Persist');
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  await expect(f(page, 'overlay-text')).toHaveValue('Persist');
});

test('an export contains the overlay', async ({ page }) => {
  await open(page);
  await f(page, 'overlay-add-lowerThird').click();
  const [c] = await clipStates(page);
  await drag(page, await center(clipEl(page, c.id).getByTestId('trim-end')), -(c.out - c.in - 0.5) * PPS);
  await f(page, 'btn-export').click();
  await f(page, 'btn-export-start').click();
  const link = f(page, 'export-download');
  await expect(link).toBeVisible({ timeout: 150_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const frame = ffmpegFrame(await download.path(), 0);
  const i = (BAR[1] * frame.width + BAR[0]) * 3;
  const got = [frame.rgb[i], frame.rgb[i + 1], frame.rgb[i + 2]];
  expect(near(got, ACCENT, 20), `exported accent bar ${got}`).toBe(true);
});
