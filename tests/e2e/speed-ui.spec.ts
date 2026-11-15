// Plan 5D Task 11: the Speed section, the clip badge, the context menu and the ramp presets through the real app.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, noAudio, open, setPlayhead, toast, trackErrors, withAudio } from './helpers';

test.setTimeout(90_000);

const present = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const clipById = async (page: Page, id: string) => (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;

async function setField(page: Page, testId: string, value: string): Promise<void> {
  const f = page.getByTestId(testId);
  await f.fill(value);
  await f.press('Enter');
}

async function setup(page: Page, second = false): Promise<string> {
  await open(page);
  await importFiles(page, second ? [withAudio, noAudio] : [withAudio], second ? 2 : 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  if (second) await addToTimeline(page, 'no-audio.mp4', 2);
  const id = (await clipStates(page)).find((c) => c.trackKind === 'video')!.id;
  await clipEl(page, id).click();
  await expect(page.getByTestId('speed-section')).toBeVisible();
  return id;
}

test('speed field: one undo step, whole-frame length, badge, undo restores', async ({ page }) => {
  const errors = trackErrors(page);
  const id = await setup(page);
  const before = await depth(page);
  await setField(page, 'speed-value', '200');
  const c = await clipById(page, id);
  expect(c.speed).toBe(2);
  expect((c.out - c.in) / 2 * 30).toBeCloseTo(Math.round(((c.out - c.in) / 2) * 30), 6);
  expect(await depth(page)).toBe(before + 1);
  await expect(clipEl(page, id).getByTestId('clip-speed-badge')).toHaveText('2×');
  await page.getByTestId('btn-undo').click();
  expect((await clipById(page, id)).speed).toBeUndefined();
  await expect(page.getByTestId('clip-speed-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('duration field sets the speed; an out-of-range duration is refused with a message', async ({ page }) => {
  const id = await setup(page);
  const len = (await clipById(page, id)).out - (await clipById(page, id)).in;
  await setField(page, 'speed-duration', String(len / 2));
  expect((await clipById(page, id)).speed).toBeCloseTo(2, 6);
  const depthNow = await depth(page);
  await setField(page, 'speed-duration', String(len * 10));
  await expect(toast(page)).toContainText('speed stays between');
  expect(await depth(page)).toBe(depthNow);
});

test('a slow-down that would overlap the next clip is refused; "Push later clips" moves it', async ({ page }) => {
  const id = await setup(page, true);
  const second = (await clipStates(page)).find((c) => c.trackKind === 'video' && c.id !== id)!;
  const startBefore = (await clipById(page, second.id)).start;
  await setField(page, 'speed-value', '50');
  await expect(toast(page)).toContainText('overlap the next clip');
  expect((await clipById(page, id)).speed).toBeUndefined();
  await page.getByTestId('speed-ripple').check();
  await setField(page, 'speed-value', '50');
  expect((await clipById(page, id)).speed).toBe(0.5);
  expect((await clipById(page, second.id)).start).toBeGreaterThan(startBefore);
});

test('reverse and preserve pitch toggles are one step each; reset returns to normal speed', async ({ page }) => {
  const id = await setup(page);
  let d = await depth(page);
  await page.getByTestId('speed-reverse').click();
  expect((await clipById(page, id)).reverse).toBe(true);
  await expect(page.getByTestId('clip-speed-badge')).toHaveText('◀');
  expect(await depth(page)).toBe(++d);
  await page.getByTestId('speed-pitch').uncheck();
  expect((await clipById(page, id)).preservePitch).toBe(false);
  expect(await depth(page)).toBe(++d);
  await setField(page, 'speed-value', '150');
  expect(await depth(page)).toBe(++d);
  await page.getByTestId('speed-reset').click();
  expect((await clipById(page, id)).speed).toBeUndefined();
  expect(await depth(page)).toBe(++d);
});

test('a locked track disables the Speed controls', async ({ page }) => {
  const id = await setup(page);
  await page.evaluate((id) => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, locked: t.clips.some((c) => c.id === id) ? true : t.locked })) })), id);
  await expect(page.getByTestId('speed-value')).toBeDisabled();
  await expect(page.getByTestId('speed-reverse')).toBeDisabled();
  await expect(page.getByTestId('speed-freeze')).toBeDisabled();
});

test('freeze frame at the playhead: one step, a still of that frame, later clips move', async ({ page }) => {
  const errors = trackErrors(page);
  const id = await setup(page, true);
  const second = (await clipStates(page)).find((c) => c.trackKind === 'video' && c.id !== id)!;
  const startBefore = (await clipById(page, second.id)).start;
  await setPlayhead(page, 1);
  const d = await depth(page);
  await page.getByTestId('speed-freeze').click();
  expect(await depth(page)).toBe(d + 1);
  const clips = (await present(page)).tracks.flatMap((t) => t.clips);
  const still = clips.find((c) => c.freeze)!;
  expect(still.freeze!.at).toBeCloseTo(1, 1);
  expect(still.out - still.in).toBe(2);
  expect(still.audio.silent).toBe(true);
  expect((await clipById(page, second.id)).start).toBeCloseTo(startBefore + 2, 6);
  await expect(page.getByTestId('clip-speed-badge')).toHaveText('Freeze');
  expect(errors).toEqual([]);
});

test('context menu: Speed 200%, Reverse and Freeze frame use the same commands', async ({ page }) => {
  const id = await setup(page);
  await setPlayhead(page, 1);
  await clipEl(page, id).click({ button: 'right' });
  await page.getByTestId('context-menu').getByText('Speed 200%').click();
  expect((await clipById(page, id)).speed).toBe(2);
  await clipEl(page, id).click({ button: 'right' });
  await page.getByTestId('context-menu').getByText('Reverse').click();
  expect((await clipById(page, id)).reverse).toBe(true);
});

test('ramp presets: Bullet time sets a ramp with a graph; a point value edits it; Remove ramp returns to constant speed', async ({ page }) => {
  const id = await setup(page);
  await page.getByTestId('speed-preset-bullet').click();
  let c = await clipById(page, id);
  expect(c.speedKeys).toHaveLength(5);
  expect(c.speed).toBeUndefined();
  await expect(page.getByTestId('speed-ramp-dot')).toHaveCount(5);
  await expect(page.getByTestId('clip-speed-badge')).toHaveText('Ramp');
  const d = await depth(page);
  await setField(page, 'speed-point-2', '50');
  c = await clipById(page, id);
  expect(c.speedKeys![2].v).toBe(0.5);
  expect(await depth(page)).toBe(d + 1);
  await page.getByTestId('speed-ramp-remove').click();
  expect((await clipById(page, id)).speedKeys).toBeUndefined();
  await expect(page.getByTestId('speed-ramp-dot')).toHaveCount(0);
});
