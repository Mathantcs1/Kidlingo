// The Help menu and the in-app guide: menu items, the searchable slide-over, Esc, focus restore, a modal that turns the
// editor shortcuts off, and the licences link now living in the menu.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, importFiles, open, withAudio } from './helpers';

test.setTimeout(60_000);

const clipCount = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).length);

test('the Help menu lists the guides and the licences link; Esc closes it', async ({ page }) => {
  await open(page);
  await page.getByTestId('btn-help').click();
  await expect(page.getByTestId('context-menu')).toHaveAttribute('aria-label', 'Help');
  for (const id of ['ctx-help-start', 'ctx-help-controls', 'ctx-help-shortcuts', 'ctx-help-tips', 'ctx-help-about']) await expect(page.getByTestId(id)).toBeVisible();
  const licences = page.getByTestId('link-licenses');
  await expect(licences).toHaveAttribute('href', /licenses\/THIRD-PARTY\.txt$/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('context-menu')).toHaveCount(0);
  await expect(page.getByTestId('btn-help')).toBeFocused();
});

test('menu items open the panel at the right topic; search filters; Esc closes and focus returns', async ({ page }) => {
  await open(page);
  const help = page.getByTestId('btn-help');
  await help.click();
  await page.getByTestId('ctx-help-shortcuts').click();
  const panel = page.getByTestId('help-panel');
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('help-content')).toHaveAttribute('data-topic', 'shortcuts');
  await expect(page.getByTestId('help-shortcuts').locator('tr[data-shortcut]')).toHaveCount(15);
  await expect(page.getByTestId('help-search')).toBeFocused();

  const all = await page.locator('[data-testid^="help-topic-"]').count();
  await page.getByTestId('help-search').fill('ripple');
  const filtered = await page.locator('[data-testid^="help-topic-"]').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(all);
  await page.getByTestId('help-search').fill('zzzqqq');
  await expect(page.locator('[data-testid^="help-topic-"]')).toHaveCount(0);
  await page.getByTestId('help-search').fill('');
  await page.getByTestId('help-topic-controls-audio').click();
  await expect(page.getByTestId('help-content')).toContainText('Normalise');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(help).toBeFocused();
});

test('editor shortcuts are off while the panel is open (Delete keeps the clip), and work again after', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.getByTestId('timeline-clip').first().click();
  await page.getByTestId('btn-help').click();
  await page.getByTestId('ctx-help-start').click();
  await expect(page.getByTestId('help-content')).toContainText('Import');
  await page.keyboard.press('Delete');
  await page.getByTestId('help-search').blur();
  await page.keyboard.press('Delete');
  expect(await clipCount(page)).toBe(1);
  // Tab stays inside the dialog.
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="help-panel"]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByTestId('timeline-clip').first().click();
  await page.keyboard.press('Delete');
  expect(await clipCount(page)).toBe(0);
});
