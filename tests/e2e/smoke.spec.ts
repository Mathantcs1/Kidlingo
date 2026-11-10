// End-to-end smoke test: the whole user journey through the real UI, verified with ffprobe.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { addToTimeline, clipStates, importFiles, mediaItem, open, setPlayhead, withAudio } from './helpers';

test.setTimeout(240_000);

/** console.error messages that are expected during the journey. Empty: any console error fails the test. */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

interface Probe {
  format: { format_name: string; duration: string };
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
}

function ffprobe(path: string): Probe {
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path];
  return JSON.parse(execFileSync('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()) as Probe;
}

test('import, edit, reframe and export a 1080p square MP4', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' || ALLOWED_CONSOLE_ERRORS.some((re) => re.test(m.text()))) return;
    consoleErrors.push(`${m.text()} @ ${m.location().url}`);
  });

  await open(page);
  await importFiles(page, [withAudio], 1);
  await expect(mediaItem(page, 'with-audio.mp4')).toHaveAttribute('data-has-audio', 'true');
  await addToTimeline(page, 'with-audio.mp4', 1);

  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  const split = await clipStates(page);
  expect(split.map((c) => [c.start, c.in])).toEqual([
    [0, 0],
    [expect.closeTo(1, 1), expect.closeTo(1, 1)],
  ]);

  await page.getByTestId('format-select').selectOption('square');
  await expect(page.getByTestId('format-select')).toHaveValue('square');
  const before = await clipStates(page);
  const mediaBefore = await page.getByTestId('media-item').evaluateAll((els) => els.map((e) => e.textContent));

  await page.getByTestId('btn-export').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('export-quality').selectOption('1080p');
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 200_000 });
  await expect(page.getByTestId('export-error')).toHaveCount(0);

  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const info = ffprobe(await download.path());
  expect(info.format.format_name).toContain('mp4');
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  expect(video?.codec_name).toBe('h264');
  expect(video?.width).toBe(1080);
  expect(video?.height).toBe(1080);
  expect(audio?.codec_name).toBe('aac');
  expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThanOrEqual(0.25);

  // Exporting must not change the project: same media, same clips, same format.
  await page.getByTestId('btn-export-close').click();
  await expect(dialog).toHaveCount(0);
  expect(await page.getByTestId('media-item').evaluateAll((els) => els.map((e) => e.textContent))).toEqual(
    mediaBefore,
  );
  await expect(mediaItem(page, 'with-audio.mp4')).toHaveCount(1);
  expect(await clipStates(page)).toEqual(before);
  await expect(page.getByTestId('format-select')).toHaveValue('square');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
