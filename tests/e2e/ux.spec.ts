// Small editor behaviours: timecode tenths, playhead clamped to the content, merge needs two clips, and the
// timeline following the playhead during playback.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, noAudio, open, playerState, setPlayhead, withAudio } from './helpers';

async function twoClips(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1); // [0,3)
  await addToTimeline(page, 'no-audio.mp4', 2); // [3,5)
}

const scrollLeft = (page: Page): Promise<number> => page.getByTestId('timeline-scroll').evaluate((el) => el.scrollLeft);

test('the toolbar timecode shows tenths of a second', async ({ page }) => {
  await twoClips(page);
  const timecode = page.getByLabel('Playhead position');
  await expect(timecode).toHaveText('0:00.0');
  await setPlayhead(page, 1.5);
  await expect(timecode).toHaveText('0:01.5');
});

test('the playhead is clamped when the timeline shrinks under it', async ({ page }) => {
  await twoClips(page);
  const [, second] = await clipStates(page);
  await setPlayhead(page, 4.5);
  expect((await playerState(page)).playhead).toBeCloseTo(4.5, 2);
  await clipEl(page, second.id).click();
  await page.getByTestId('btn-delete').click();
  expect((await playerState(page)).playhead).toBe(3);
  await page.getByTestId('btn-undo').click();
  expect((await playerState(page)).playhead).toBe(3);
});

test('Merge is enabled only with two or more selected clips', async ({ page }) => {
  await twoClips(page);
  const [a, b] = await clipStates(page);
  const merge = page.getByTestId('btn-merge');
  await expect(merge).toBeDisabled();
  await clipEl(page, a.id).click();
  await expect(merge).toBeDisabled();
  await clipEl(page, b.id).click({ modifiers: ['Shift'] });
  await expect(merge).toBeEnabled();
});

test('the timeline scrolls to follow the playhead during playback, but not against a manual scroll', async ({ page }) => {
  await twoClips(page);
  for (let i = 0; i < 5; i++) await page.getByTestId('btn-zoom-in').click(); // 455 px/s: 5 s ≈ 2280 px
  const width = await page.getByTestId('timeline-scroll').evaluate((el) => el.clientWidth);
  expect(width).toBeLessThan(5 * 455);
  expect(await scrollLeft(page)).toBe(0);

  await page.getByTestId('btn-play').click();
  await expect.poll(() => scrollLeft(page), { timeout: 10_000 }).toBeGreaterThan(0);
  // The playhead is inside the visible part after the jump.
  const { playhead } = await playerState(page);
  const left = await scrollLeft(page);
  expect(playhead * 455).toBeGreaterThanOrEqual(left - 455 * 0.2);

  // A manual scroll back to the start is not undone while playback continues.
  await page.getByTestId('timeline-scroll').evaluate((el) => {
    el.scrollLeft = 0;
  });
  await page.waitForTimeout(700);
  expect((await playerState(page)).playing).toBe(true);
  expect(await scrollLeft(page)).toBe(0);
});
