// Right-click context menus: clip, empty lane and track header menus. Reuse the existing commands (one undo step each),
// Escape and arrow keys work, a locked track greys the edits, and right-click selects an unselected clip first.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, importFiles, lane, open, withAudio } from './helpers';

test.setTimeout(60_000);

const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const clips = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, start: c.start }))));
const selection = (page: Page) => page.evaluate(() => window.__clipforge!.getState().selection);
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const clipEl = (page: Page) => page.getByTestId('timeline-clip').first();

async function setup(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
}

test('right-click on an unselected clip selects it and opens the clip menu; Escape closes it and restores focus', async ({ page }) => {
  await setup(page);
  await lane(page, 'video').click({ position: { x: 600, y: 10 } }); // empty lane: clears the selection
  expect(await selection(page)).toHaveLength(0);
  await clipEl(page).click({ button: 'right' });
  expect(await selection(page)).toHaveLength(1);
  const menu = page.getByTestId('context-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'menu');
  for (const id of ['copy', 'paste', 'duplicate', 'split', 'delete', 'ripple-delete', 'detach', 'copy-anim', 'paste-anim']) {
    await expect(page.getByTestId(`ctx-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('ctx-merge')).toHaveCount(0); // one clip only
  await expect(page.getByTestId('ctx-paste')).toHaveAttribute('aria-disabled', 'true'); // nothing copied yet
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('arrow keys move over the enabled items only, Home/End jump, and no editor shortcut fires while it is open', async ({ page }) => {
  await setup(page);
  await clipEl(page).click({ button: 'right' });
  expect(await focused(page)).toBe('ctx-copy');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('ctx-duplicate'); // Paste is disabled and skipped
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await focused(page)).not.toBe('ctx-copy'); // wrapped to the last enabled item
  await page.keyboard.press('Home');
  expect(await focused(page)).toBe('ctx-copy');
  const d = await depth(page);
  await page.keyboard.press('Delete'); // must not delete the clip behind the menu
  expect(await depth(page)).toBe(d);
  expect(await clips(page)).toHaveLength(1);
  await page.keyboard.press('Escape');
});

test('Copy from the clip menu, then Paste from an empty lane menu places the copy at the clicked time (one undo step)', async ({ page }) => {
  await setup(page);
  await clipEl(page).click({ button: 'right' });
  await page.getByTestId('ctx-copy').click();
  const d = await depth(page);
  expect(d).toBe(await depth(page));
  await lane(page, 'video').click({ button: 'right', position: { x: 600, y: 10 } }); // 600 px = 10 s
  await page.getByTestId('ctx-paste').click();
  expect(await depth(page)).toBe(d + 1);
  const all = await clips(page);
  expect(all).toHaveLength(2);
  expect(Math.max(...all.map((c) => c.start))).toBeCloseTo(10, 0);
  await page.keyboard.press('Control+z');
  expect(await clips(page)).toHaveLength(1);
});

test('Delete from the menu is ONE undo step', async ({ page }) => {
  await setup(page);
  const d = await depth(page);
  await clipEl(page).click({ button: 'right' });
  await page.getByTestId('ctx-delete').click();
  expect(await clips(page)).toHaveLength(0);
  expect(await depth(page)).toBe(d + 1);
  await page.keyboard.press('Control+z');
  expect(await clips(page)).toHaveLength(1);
  expect(await depth(page)).toBe(d);
});

test('a locked track greys the edits of its clip menu and the paste of its lane menu', async ({ page }) => {
  await setup(page);
  await clipEl(page).click({ button: 'right' });
  await page.getByTestId('ctx-copy').click();
  await page.getByTestId('track-btn-lock').first().click();
  await clipEl(page).click({ button: 'right' });
  for (const id of ['delete', 'ripple-delete', 'split', 'duplicate', 'paste']) {
    await expect(page.getByTestId(`ctx-${id}`)).toHaveAttribute('aria-disabled', 'true');
  }
  await expect(page.getByTestId('ctx-copy')).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('ctx-delete').click({ force: true }); // a disabled item does nothing
  expect(await clips(page)).toHaveLength(1);
  await page.keyboard.press('Escape');
  await lane(page, 'video').click({ button: 'right', position: { x: 600, y: 10 } });
  await expect(page.getByTestId('ctx-paste')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
});

test('the track header menu toggles Mute and Lock through the track commands', async ({ page }) => {
  await setup(page);
  const header = page.getByTestId('track-header').first();
  const muted = () => page.evaluate(() => window.__clipforge!.getState().history.present.tracks[0].muted);
  await header.click({ button: 'right', position: { x: 10, y: 4 } });
  await page.getByTestId('ctx-mute').click();
  expect(await muted()).toBe(true);
  await header.click({ button: 'right', position: { x: 10, y: 4 } });
  await expect(page.getByTestId('ctx-mute')).toHaveText(/Unmute/);
  await expect(page.getByTestId('ctx-delete-track')).toHaveAttribute('aria-disabled', 'true'); // last track of its kind
  await page.keyboard.press('Escape');
});

test('the media bin item menu adds to the timeline', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await page.getByTestId('media-item').first().click({ button: 'right' });
  await page.getByTestId('ctx-add-to-timeline').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
});
