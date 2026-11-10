import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  addToTimeline,
  importFiles,
  open,
  playerState,
  setPlayhead,
  toast,
  trackErrors,
  withAudio,
} from './helpers';

test.setTimeout(60_000);

interface PreviewStats {
  mean: number;
  hash: number;
  width: number;
  height: number;
  cssAspect: number;
}

/** Downsamples the WebGL preview canvas into a 2D canvas and summarises its pixels. */
function previewStats(page: Page): Promise<PreviewStats> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = 64;
    o.height = 36;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0, o.width, o.height);
    const d = ctx.getImageData(0, 0, o.width, o.height).data;
    let sum = 0;
    let hash = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] + d[i + 1] + d[i + 2];
      hash = (Math.imul(hash, 31) + d[i] * 7 + d[i + 1] * 3 + d[i + 2]) | 0;
    }
    const r = c.getBoundingClientRect();
    return { mean: sum / ((d.length / 4) * 3), hash, width: c.width, height: c.height, cssAspect: r.width / r.height };
  });
}

/** Waits until the preview has finished rendering time `t` with nothing queued after it. */
async function waitRendered(page: Page, t: number): Promise<void> {
  const canvas = page.getByTestId('preview-canvas');
  await expect
    .poll(async () => {
      const [state, renderedT] = await Promise.all([
        canvas.getAttribute('data-render-state'),
        canvas.getAttribute('data-rendered-t'),
      ]);
      return state === 'idle' && Math.abs(Number(renderedT) - t) < 0.02;
    })
    .toBe(true);
}

async function setupClip(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
}

test('preview renders the frame under the playhead and follows the format', async ({ page }) => {
  const errors = trackErrors(page);
  await setupClip(page);
  await expect.poll(async () => (await previewStats(page)).mean).toBeGreaterThan(20);
  await waitRendered(page, 0);
  const atZero = await previewStats(page);
  expect(atZero.width).toBe(960);
  expect(atZero.height).toBe(540);
  expect(Math.abs(atZero.cssAspect - 16 / 9)).toBeLessThanOrEqual(0.02);

  await setPlayhead(page, 1.5);
  await waitRendered(page, 1.5);
  const later = await previewStats(page);
  expect(later.mean).toBeGreaterThan(20);
  expect(later.hash).not.toBe(atZero.hash);

  await page.getByTestId('format-select').selectOption('vertical');
  await expect.poll(async () => (await previewStats(page)).cssAspect).toBeCloseTo(9 / 16, 1);
  const vertical = await previewStats(page);
  expect(Math.abs(vertical.cssAspect - 9 / 16)).toBeLessThanOrEqual(0.02);
  expect(vertical.width).toBe(540);
  expect(vertical.height).toBe(960);
  await waitRendered(page, 1.5);
  expect((await previewStats(page)).mean).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('an empty timeline renders black without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await waitRendered(page, 0);
  const s = await previewStats(page);
  expect(s.mean).toBeLessThan(1);
  await expect(page.getByTestId('preview-placeholder')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('play advances the playhead from the audio clock and stops at the end', async ({ page }) => {
  const errors = trackErrors(page);
  await setupClip(page);
  await page.getByTestId('btn-play').click();
  expect((await playerState(page)).playing).toBe(true);

  const samples: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    samples.push((await playerState(page)).playhead);
    await page.waitForTimeout(100);
  }
  for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  expect(samples[samples.length - 1]).toBeGreaterThanOrEqual(0.4);
  await expect(page.getByTestId('btn-play')).toHaveAttribute('aria-busy', 'false');

  await expect.poll(async () => (await playerState(page)).playing, { timeout: 10_000 }).toBe(false);
  const end = await playerState(page);
  expect(Math.abs(end.playhead - 3)).toBeLessThanOrEqual(0.05);
  await page.waitForTimeout(300);
  expect((await playerState(page)).playhead).toBe(end.playhead);

  // Play at the end restarts from the beginning.
  await page.getByTestId('btn-play').click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeLessThan(1);
  await page.getByTestId('btn-play').click();
  expect((await playerState(page)).playing).toBe(false);
  expect(errors).toEqual([]);
});

test('Space toggles playback and pausing keeps the playhead', async ({ page }) => {
  const errors = trackErrors(page);
  await setupClip(page);
  await page.keyboard.press('Space');
  expect((await playerState(page)).playing).toBe(true);
  await expect.poll(async () => (await playerState(page)).playhead).toBeGreaterThan(0.3);
  await page.keyboard.press('Space');
  const paused = await playerState(page);
  expect(paused.playing).toBe(false);
  expect(paused.playhead).toBeGreaterThan(0.3);
  expect(paused.playhead).toBeLessThan(3);
  await page.waitForTimeout(400);
  expect((await playerState(page)).playhead).toBe(paused.playhead);
  expect(errors).toEqual([]);
});

test('an edit during playback pauses it', async ({ page }) => {
  const errors = trackErrors(page);
  await setupClip(page);
  await setPlayhead(page, 0.5);
  await page.getByTestId('btn-play').click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeGreaterThan(0.8);
  const before = await playerState(page);
  expect(before.playing).toBe(true);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  const after = await playerState(page);
  expect(after.playing).toBe(false);
  expect(after.undoDepth).toBe(before.undoDepth + 1);
  await page.waitForTimeout(300);
  expect((await playerState(page)).playhead).toBe(after.playhead);
  expect(errors).toEqual([]);
});

test('Play on an empty timeline says there is nothing to play', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await page.getByTestId('btn-play').click();
  await expect(toast(page)).toContainText('Nothing to play');
  expect((await playerState(page)).playing).toBe(false);
  expect(errors).toEqual([]);
});

test('dragging on the ruler or the playhead handle scrubs, clamped to the timeline', async ({ page }) => {
  await setupClip(page);
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const y = ruler.y + 8;
  await page.mouse.move(ruler.x + 30, y);
  await page.mouse.down();
  await expect.poll(async () => (await playerState(page)).playhead).toBeCloseTo(0.5, 1);
  await page.mouse.move(ruler.x + 90, y, { steps: 4 });
  await expect.poll(async () => (await playerState(page)).playhead).toBeCloseTo(1.5, 1);
  await page.mouse.move(ruler.x + 600, y, { steps: 4 });
  await expect.poll(async () => (await playerState(page)).playhead).toBe(3);
  await page.mouse.move(ruler.x - 50, y, { steps: 4 });
  await expect.poll(async () => (await playerState(page)).playhead).toBe(0);
  await page.mouse.up();

  await setPlayhead(page, 1);
  const handle = (await page.getByTestId('playhead-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 4 });
  await page.mouse.up();
  expect((await playerState(page)).playhead).toBeCloseTo(2, 1);
});

test('without WebGL2 the preview explains itself and editing still works', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await setupClip(page);
  await expect(page.getByTestId('preview-unavailable')).toContainText('WebGL2 is not available');
  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  expect(errors).toEqual([]);
});
