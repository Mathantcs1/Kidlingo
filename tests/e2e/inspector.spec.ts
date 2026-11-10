// Ripple delete and the clip inspector (volume, fit/fill/blur).
import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  addToTimeline, clipEl, clipStates, importFiles, noAudio, open, playerState, setPlayhead, tone, trackErrors, withAudio,
} from './helpers';

test.setTimeout(120_000);

interface ClipInfo {
  id: string;
  volume: number;
  fit: string;
  scale: number;
}

function clipInfo(page: Page): Promise<ClipInfo[]> {
  return page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks.flatMap((t) =>
      t.clips.map((c) => ({ id: c.id, volume: c.volume, fit: c.fit, scale: c.transform.scale })),
    ),
  );
}

/** Mean RGB brightness of the preview canvas rows [y0, y1) (fractions of its height). */
function bandBrightness(page: Page, y0: number, y1: number): Promise<number> {
  return page.evaluate(
    ({ y0, y1 }) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const o = document.createElement('canvas');
      o.width = c.width;
      o.height = c.height;
      const ctx = o.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      const top = Math.floor(c.height * y0);
      const d = ctx.getImageData(0, top, c.width, Math.max(1, Math.floor(c.height * y1) - top)).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / ((d.length / 4) * 3);
    },
    { y0, y1 },
  );
}

test('ripple delete closes the gaps of selected clips on one track in one undo step (button and Shift+Delete)', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, noAudio, tone], 3);
  await addToTimeline(page, 'with-audio.mp4', 1); // [0,3)
  await addToTimeline(page, 'no-audio.mp4', 2); // [3,5)
  await addToTimeline(page, 'with-audio.mp4', 3); // [5,8)
  await addToTimeline(page, 'tone.wav', 4); // audio [0,2)
  const [a, b, c, x] = await clipStates(page);
  const depth = (await playerState(page)).undoDepth;

  await clipEl(page, a.id).click();
  await clipEl(page, b.id).click({ modifiers: ['Shift'] });
  await page.getByTestId('btn-ripple-delete').click();
  let after = await clipStates(page);
  expect(after.map((s) => [s.id, s.start])).toEqual([[c.id, 0], [x.id, 0]]);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  await page.getByTestId('btn-undo').click();
  expect(await clipStates(page)).toEqual([a, b, c, x]);

  // Clips on different tracks: each track closes its own gap.
  await clipEl(page, b.id).click();
  await clipEl(page, x.id).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Shift+Delete');
  after = await clipStates(page);
  expect(after.map((s) => [s.id, s.start])).toEqual([[a.id, 0], [c.id, 3]]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await clipStates(page)).toEqual([a, b, c, x]);
  expect(errors).toEqual([]);
});

test('the inspector sets a clip volume in one undo step and shows a hint without one selected clip', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('inspector')).toContainText('Select a clip');
  await importFiles(page, [tone, noAudio], 2);
  await addToTimeline(page, 'tone.wav', 1);
  await addToTimeline(page, 'no-audio.mp4', 2);
  const [video, audio] = await clipStates(page);
  await clipEl(page, video.id).click();
  await expect(page.getByTestId('inspector')).toContainText('This clip has no sound.');
  await expect(page.getByTestId('inspector-volume')).toHaveCount(0);
  await clipEl(page, audio.id).click();
  await expect(page.getByTestId('inspector-fit')).toHaveCount(0);
  const slider = page.getByTestId('inspector-volume');
  await expect(slider).toHaveValue('100');
  const depth = (await playerState(page)).undoDepth;

  await slider.fill('50');
  await expect(page.getByTestId('inspector-volume-value')).toHaveText('50%');
  expect((await clipInfo(page)).find((c) => c.id === audio.id)?.volume).toBe(0.5);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  await page.getByTestId('btn-undo').click();
  await expect(slider).toHaveValue('100');
  expect((await clipInfo(page)).find((c) => c.id === audio.id)?.volume).toBe(1);

  await clipEl(page, video.id).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('inspector')).toContainText('Select a single clip');
});

test('a clip at 50 % volume exports at half the level (about −6 dB)', async ({ page }) => {
  await open(page);
  await importFiles(page, [tone], 1);
  await addToTimeline(page, 'tone.wav', 1);
  const [whole] = await clipStates(page);
  await clipEl(page, whole.id).click();
  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  const [, second] = await clipStates(page);
  await clipEl(page, second.id).click();
  await page.getByTestId('inspector-volume').fill('50');
  expect((await clipInfo(page)).map((c) => c.volume)).toEqual([1, 0.5]);

  await page.getByTestId('btn-export').click();
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 100_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const file = await download.path();
  const meanDb = (from: number): number => {
    const args = ['-hide_banner', '-ss', String(from), '-t', '0.6', '-i', file, '-af', 'volumedetect', '-vn', '-f', 'null', '-'];
    // volumedetect reports on stderr.
    const { stderr } = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    const m = /mean_volume: (-?[\d.]+) dB/.exec(stderr);
    if (!m) throw new Error(`no volumedetect output: ${stderr}`);
    return Number(m[1]);
  };
  const full = meanDb(0.2);
  const half = meanDb(1.2);
  expect(full - half).toBeGreaterThan(5);
  expect(full - half).toBeLessThan(7);
});

test('Fit, Fill and Blur change how a 16:9 clip covers a vertical frame (one undo step each)', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await page.getByTestId('format-select').selectOption('vertical');
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [clip] = await clipStates(page);
  await clipEl(page, clip.id).click();
  const fit = page.getByTestId('inspector-fit');
  await expect(fit.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
  // Fit: the 16:9 picture sits in the middle with black above and below.
  await expect.poll(() => bandBrightness(page, 0.45, 0.55)).toBeGreaterThan(20);
  expect(await bandBrightness(page, 0.02, 0.15)).toBeLessThan(2);

  const depth = (await playerState(page)).undoDepth;
  await fit.getByRole('button', { name: 'Fill' }).click();
  await expect(fit.getByRole('button', { name: 'Fill' })).toHaveAttribute('aria-pressed', 'true');
  const [filled] = await clipInfo(page);
  expect(filled.fit).toBe('fill');
  expect(filled.scale).toBeCloseTo(1920 / 360, 4);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  // Fill: no black bars at the top or bottom any more.
  await expect.poll(() => bandBrightness(page, 0.02, 0.15)).toBeGreaterThan(20);
  expect(await bandBrightness(page, 0.85, 0.98)).toBeGreaterThan(20);

  await fit.getByRole('button', { name: 'Blur' }).click();
  const [blurred] = await clipInfo(page);
  expect(blurred.fit).toBe('blur');
  expect(blurred.scale).toBeCloseTo(1080 / 640, 4);
  // Blur: the letterbox areas show the blurred copy instead of black.
  await expect.poll(() => bandBrightness(page, 0.02, 0.15)).toBeGreaterThan(10);

  // Reframing keeps the clip's fit mode.
  await fit.getByRole('button', { name: 'Fill' }).click();
  await page.getByTestId('format-select').selectOption('square');
  const [square] = await clipInfo(page);
  expect(square.fit).toBe('fill');
  expect(square.scale).toBeCloseTo(1080 / 360, 4);

  await page.getByTestId('btn-undo').click(); // format
  await page.getByTestId('btn-undo').click(); // fill
  await page.getByTestId('btn-undo').click(); // blur
  await page.getByTestId('btn-undo').click(); // fill
  const [restored] = await clipInfo(page);
  expect(restored.fit).toBe('fit');
  expect(restored.scale).toBeCloseTo(1080 / 640, 4);
  expect(errors).toEqual([]);
});
