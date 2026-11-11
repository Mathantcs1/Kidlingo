// Waveforms: drawn from cached peaks (loud half vs silent half), cache deleted with the media, reused after reload.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipStates, importFiles, open, trackErrors } from './helpers';

test.setTimeout(90_000);

/** 2 s of a loud 440 Hz tone followed by 2 s of digital silence. */
function halves(): string {
  const dir = test.info().outputPath('wf');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'halves.wav');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=2',
    '-filter_complex', '[0:a]volume=6dB[a];[a][1:a]concat=n=2:v=0:a=1', '-c:a', 'pcm_s16le', out,
  ], { stdio: 'pipe' });
  return out;
}

const KEY = (id: string): string => `clipforge:peaks:${id}`;

const hasKey = (page: Page, id: string): Promise<boolean> =>
  page.evaluate(
    (key) =>
      new Promise<boolean>((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('keyval').objectStore('keyval').get(key);
          req.onsuccess = () => {
            db.close();
            resolve(req.result !== undefined);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    KEY(id),
  );

/** Per-column inked height (device px) of the clip's waveform canvas, split at the horizontal middle. */
async function columnHeights(page: Page): Promise<{ left: number[]; right: number[] }> {
  return page.getByTestId('clip-waveform').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const heights: number[] = [];
    for (let x = 0; x < c.width; x++) {
      let n = 0;
      for (let y = 0; y < c.height; y++) if (data[(y * c.width + x) * 4 + 3] > 0) n++;
      heights.push(n);
    }
    const mid = Math.floor(heights.length / 2);
    return { left: heights.slice(0, mid - 2), right: heights.slice(mid + 2) };
  });
}

async function drawn(page: Page): Promise<void> {
  await expect(async () => {
    const { left } = await columnHeights(page);
    expect(Math.max(...left)).toBeGreaterThan(0);
  }).toPass();
}

test('loud half draws a waveform, silent half a flat line; cache is stored, reused, and deleted with the media', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const pageErrors = trackErrors(page);
  await open(page);
  await importFiles(page, [halves()], 1);
  await addToTimeline(page, 'halves.wav', 1);
  const [clip] = await clipStates(page);
  await drawn(page);

  const { left, right } = await columnHeights(page);
  expect(Math.max(...left)).toBeGreaterThan(6);
  expect(Math.max(...right)).toBeLessThanOrEqual(3);
  expect(Math.min(...right)).toBeGreaterThan(0); // a flat centre line, not nothing
  expect(await page.evaluate(() => window.__clipforge!.peaksDecodeCount())).toBe(1);
  await expect.poll(() => hasKey(page, clip.mediaId)).toBe(true);

  // The waveform never intercepts clicks: the clip is still selectable through it.
  await page.getByTestId('timeline-clip').click({ position: { x: 20, y: 10 } });
  await expect(page.getByTestId('timeline-clip')).toHaveAttribute('data-selected', 'true');

  // Reload: the project and the cache survive; the waveform comes back without decoding again.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await drawn(page);
  expect(await page.evaluate(() => window.__clipforge!.peaksDecodeCount())).toBe(0);
  expect(await hasKey(page, clip.mediaId)).toBe(true);

  // Removing the stored media removes its peaks.
  await page.evaluate((id) => window.__clipforge!.removeMedia(id), clip.mediaId);
  expect(await hasKey(page, clip.mediaId)).toBe(false);
  expect(pageErrors).toEqual([]);
  expect(errors).toEqual([]);
});
