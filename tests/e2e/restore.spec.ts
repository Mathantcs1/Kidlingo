// A restore that fails must never cost the user their media or their saved project (startup GC and autosave stay
// off until the project is restored or the user explicitly starts over).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, importFiles, open, toast, withAudio } from './helpers';

const storedIds = (page: Page): Promise<string[]> => page.evaluate(() => window.__clipforge!.listMediaIds());

/** The raw saved project, read straight from idb-keyval's store. */
function savedProject(page: Page): Promise<{ version: number; media: Record<string, unknown> } | undefined> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const get = req.result.transaction('keyval').objectStore('keyval').get('clipforge:current');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Overwrites the saved project in idb-keyval's store. */
function writeSaved(page: Page, value: unknown): Promise<void> {
  return page.evaluate(
    (v) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(v, 'clipforge:current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    value,
  );
}

async function savedClip(page: Page): Promise<string[]> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const ids = await storedIds(page);
  expect(ids).toHaveLength(1);
  return ids;
}

test('a failed restore (IndexedDB read error) keeps every media file; the next healthy load restores intact', async ({ page }) => {
  const ids = await savedClip(page);
  // One failing IndexedDB read on the next load only.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('cf-failed-once')) return;
    sessionStorage.setItem('cf-failed-once', '1');
    IDBObjectStore.prototype.get = function () {
      throw new DOMException('Internal error opening backing store', 'UnknownError');
    } as typeof IDBObjectStore.prototype.get;
  });
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toContainText('Could not load your saved project');
  await page.waitForTimeout(1500);
  expect(await storedIds(page)).toEqual(ids);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('timeline-clip')).not.toHaveAttribute('data-missing', 'true');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  expect(await storedIds(page)).toEqual(ids);
});

test('Retry loading restores the project after a transient failure', async ({ page }) => {
  await savedClip(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('cf-failed-once')) return;
    sessionStorage.setItem('cf-failed-once', '1');
    const get = IDBObjectStore.prototype.get;
    let failures = 1;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['get']>) {
      if (failures-- > 0) throw new DOMException('Internal error', 'UnknownError');
      return get.apply(this, args);
    };
  });
  await page.reload();
  await expect(page.getByTestId('restore-failed')).toBeVisible();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  await page.getByTestId('btn-restore-retry').click();
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
});

test('a project saved by a newer version is never overwritten or garbage-collected; Start new replaces it on request', async ({ page }) => {
  const ids = await savedClip(page);
  const saved = await savedProject(page);
  await writeSaved(page, { ...saved, version: 2 });
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toContainText('newer version');
  // Editing does not autosave over the newer project, and its media survives.
  await importFiles(page, [withAudio], 1);
  await page.waitForTimeout(1200);
  expect((await savedProject(page))?.version).toBe(2);
  expect((await storedIds(page)).length).toBeGreaterThanOrEqual(ids.length);
  for (const id of ids) expect(await storedIds(page)).toContain(id);
  await expect(toast(page)).toHaveCount(0);

  await page.getByTestId('btn-restore-new').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('replaces the saved project');
  await page.getByTestId('btn-confirm-ok').click();
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect.poll(async () => (await savedProject(page))?.version).toBe(1);
  await expect.poll(() => storedIds(page)).toEqual([]);
});

test('storage failing during reconcile (hasMedia throws) leaves the media untouched', async ({ page }) => {
  const ids = await savedClip(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('cf-failed-once')) return;
    sessionStorage.setItem('cf-failed-once', '1');
    const real = FileSystemDirectoryHandle.prototype.getFileHandle;
    FileSystemDirectoryHandle.prototype.getFileHandle = function (this: FileSystemDirectoryHandle, name: string, opts?: FileSystemGetFileOptions) {
      if (this.name === 'clipforge-media' && !opts?.create) return Promise.reject(new DOMException('busy', 'InvalidStateError'));
      return real.call(this, name, opts);
    };
  });
  await page.reload();
  await expect(page.getByTestId('restore-failed')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await storedIds(page)).toEqual(ids);
});
