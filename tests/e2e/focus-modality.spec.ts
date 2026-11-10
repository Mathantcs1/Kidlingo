// Space after focus is restored: a flow started with the mouse keeps Space = play/pause even when it ends with a
// key (Enter/Escape) that puts focus back; a flow started with the keyboard keeps Space = press the focused control.
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { addToTimeline, importFiles, open, playerState, withAudio } from './helpers';

test.setTimeout(60_000);

const header = (page: Page, id: string): Locator => page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);
const activeTestId = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const videoIds = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks.filter((t) => t.kind === 'video').map((t) => t.id),
  );

async function withClip(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
}

async function expectSpacePlays(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(false);
}

test('rename started with the mouse: after Enter or Escape, Space plays instead of reopening the editor', async ({ page }) => {
  await withClip(page);
  const [v] = await videoIds(page);
  const h = header(page, v);
  for (const key of ['Enter', 'Escape']) {
    await h.getByTestId('track-name').dblclick();
    await h.getByTestId('track-name-input').fill(`Name ${key}`);
    await page.keyboard.press(key);
    expect(await activeTestId(page)).toBe('track-name');
    await expectSpacePlays(page);
    await expect(h.getByTestId('track-name-input')).toHaveCount(0);
  }
});

test('rename started with the keyboard: after Enter, Space on the focused name edits again', async ({ page }) => {
  await withClip(page);
  const [v] = await videoIds(page);
  const h = header(page, v);
  await page.getByTestId('btn-zoom-in').focus();
  await page.keyboard.press('Tab');
  await expect(h.getByTestId('track-name')).toBeFocused();
  await page.keyboard.press('F2');
  await h.getByTestId('track-name-input').fill('Keys');
  await page.keyboard.press('Enter');
  await expect(h.getByTestId('track-name')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(h.getByTestId('track-name-input')).toBeFocused();
  expect((await playerState(page)).playing).toBe(false);
  await page.keyboard.press('Escape');
});

test('holding Enter on the name opens the editor once; repeats neither commit nor close it', async ({ page }) => {
  await withClip(page);
  const [v] = await videoIds(page);
  const h = header(page, v);
  const depth = (await playerState(page)).undoDepth;
  await page.getByTestId('btn-zoom-in').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter'); // auto-repeat
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(h.getByTestId('track-name-input')).toBeFocused();
  await page.keyboard.down('Escape');
  await page.keyboard.down('Escape');
  await page.keyboard.up('Escape');
  await expect(h.getByTestId('track-name-input')).toHaveCount(0);
  expect((await playerState(page)).undoDepth).toBe(depth);
});

test('remove confirm opened with the mouse: after Escape, Space plays; opened with the keyboard, Space reopens it', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await page.getByTestId('btn-add-video-layer').click();
  await addToTimeline(page, 'with-audio.mp4', 1); // on the new, active layer
  const [, v2] = await videoIds(page);
  const remove = header(page, v2).getByTestId('track-btn-remove');
  const dialog = page.getByTestId('confirm-dialog');

  await remove.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expectSpacePlays(page);
  await expect(dialog).toHaveCount(0);

  await header(page, v2).getByTestId('track-btn-down').focus();
  await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  expect((await playerState(page)).playing).toBe(false);
  await page.keyboard.press('Escape');
});

test('Export dialog opened with the mouse: after Escape, Space plays', async ({ page }) => {
  await withClip(page);
  await page.getByTestId('btn-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
  await expect(page.getByTestId('btn-export')).toBeFocused();
  await expectSpacePlays(page);
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
});

test('Tab to Play: Space toggles playback exactly once per press', async ({ page }) => {
  await withClip(page);
  // Count every play/pause request. The store's state object is copied on each update, so a wrapped action stays.
  await page.evaluate(() => {
    const w = window as unknown as { toggles: number };
    w.toggles = 0;
    const s = window.__clipforge!.getState();
    const original = s.setPlaying;
    s.setPlaying = (b: boolean) => {
      if (b !== window.__clipforge!.getState().playing) w.toggles++;
      original(b);
    };
  });
  await page.getByTestId('btn-split').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('btn-play')).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(false);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { toggles: number }).toggles)).toBe(2);
});
