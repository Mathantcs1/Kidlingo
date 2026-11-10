import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PPS, addToTimeline, center, clipEl, clipStates, drag, importFiles, open, trackErrors, withAudio } from './helpers';

test.setTimeout(180_000);

function exportTempEntries(page: Page): Promise<string[]> {
  return page.evaluate(() => window.cf_listExportTemp());
}

/** Dispatches a cancelable beforeunload event and reports whether the page asked to stay. */
function unloadBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
}

function activeTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? null);
}

function focusInDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => !!document.querySelector('[data-testid="export-dialog"]')?.contains(document.activeElement));
}

async function setup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { cf_listExportTemp(): Promise<string[]> }).cf_listExportTemp = async () => {
      const root = await navigator.storage.getDirectory();
      let dir: FileSystemDirectoryHandle;
      try {
        dir = await root.getDirectoryHandle('clipforge-export');
      } catch {
        return [];
      }
      const names: string[] = [];
      for await (const n of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(n);
      return names.sort();
    };
  });
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [c] = await clipStates(page);
  // Keep exports tiny on the software renderer: trim the clip to 0.4 s.
  await drag(page, await center(clipEl(page, c.id).getByTestId('trim-end')), -(c.out - c.in - 0.4) * PPS);
}

async function exportOnce(page: Page): Promise<void> {
  await page.getByTestId('btn-export-start').click();
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 150_000 });
}

declare global {
  interface Window {
    cf_listExportTemp(): Promise<string[]>;
  }
}

test('a finished export is not thrown away by accident; focus is trapped and restored', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const dialog = page.getByTestId('export-dialog');
  const confirm = page.getByTestId('export-discard-confirm');
  expect(await unloadBlocked(page)).toBe(false);

  await page.getByTestId('btn-export').focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  expect(await focusInDialog(page)).toBe(true);
  // Tab and Shift+Tab cycle inside the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInDialog(page)).toBe(true);
  }
  await page.getByTestId('export-quality').focus();
  await page.keyboard.press('Shift+Tab');
  expect(await activeTestId(page)).toBe('btn-export-start');

  // While running, leaving the page asks first.
  await page.getByTestId('btn-export-start').click();
  await expect(page.getByTestId('btn-export-cancel')).toBeVisible();
  expect(await unloadBlocked(page)).toBe(true);
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 150_000 });
  expect(await unloadBlocked(page)).toBe(true);

  // Escape, Close and Export again all ask before discarding; Escape / "Keep it" keep the result.
  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  expect(await activeTestId(page)).toBe('btn-discard-keep');
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId('export-download')).toBeVisible();
  await page.getByTestId('btn-export-close').click();
  await expect(confirm).toBeVisible();
  await page.getByTestId('btn-discard-keep').click();
  await page.getByTestId('btn-export-start').click();
  await expect(confirm).toBeVisible();
  await page.getByTestId('btn-discard-keep').click();
  await expect(page.getByTestId('export-download')).toBeVisible();
  expect(await exportTempEntries(page)).toHaveLength(1);

  // Discarding closes, returns focus to the Export button and lifts the unload guard.
  await page.getByTestId('btn-export-close').click();
  await page.getByTestId('btn-discard-confirm').click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => activeTestId(page)).toBe('btn-export');
  expect(await unloadBlocked(page)).toBe(false);
  // Closing never deletes the file: the next export (or app start) does.
  expect(await exportTempEntries(page)).toHaveLength(1);

  // "Export again" with Discard starts the next export at once.
  await page.getByTestId('btn-export').click();
  await exportOnce(page);
  await page.getByTestId('btn-export-start').click();
  await page.getByTestId('btn-discard-confirm').click();
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 150_000 });
  expect(errors).toEqual([]);
});

test('a download keeps working after Close and a second export', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await page.getByTestId('btn-export').click();
  await exportOnce(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  expect(await unloadBlocked(page)).toBe(false);
  // Downloaded: Escape closes without asking.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
  await expect.poll(() => activeTestId(page)).toBe('btn-export');
  const first = await exportTempEntries(page);
  expect(first).toHaveLength(1);

  // A second export starts while the first download may still be reading its file: that file is spared.
  await page.getByTestId('btn-export').click();
  await exportOnce(page);
  const both = await exportTempEntries(page);
  expect(both).toHaveLength(2);
  expect(both).toContain(first[0]);

  const info = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', await download.path()]).toString(),
  ) as { format: { duration: string }; streams: { codec_type: string; codec_name: string }[] };
  expect(info.streams.map((s) => `${s.codec_type}:${s.codec_name}`).sort()).toEqual(['audio:aac', 'video:h264']);
  expect(Math.abs(Number(info.format.duration) - 0.4)).toBeLessThanOrEqual(0.25);

  // One more export: the first file (downloaded two exports ago) is finally removed.
  await page.getByTestId('btn-export-start').click();
  await page.getByTestId('btn-discard-confirm').click();
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 150_000 });
  const after = await exportTempEntries(page);
  expect(after).toHaveLength(1);
  expect(after).not.toContain(first[0]);
  expect(errors).toEqual([]);
});
