// Production-bundle check: runs against `vite build` + `vite preview` (see playwright.preview.config.ts), not the dev
// server. Proves the minified bundle, including the lazily loaded WASM AAC encoder chunk, works end to end.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { addToTimeline, center, drag, importFiles, mediaItem, open, PPS, withAudio } from './helpers';

test.setTimeout(240_000);

interface Probe {
  format: { format_name: string; duration: string };
  streams: { codec_type: string; codec_name: string }[];
}

function ffprobe(path: string): Probe {
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path];
  return JSON.parse(execFileSync('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()) as Probe;
}

test('production build loads, falls back to the app shell, and exports a 1 s MP4', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${m.location().url}`);
  });

  // Unknown paths serve the app shell (vite preview has an SPA fallback; on Vercel this is the rewrite in vercel.json).
  await page.goto('/does-not-exist');
  await expect(page.getByText('ClipForge').first()).toBeVisible();

  await open(page);
  await expect(page.getByText('ClipForge').first()).toBeVisible();
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveCount(0);
  // The dev-only test hook must not ship in the production bundle.
  expect(await page.evaluate(() => '__clipforge' in window)).toBe(false);

  await importFiles(page, [withAudio], 1);
  await expect(mediaItem(page, 'with-audio.mp4')).toHaveAttribute('data-has-audio', 'true');
  await addToTimeline(page, 'with-audio.mp4', 1);

  // Trim the clip to about 1 s by dragging its end handle left.
  const clip = page.getByTestId('timeline-clip');
  const width = (await clip.boundingBox())!.width;
  await drag(page, await center(clip.getByTestId('trim-end')), -(width - PPS));
  const trimmed = (await clip.boundingBox())!.width / PPS;
  expect(trimmed).toBeGreaterThan(0.7);
  expect(trimmed).toBeLessThan(1.3);

  await page.getByTestId('btn-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-quality').selectOption('1080p');
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 200_000 });
  await expect(page.getByTestId('export-error')).toHaveCount(0);

  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const info = ffprobe(await download.path());
  expect(info.format.format_name).toContain('mp4');
  expect(info.streams.find((s) => s.codec_type === 'video')?.codec_name).toBe('h264');
  expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
  expect(Math.abs(Number(info.format.duration) - 1)).toBeLessThanOrEqual(0.3);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
