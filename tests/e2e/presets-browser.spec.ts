// Plan 5B Task 7: the preset browser (D10, §7): category tabs, search, favourites, keyboard (one tab stop, arrows,
// Enter applies in ONE step, Escape closes, keys never reach the global shortcuts), and the animated preview tiles
// (only the hovered tile animates; reduced motion keeps every tile still).
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';
import { clipJson, depth, openBrowser, setupOverlay, tilePixels } from './presets-ui-helpers';

test.setTimeout(60_000);

const tiles = (page: import('@playwright/test').Page) => page.locator('[data-testid^="preset-tile-"]');

test('category tabs list each slot\'s presets; favourites collect starred tiles; My presets is empty', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  const d0 = await depth(page);
  await openBrowser(page, 'in');
  await expect(page.getByTestId('preset-cat-in')).toHaveAttribute('aria-selected', 'true');
  await expect(tiles(page)).toHaveCount(8);
  await page.getByTestId('preset-cat-emphasis').click();
  await expect(tiles(page)).toHaveCount(6);
  await expect(page.getByTestId('preset-tile-pulse')).toBeVisible();
  await page.getByTestId('preset-cat-loop').click();
  await expect(page.getByTestId('preset-tile-kenBurns')).toBeVisible();
  await page.getByTestId('preset-cat-out').click();
  await expect(page.getByTestId('preset-tile-rise')).toContainText('Sink');
  await page.getByTestId('preset-cat-mine').click();
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.getByTestId('preset-empty')).toBeVisible();
  await page.getByTestId('preset-cat-in').click();
  await page.getByTestId('preset-fav-fade').click();
  await expect(page.getByTestId('preset-fav-fade')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('preset-cat-favourites').click();
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByTestId('preset-tile-fade')).toHaveAttribute('data-slot', 'in');
  // Favourites are UI state: no project change.
  expect(await depth(page)).toBe(d0);
  expect(errors).toEqual([]);
});

test('search narrows the tiles (case-insensitive, synonyms) and says when nothing matches', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-search').fill('SPIN');
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByTestId('preset-tile-spin')).toBeVisible();
  await page.getByTestId('preset-search').fill('gravity');
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByTestId('preset-tile-drop')).toBeVisible();
  await page.getByTestId('preset-search').fill('zzz');
  await expect(tiles(page)).toHaveCount(0);
  await expect(page.getByTestId('preset-empty')).toHaveText('No preset matches.');
  expect(errors).toEqual([]);
});

test('keyboard: one tab stop, arrows move, Enter applies in one step, Escape closes; shortcuts stay inside', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  const d0 = await depth(page);
  await page.getByTestId('anim-choose-in').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('preset-search')).toBeFocused();
  // Global shortcuts never see keys pressed in the browser (Delete would delete the selected clip, Space would play).
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('preset-tile-fade')).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.press('s');
  expect(await depth(page)).toBe(d0);
  expect(await page.evaluate(() => window.__clipforge!.getState().playing)).toBe(false);
  await expect(page.locator('[data-testid^="preset-tile-"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('preset-tile-slide')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('preset-tile-spin')).toBeFocused();
  await expect(page.locator('[data-testid^="preset-tile-"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-testid^="preset-tile-"]:focus')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('preset-tile-spin')).toBeFocused();
  // Escape closes without a change and gives focus back to the opener.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preset-browser')).toHaveCount(0);
  await expect(page.getByTestId('anim-choose-in')).toBeFocused();
  expect(await depth(page)).toBe(d0);
  expect((await clipJson(page, 'st')).motion).toBeUndefined();
  // Enter on a tile applies it (ONE step), closes, focus back.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('preset-browser')).toHaveCount(0);
  await expect(page.getByTestId('anim-choose-in')).toBeFocused();
  expect(await depth(page)).toBe(d0 + 1);
  expect((await clipJson(page, 'st')).motion?.in?.preset).toBe('slide');
  await expect(page.getByTestId('anim-in-name')).toHaveText('Slide');
  expect(errors).toEqual([]);
});

test('only the hovered tile animates; unhovered tiles are still', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await openBrowser(page, 'in');
  // Move the pointer away from every tile; the search field keeps focus (no tile focused).
  await page.mouse.move(2, 2);
  const still1 = await tilePixels(page, 'fade');
  await page.waitForTimeout(250);
  expect(await tilePixels(page, 'fade')).toBe(still1);
  await page.getByTestId('preset-tile-slide').hover();
  await expect(page.getByTestId('preset-tile-slide')).toHaveAttribute('data-animating', 'true');
  const a = await tilePixels(page, 'slide');
  await expect.poll(() => tilePixels(page, 'slide'), { timeout: 3000 }).not.toBe(a);
  // While Slide animates, Fade stays on its still frame.
  expect(await tilePixels(page, 'fade')).toBe(still1);
  await expect(page.locator('[data-animating="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('prefers-reduced-motion keeps every tile still, hovered included', async ({ page }) => {
  const errors = trackErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setupOverlay(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-tile-slide').hover();
  const a = await tilePixels(page, 'slide');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(150);
    expect(await tilePixels(page, 'slide')).toBe(a);
  }
  // The still is a real frame (not blank): differs from an empty canvas.
  const blank = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 68; return c.toDataURL(); });
  expect(a).not.toBe(blank);
  expect(errors).toEqual([]);
});
