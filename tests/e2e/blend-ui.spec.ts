// The blend-mode select in the inspector (Plan 4 Task 11a): changes the preview, ONE undo step per choice, the
// locked-track rule (disabled, refused), a hidden track keeps it editable like the transform fields, none for audio.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { addToTimeline, clipEl, clipStates, importFiles, trackErrors } from './helpers';
import { pixelAt } from './pip-helpers';
import { depth, f, setupImage } from './effects-ui-helpers';

test.setTimeout(90_000);
const centre = (page: Page) => pixelAt(page, 960, 540);
const blend = (page: Page): Promise<string> =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips)[0].blend);
const trackHeader = async (page: Page) => {
  const id = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks[0].id);
  return page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);
};

test('choosing Multiply over the black canvas darkens the preview in ONE step; Undo restores Normal', async ({ page }) => {
  const errors = trackErrors(page);
  await setupImage(page);
  const select = f(page, 'blend-mode-select');
  await expect(select).toHaveValue('normal');
  await expect.poll(async () => (await centre(page))[2] > 150, { message: 'plain image' }).toBe(true);
  const d0 = await depth(page);
  await select.selectOption('multiply');
  expect(await blend(page)).toBe('multiply');
  expect(await depth(page)).toBe(d0 + 1);
  // Multiply with the black canvas is black; Screen with black is the picture itself.
  await expect.poll(async () => Math.max(...(await centre(page))), { message: 'multiplied by black' }).toBeLessThanOrEqual(3);
  await select.selectOption('screen');
  expect(await depth(page)).toBe(d0 + 2);
  await expect.poll(async () => (await centre(page))[2] > 150, { message: 'screen over black' }).toBe(true);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(select).toHaveValue('multiply');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(select).toHaveValue('normal');
  expect(await depth(page)).toBe(d0);
  await expect.poll(async () => (await centre(page))[2] > 150, { message: 'normal again' }).toBe(true);
  expect(errors).toEqual([]);
});

test('a locked track disables the select and refuses changes; a hidden track keeps it editable', async ({ page }) => {
  await setupImage(page);
  const select = f(page, 'blend-mode-select');
  const header = await trackHeader(page);
  await header.getByTestId('track-btn-lock').click();
  await expect(select).toBeDisabled();
  const d0 = await depth(page);
  await select.selectOption('screen', { force: true }).catch(() => undefined);
  expect(await blend(page)).toBe('normal');
  expect(await depth(page)).toBe(d0);
  await header.getByTestId('track-btn-lock').click();
  await header.getByTestId('track-btn-hide').click();
  await expect(select).toBeEnabled();
  await select.selectOption('difference');
  expect(await blend(page)).toBe('difference');
  // Hidden: nothing is drawn, whatever the blend.
  await expect.poll(async () => Math.max(...(await centre(page)))).toBeLessThanOrEqual(3);
});

test('audio clips have no blend select', async ({ page }) => {
  await setupImage(page);
  await expect(f(page, 'blend-mode-select')).toBeVisible();
  await importFiles(page, [join(ensureFixtures(), 'tone.wav')], 2);
  await addToTimeline(page, 'tone.wav', 2);
  const audio = (await clipStates(page)).find((c) => c.trackKind === 'audio')!;
  await clipEl(page, audio.id).click();
  await expect(f(page, 'inspector-volume')).toBeVisible();
  await expect(f(page, 'blend-mode-select')).toHaveCount(0);
});
