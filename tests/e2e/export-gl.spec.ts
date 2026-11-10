import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, importFiles, open, setPlayhead, trackErrors, withAudio } from './helpers';
import { plainReason } from '../../src/render/glErrors';
import { stubGl } from './gl-stub';

test.setTimeout(90_000);

function exportTempEntries(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await root.getDirectoryHandle('clipforge-export');
    } catch {
      return [];
    }
    const names: string[] = [];
    for await (const n of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(n);
    return names;
  });
}

test('without WebGL2, export and merge-all fail inline with the reason and leave no temp files', async ({ page }) => {
  const errors = trackErrors(page);
  await stubGl(page, { noWebGl2: true });
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const reason = `The video renderer could not start: ${plainReason('context-null')}.`;

  await page.getByTestId('btn-export').click();
  await page.getByTestId('btn-export-start').click();
  const error = page.getByTestId('export-error');
  await expect(error).toContainText(`Export failed: ${reason}`);
  await expect(error).toContainText('chrome://gpu');
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  expect(await exportTempEntries(page)).toEqual([]);
  await page.getByTestId('btn-export-close').click();
  await expect(page.getByTestId('export-dialog')).toBeHidden();

  // Merge all needs more than one clip.
  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  await page.getByTestId('btn-merge-all').click();
  await expect(error).toContainText(`Merge failed: ${reason}`);
  expect(await exportTempEntries(page)).toEqual([]);
  // Nothing was replaced: still the two clips.
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  expect(errors).toEqual([]);
});
