// Storage lifecycle: removing media, New project, media GC, autosave failures, and one editor tab per browser.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipStates, importFiles, mediaItem, noAudio, open, toast, trackErrors, withAudio } from './helpers';

const storedIds = (page: Page): Promise<string[]> => page.evaluate(() => window.__clipforge!.listMediaIds());
const projectMediaIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => Object.keys(window.__clipforge!.getState().history.present.media).sort());
const undoDepth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);

test('removing unused media takes it out of the bin; the file stays until GC, so undo brings it back', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  const id = await mediaItem(page, 'no-audio.mp4').getAttribute('data-media-id');
  await mediaItem(page, 'no-audio.mp4').getByTestId('btn-remove-media').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  expect(await storedIds(page)).toContain(id);
  await page.getByTestId('btn-undo').click();
  await expect(mediaItem(page, 'no-audio.mp4')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('removing media used by clips asks first and removes the clips in one undo step', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'no-audio.mp4', 2);
  await addToTimeline(page, 'with-audio.mp4', 3);
  const depth = await undoDepth(page);
  const before = await clipStates(page);

  const remove = mediaItem(page, 'with-audio.mp4').getByTestId('btn-remove-media');
  await remove.click();
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toContainText('Remove with-audio.mp4?');
  await expect(dialog).toContainText('It is used by 2 clips on the timeline.');
  await expect(page.getByTestId('btn-confirm-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(await clipStates(page)).toEqual(before);

  await remove.click();
  await page.getByTestId('btn-confirm-ok').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.getByTestId('btn-undo').click();
  expect(await clipStates(page)).toEqual(before);
  await expect(page.getByTestId('media-item')).toHaveCount(2);
});

test('startup GC deletes files of an undone import and keeps referenced ones', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await importFiles(page, [noAudio], 2);
  await page.getByTestId('btn-undo').click(); // un-imports no-audio.mp4: its file is now an orphan
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  expect(await storedIds(page)).toHaveLength(2);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  const referenced = await projectMediaIds(page);
  expect(referenced).toHaveLength(1);
  await expect.poll(() => storedIds(page)).toEqual(referenced);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('timeline-clip')).not.toHaveAttribute('data-missing', 'true');
});

test('New project asks, clears the project and history, and frees the stored files', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.getByTestId('format-select').selectOption('vertical');

  await page.getByTestId('btn-new-project').click();
  await page.getByTestId('btn-confirm-cancel').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);

  await page.getByTestId('btn-new-project').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Start a new project?');
  await page.getByTestId('btn-confirm-ok').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  await expect(page.getByTestId('media-item')).toHaveCount(0);
  await expect(page.getByTestId('format-select')).toHaveValue('youtube');
  await expect(page.getByTestId('btn-undo')).toBeDisabled();
  await expect.poll(() => storedIds(page)).toEqual([]);

  // The empty project is what a reload restores.
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('media-item')).toHaveCount(0);
  // An import right after New project is kept.
  await importFiles(page, [noAudio], 1);
  await expect.poll(() => storedIds(page)).toHaveLength(1);
});

test('New project still asks when only the undo history holds work', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('media-item')).toHaveCount(0);
  await page.getByTestId('btn-new-project').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Start a new project?');
  await page.getByTestId('btn-confirm-cancel').click();
  await expect(page.getByTestId('btn-redo')).toBeEnabled();
});

test('an empty project starts over without asking', async ({ page }) => {
  await open(page);
  await page.getByTestId('btn-new-project').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
});

test('a failing autosave is reported once with a persistent indicator, and its recovery too', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if ((window as unknown as { failSaves?: boolean }).failSaves) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await open(page);
  await importFiles(page, [withAudio], 1);
  await page.evaluate(() => ((window as unknown as { failSaves?: boolean }).failSaves = true));
  await addToTimeline(page, 'with-audio.mp4', 1);
  await expect(toast(page)).toHaveText(
    "Couldn't save your project automatically: Your browser's storage is full. Remove media you no longer need, then reload the page (or start a New project) to free the space. Export or keep this tab open.×",
  );
  await expect(page.getByTestId('save-status')).toHaveText('Not saved');
  await addToTimeline(page, 'with-audio.mp4', 2);
  await page.waitForTimeout(800);
  await expect(toast(page)).toHaveCount(1); // not repeated for every failed save

  await page.evaluate(() => ((window as unknown as { failSaves?: boolean }).failSaves = false));
  await addToTimeline(page, 'with-audio.mp4', 3);
  await expect(page.getByTestId('info-toast')).toContainText('Your project is being saved again.');
  await expect(page.getByTestId('save-status')).toHaveCount(0);
});

test('persistent storage is requested once, after the first successful import', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { persistCalls: number };
    w.persistCalls = 0;
    navigator.storage.persist = () => {
      w.persistCalls++;
      return Promise.resolve(false);
    };
  });
  await open(page);
  const calls = (): Promise<number> => page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls);
  expect(await calls()).toBe(0);
  await importFiles(page, [withAudio], 1);
  await importFiles(page, [noAudio], 2);
  expect(await calls()).toBe(1);
});

test('a second tab is locked: inert, never overwrites the first, and takes over once the first is closed', async ({ page, context }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.evaluate(() => window.__clipforge!.flushAutosave());

  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByTestId('app')).toHaveAttribute('data-session', 'locked');
  await expect(second.getByTestId('session-locked')).toHaveText(
    'ClipForge is already open in another tab. Use that tab, or close it and this one takes over.',
  );
  await expect(second.getByTestId('file-input')).toBeDisabled();
  await expect(second.getByTestId('btn-new-project')).toBeDisabled();
  await expect(second.getByTestId('btn-split')).toBeDisabled();
  // The locked tab restored nothing (it never read or wrote the saved project).
  await expect(second.getByTestId('timeline-clip')).toHaveCount(0);

  // Edits in the first tab are saved; reloading the second keeps it locked and the first's project intact.
  await addToTimeline(page, 'with-audio.mp4', 2);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await second.reload();
  await expect(second.getByTestId('app')).toHaveAttribute('data-session', 'locked');
  expect(await page.evaluate(() => window.__clipforge!.listMediaIds())).toHaveLength(1);

  // Closing the first tab hands the editor to the second without a manual reload.
  await page.close();
  await expect(second.getByTestId('app')).toHaveAttribute('data-session', 'ready', { timeout: 15_000 });
  await expect(second.getByTestId('timeline-clip')).toHaveCount(2);
  await expect(second.getByTestId('session-locked')).toHaveCount(0);
});
