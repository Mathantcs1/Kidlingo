import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PPS,
  addToTimeline,
  center,
  clipEl,
  clipStates,
  drag,
  importFiles,
  mediaItem,
  noAudio,
  open,
  playerState,
  trackErrors,
  withAudio,
} from './helpers';

test.setTimeout(180_000);

interface Probe {
  format: { format_name: string; duration: string };
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
}

function ffprobe(path: string): Probe {
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path];
  const out = execFileSync('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.toString()) as Probe;
}

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
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    return names;
  });
}

/** Records the export progress bar's value every few ms into window.__progress. */
function sampleProgress(page: Page): Promise<void> {
  return page.evaluate(() => {
    const w = window as unknown as { __progress: number[] };
    w.__progress = [];
    setInterval(() => {
      const el = document.querySelector<HTMLProgressElement>('[data-testid="export-progress"]');
      if (el) w.__progress.push(el.value);
    }, 10);
  });
}

function progressSamples(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __progress: number[] }).__progress);
}

async function progressValue(page: Page): Promise<number> {
  return page.getByTestId('export-progress').evaluate((el) => (el as HTMLProgressElement).value);
}

/** Drags a clip's end handle so it lasts `seconds`. */
async function trimTo(page: Page, id: string, seconds: number): Promise<void> {
  const [c] = (await clipStates(page)).filter((x) => x.id === id);
  await drag(page, await center(clipEl(page, id).getByTestId('trim-end')), -(c.out - c.in - seconds) * PPS);
  const [after] = (await clipStates(page)).filter((x) => x.id === id);
  expect(Math.abs(after.out - after.in - seconds)).toBeLessThanOrEqual(0.05);
}

test('export is disabled for an empty timeline', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('btn-export')).toBeDisabled();
  await expect(page.getByTestId('btn-merge-all')).toBeDisabled();
});

test('exports a trimmed clip to a downloadable 1080p H.264/AAC MP4', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [clip] = await clipStates(page);
  await trimTo(page, clip.id, 0.6);

  await page.getByTestId('btn-export').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('export-quality')).toHaveValue('1080p');
  await expect(dialog.getByRole('textbox')).toHaveValue('clipforge-export');
  await sampleProgress(page);
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 150_000 });
  expect(await progressValue(page)).toBe(1);
  await expect(dialog).toContainText('100%');

  const samples = await progressSamples(page);
  const distinct = [...new Set(samples)];
  expect(distinct.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  expect(samples[samples.length - 1]).toBe(1);

  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe('clipforge-export.mp4');
  const info = ffprobe(await download.path());
  expect(info.format.format_name).toContain('mp4');
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  expect(video?.codec_name).toBe('h264');
  expect(video?.width).toBe(1920);
  expect(video?.height).toBe(1080);
  expect(audio?.codec_name).toBe('aac');
  expect(Math.abs(Number(info.format.duration) - 0.6)).toBeLessThanOrEqual(0.25);

  // Once downloaded, Escape closes without asking; the temp file stays until the next export (or app start)
  // because the browser may still be reading it.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await exportTempEntries(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('cancelling an export leaves no file, and a later export succeeds', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.getByTestId('btn-export').click();
  const dialog = page.getByTestId('export-dialog');
  await page.getByTestId('export-quality').selectOption('1080p');
  await dialog.getByRole('textbox').fill('my/clip?');
  await page.getByTestId('btn-export-start').click();
  await expect.poll(() => progressValue(page), { timeout: 60_000 }).toBeGreaterThan(0);
  // Escape does not close the dialog mid-export.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.getByTestId('btn-export-cancel').click();
  await expect(dialog).toContainText('Export cancelled');
  await expect(page.getByTestId('export-download')).toHaveCount(0);
  await expect(page.getByTestId('export-error')).toHaveCount(0);
  await expect.poll(() => exportTempEntries(page)).toEqual([]);

  // Keep the second export short: close, trim, and export again.
  await page.getByTestId('btn-export-close').click();
  await expect(dialog).toHaveCount(0);
  const [clip] = await clipStates(page);
  await trimTo(page, clip.id, 0.4);
  await page.getByTestId('btn-export').click();
  await dialog.getByRole('textbox').fill('my/clip?');
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 150_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe('my-clip.mp4');
  const info = ffprobe(await download.path());
  expect(info.streams.find((s) => s.codec_type === 'video')?.codec_name).toBe('h264');
  expect(errors).toEqual([]);
});

test('merge all renders the timeline into one clip in one undo step; cancel leaves it untouched', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await expect(page.getByTestId('btn-merge-all')).toBeDisabled();
  await addToTimeline(page, 'no-audio.mp4', 2);
  const [a, b] = await clipStates(page);
  await trimTo(page, a.id, 0.5);
  await trimTo(page, b.id, 0.5);
  await clipEl(page, a.id).click();
  await clipEl(page, b.id).click({ modifiers: ['Shift'] });
  await page.getByTestId('btn-merge').click();
  const before = await clipStates(page);
  expect(before.map((c) => c.start)).toEqual([0, expect.closeTo(0.5, 2)]);
  const depth = (await playerState(page)).undoDepth;
  await expect(page.getByTestId('btn-merge-all')).toBeEnabled();

  // Cancel midway: nothing changes.
  await page.getByTestId('btn-merge-all').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toContainText('Merging');
  await expect.poll(() => progressValue(page), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.getByTestId('btn-export-cancel').click();
  await expect(dialog).toContainText('Merge cancelled');
  await page.getByTestId('btn-export-close').click();
  await expect(dialog).toHaveCount(0);
  expect(await clipStates(page)).toEqual(before);
  expect((await playerState(page)).undoDepth).toBe(depth);
  await expect(page.getByTestId('media-item')).toHaveCount(2);

  await page.getByTestId('btn-merge-all').click();
  await expect(dialog).toHaveCount(0, { timeout: 150_000 });
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  const [merged] = await clipStates(page);
  expect(merged.start).toBe(0);
  expect(merged.trackKind).toBe('video');
  expect(Math.abs(merged.out - merged.in - 1)).toBeLessThanOrEqual(0.25);
  await expect(page.getByTestId('media-item')).toHaveCount(3);
  await expect(mediaItem(page, 'merged.mp4')).toHaveAttribute('data-media-id', merged.mediaId);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  await expect.poll(() => exportTempEntries(page)).toEqual([]);

  await page.getByTestId('btn-undo').click();
  expect(await clipStates(page)).toEqual(before);
  await page.getByTestId('btn-redo').click();
  expect(await clipStates(page)).toEqual([merged]);
  expect(errors).toEqual([]);
});
