// Plan 5D Task 6: a sped-up clip shows source frame floor(s*n) at output frame n; a freeze shows one frame; the export's
// duration follows the speed. The fixture encodes its frame number in grey levels (see fixtures.ts).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, px, render } from './harness-helpers';

test.setTimeout(120_000);

const file = join(ensureFixtures(), 'frame-index.mp4');
const FMT = { width: 128, height: 72, fps: 30 };

/** The source frame number read back from a rendered frame (left half low digit, right half high digit). */
function frameNo(f: { width: number; height: number; data: ArrayLike<number> }): number {
  const level = (rgb: number[]): number => Math.round((rgb[0] * 219) / 255 / 6);
  const lo = level(px(f, Math.floor(f.width / 4), Math.floor(f.height / 2)));
  const hi = level(px(f, Math.floor((3 * f.width) / 4), Math.floor(f.height / 2)));
  return lo + 32 * hi;
}

for (const speed of [0.5, 2, 4]) {
  test(`at ${speed}x output frame n shows source frame floor(${speed}·n)`, async ({ page }) => {
    await openHarness(page);
    const [m] = await importPaths(page, [file]);
    const n = [0, 1, 2, 3, 7, 10, 19];
    const c = clipOf(m, { speed, out: 4, transform: { scale: 1 } });
    const frames = await render(page, project(FMT, [m], [c]), n.map((i) => i / 30));
    const got = frames.map(frameNo);
    expect(got).toEqual(n.map((i) => Math.floor(speed * i + 1e-6)));
  });
}

test('a freeze clip shows its one footage frame for the whole hold', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [file]);
  const c = clipOf(m, { freeze: { at: 1.0166 }, in: 0, out: 2 });
  const frames = await render(page, project(FMT, [m], [c]), [0, 0.5, 1.0, 1.9]);
  expect(frames.map(frameNo)).toEqual([30, 30, 30, 30]);
});

test('exporting a 2x clip lasts half as long (ffprobe-grade duration from the mp4)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [file]);
  const c = clipOf(m, { speed: 2, out: 4 });
  const r = await page.evaluate((p) => window.cf.runExport(p, { maxLongSide: 128 }), project(FMT, [m], [c]));
  expect(r.error).toBeNull();
  expect(r.info!.duration).toBeCloseTo(2, 1);
});

test('decode guard: 30 output frames at 4x decode at most ceil(4) + 1 source frames each', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [file]);
  const c = clipOf(m, { speed: 4, out: 4, transform: { scale: 1 } });
  const n = await page.evaluate(
    async ({ p, times }) => {
      window.cf.resetVideoDecodeCount();
      await window.cf.renderPixels(p, times, { canvas: { width: 64, height: 36 } });
      return window.cf.videoDecodeCount();
    },
    { p: project(FMT, [m], [c]), times: Array.from({ length: 30 }, (_, i) => i / 30) },
  );
  expect(n).toBeLessThanOrEqual(30 * 5);
  expect(n).toBeGreaterThanOrEqual(30 * 4 - 8); // it really did read through the footage (no frames were skipped by a seek per frame)
});
