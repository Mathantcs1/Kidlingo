import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PPS,
  addToTimeline,
  center,
  clipEl,
  clipStates,
  drag,
  importFiles,
  lane,
  mediaItem,
  noAudio,
  open,
  playerState,
  toast,
  tone,
  trackErrors,
  withAudio,
} from './helpers';

test.setTimeout(60_000);

function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__clipforge!.getState().selection);
}

test('dragging media from the bin drops a clip at the pointer time on a matching lane', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, tone], 2);
  const videoLane = lane(page, 'video');
  await expect(videoLane).toHaveAttribute('data-track-id', /.+/);
  await expect(lane(page, 'audio')).toHaveAttribute('data-track-kind', 'audio');

  // The lane highlights while media is dragged over it.
  await mediaItem(page, 'with-audio.mp4').hover();
  await page.mouse.down();
  const laneBox = (await videoLane.boundingBox())!;
  await page.mouse.move(laneBox.x + 2 * PPS, laneBox.y + 20, { steps: 6 });
  await expect(videoLane).toHaveAttribute('data-drop-target', 'true');
  await page.mouse.up();
  await expect(videoLane).not.toHaveAttribute('data-drop-target', 'true');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  let s = await clipStates(page);
  expect(s[0].trackKind).toBe('video');
  expect(Math.abs(s[0].start - 2)).toBeLessThanOrEqual(0.1);
  expect(s[0].out - s[0].in).toBeCloseTo(3, 2);

  // Audio-only media is refused by the video lane.
  await mediaItem(page, 'tone.wav').dragTo(videoLane, { targetPosition: { x: 8 * PPS, y: 20 } });
  await expect(toast(page)).toContainText('Audio goes on an audio track');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);

  // A drop that would overlap leaves the timeline unchanged.
  const depth = (await playerState(page)).undoDepth;
  await mediaItem(page, 'with-audio.mp4').dragTo(videoLane, { targetPosition: { x: 3 * PPS, y: 20 } });
  await expect(toast(page).filter({ hasText: 'overlaps' })).toHaveCount(1);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // Audio goes on the audio lane; each drop is one undo step.
  await mediaItem(page, 'tone.wav').dragTo(lane(page, 'audio'), { targetPosition: { x: 1 * PPS, y: 20 } });
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  s = await clipStates(page);
  const audio = s.find((c) => c.trackKind === 'audio')!;
  expect(Math.abs(audio.start - 1)).toBeLessThanOrEqual(0.1);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);

  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function twoClips(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'no-audio.mp4', 2);
}

test('dragging a clip body moves it in one undo step; overlaps revert; Escape cancels', async ({ page }) => {
  const errors = trackErrors(page);
  await twoClips(page);
  const [a, b] = await clipStates(page);
  expect(b.start).toBeCloseTo(3, 3);
  const depth = (await playerState(page)).undoDepth;

  // A click without movement selects and does not move.
  await clipEl(page, b.id).click();
  expect(await selection(page)).toEqual([b.id]);
  expect((await clipStates(page))[1].start).toBeCloseTo(3, 3);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // Dragging an unselected clip selects it and moves it by the pointer delta.
  await clipEl(page, a.id).click();
  const from = await center(clipEl(page, b.id));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 45, from.y, { steps: 4 });
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(from.x + 90, from.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  let moved = (await clipStates(page)).find((c) => c.id === b.id)!;
  expect(Math.abs(moved.start - 4.5)).toBeLessThanOrEqual(8 / PPS);
  expect(await selection(page)).toEqual([b.id]);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);

  await page.getByTestId('btn-undo').click();
  moved = (await clipStates(page)).find((c) => c.id === b.id)!;
  expect(moved.start).toBeCloseTo(3, 3);

  // Onto clip a: reverted with the overlap toast.
  await drag(page, await center(clipEl(page, b.id)), -90);
  await expect(toast(page)).toContainText('Clip overlaps an existing clip');
  moved = (await clipStates(page)).find((c) => c.id === b.id)!;
  expect(moved.start).toBeCloseTo(3, 3);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // Snaps to a's end when released within 8 px of it (after moving away first).
  await drag(page, await center(clipEl(page, b.id)), 120);
  await drag(page, await center(clipEl(page, b.id)), -115);
  moved = (await clipStates(page)).find((c) => c.id === b.id)!;
  expect(moved.start).toBe(3);

  // Escape cancels a drag in progress.
  const before = await clipStates(page);
  const depthBefore = (await playerState(page)).undoDepth;
  const c = await center(clipEl(page, b.id));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await clipStates(page)).toEqual(before);
  expect((await playerState(page)).undoDepth).toBe(depthBefore);
  expect(errors).toEqual([]);
});

test('dragging clip edges trims in one undo step each; invalid trims revert', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [orig] = await clipStates(page);
  const el = clipEl(page, orig.id);
  const depth = (await playerState(page)).undoDepth;
  await expect(el.getByTestId('trim-end')).toHaveCSS('cursor', 'ew-resize');

  await drag(page, await center(el.getByTestId('trim-end')), -60);
  let [c] = await clipStates(page);
  expect(Math.abs(c.out - c.in - 2)).toBeLessThanOrEqual(0.1);
  expect(c.start).toBe(0);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);

  await drag(page, await center(el.getByTestId('trim-start')), 30);
  [c] = await clipStates(page);
  expect(Math.abs(c.start - 0.5)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(c.in - 0.5)).toBeLessThanOrEqual(0.1);
  expect(c.in).toBeCloseTo(c.start, 6);
  expect(Math.abs(c.out - 2)).toBeLessThanOrEqual(0.1);
  expect((await playerState(page)).undoDepth).toBe(depth + 2);
  const trimmed = c;

  // Before the start of the source.
  await drag(page, await center(el.getByTestId('trim-start')), -60);
  await expect(toast(page)).toContainText('Trim extends beyond source');
  expect(await clipStates(page)).toEqual([trimmed]);

  // Shorter than the minimum clip length.
  await drag(page, await center(el.getByTestId('trim-end')), -200);
  await expect(toast(page).filter({ hasText: 'Clip would be too short' })).toHaveCount(1);
  expect(await clipStates(page)).toEqual([trimmed]);
  expect((await playerState(page)).undoDepth).toBe(depth + 2);

  await page.getByTestId('btn-undo').click();
  [c] = await clipStates(page);
  expect(c.start).toBe(0);
  expect(c.in).toBe(0);
  await page.getByTestId('btn-undo').click();
  expect(await clipStates(page)).toEqual([orig]);
  expect(errors).toEqual([]);
});
