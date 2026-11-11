// Vignette and grain where the working size differs from the format, at two source resolutions, and on rotated video
// (Plan 4 Task 5 review): the effect follows the clip's own pixel grid and the displayed orientation.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, px, render } from './harness-helpers';
import { GRADIENT_FORMAT, look, refLook, renderEffects } from './look-helpers';
import { fitTransform } from '../../src/core/merge';
import type { VideoEffect } from '../../src/core/model';

const dir = ensureFixtures();

test('a 128x32 clip in a bigger format: vignette follows the clip\'s own pixel grid (circular about its centre)', async ({ page }) => {
  await openHarness(page);
  const size = { width: 128, height: 32 };
  const m = await page.evaluate(() => window.cf.putImageMedia(128, 32, [200, 200, 200]));
  const sets: Record<string, number>[] = [{}, { amount: 1, size: 0, softness: 1 }, { amount: 0.7, size: 0.3, softness: 0.3 }];
  const clips = sets.map((params, i) => clipOf(m, { start: i, out: 1, transform: { scale: 1 }, effects: [look('vignette', params)] }));
  const r = await renderEffects(page, project(GRADIENT_FORMAT, [m], clips), sets.map((_, i) => i + 0.5));
  expect(r.error).toBeNull();
  let worst = 0;
  for (const [i, params] of sets.entries()) {
    // The clip is centred on the canvas: its pixel (x, y) is canvas (x + 64, y + 8).
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 128; x++) {
        const want = refLook('vignette', [200, 200, 200], params, x, y, size);
        const got = px(r.frames[i], x + 64, y + 8);
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(got[k] - want[k]));
      }
    }
    expect(worst, `vignette on a small clip, ${JSON.stringify(params)}`).toBeLessThanOrEqual(3);
  }
  console.log(`vignette small clip: max |GL − reference| = ${worst.toFixed(3)} / 255`);
});

test('a 90°-rotated video: vignette is symmetric about the displayed centre and grain is deterministic', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'quad-cw90.mp4')]);
  const size = { width: m.width!, height: m.height! };
  expect(size.height).toBeGreaterThan(size.width); // 128x72 rotated clockwise: displayed portrait
  const p = (effects: VideoEffect[]) =>
    project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
  const [plain] = await render(page, p([]), [0.5]);
  const vig = { amount: 1, size: 0.2, softness: 0.5 };
  const v = await renderEffects(page, p([look('vignette', vig)]), [0.5]);
  expect(v.error).toBeNull();
  const { width: w, height: h } = size;
  const ratio = (f: { width: number; data: number[] }, x: number, y: number): number => {
    const a = px(f, x, y);
    const b = px(plain, x, y);
    return (a[0] + a[1] + a[2]) / (b[0] + b[1] + b[2]);
  };
  const corners = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]];
  const cr = corners.map(([x, y]) => ratio(v.frames[0], x, y));
  expect(Math.max(...cr) - Math.min(...cr), `corner darkening ${cr}`).toBeLessThan(0.02);
  expect(Math.max(...cr)).toBeLessThan(0.3);
  expect(ratio(v.frames[0], w >> 1, h >> 1)).toBeGreaterThan(0.98);
  // Per pixel on the displayed grid (circular in the rotated orientation).
  for (const [x, y] of [...corners, [w >> 1, 2], [w >> 1, h - 3], [2, h >> 1], [w - 3, h >> 1], [w >> 2, h >> 2], [(3 * w) >> 2, (3 * h) >> 2]]) {
    expectNear(px(v.frames[0], x, y), refLook('vignette', px(plain, x, y), vig, x, y, size), 3, `vignette at ${x},${y}`);
  }
  const g = look('grain', { amount: 0.4, size: 2 });
  const a = await renderEffects(page, p([g]), [0.5]);
  const b = await renderEffects(page, p([g]), [0.5]);
  expect(a.frames[0].data).toEqual(b.frames[0].data);
  expect(a.frames[0].data).not.toEqual(plain.data);
  for (const [x, y] of [[3, 3], [w >> 1, h >> 1], [w - 4, h - 4], [10, h - 20]]) {
    expectNear(px(a.frames[0], x, y), refLook('grain', px(plain, x, y), g.params, x, y, size, 15), 3, `grain at ${x},${y}`);
  }
});

test('grain size is relative to 1080 working rows: the noise correlation length scales with the working height', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const g = look('grain', { amount: 0.5, size: 4 });
  const runLength = async (w: number, h: number): Promise<number> => {
    const m = await page.evaluate(([w, h]) => window.cf.putImageMedia(w, h, [128, 128, 128]), [w, h]);
    const format = { width: w, height: h, fps: 30 };
    const r = await renderEffects(page, project(format, [m], [clipOf(m, { out: 1, transform: { scale: 1 }, effects: [g] })]), [0.5]);
    expect(r.error).toBeNull();
    const f = r.frames[0];
    let runs = 0;
    let pixels = 0;
    let worst = 0;
    for (let y = 0; y < h; y += 7) {
      let prev = 0;
      for (let x = 0; x < w; x++) {
        const got = px(f, x, y)[0];
        worst = Math.max(worst, Math.abs(got - refLook('grain', [128, 128, 128], g.params, x, y, { width: w, height: h }, 15)[0]));
        const s = Math.sign(got - 128);
        if (s !== prev) runs++;
        prev = s;
        pixels++;
      }
    }
    expect(worst, `GL vs grainPixel at ${w}x${h}`).toBeLessThanOrEqual(2);
    return pixels / runs;
  };
  const half = await runLength(64, 540); // cell = 4 · 0.5 = 2 px
  const full = await runLength(128, 1080); // cell = 4 px
  console.log(`grain mean same-sign run: ${half.toFixed(2)} px at 540 rows, ${full.toFixed(2)} px at 1080 rows`);
  expect(full / half, `run ${half} vs ${full}`).toBeGreaterThan(1.6);
  expect(full / half).toBeLessThan(2.4);
});
