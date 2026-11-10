// The 'blur' fit: a blurred, cover-scaled copy of the clip behind the fitted clip.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipOf, expectNear, openHarness, project, px, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { fitTransform } from '../../src/core/merge';
import type { MediaRef } from '../../src/core/model';

function imageMedia(page: Page, w: number, h: number, rgb: Rgb, opts?: { stripes?: number }): Promise<MediaRef> {
  return page.evaluate(({ w, h, rgb, opts }) => window.cf.putImageMedia(w, h, rgb, opts), { w, h, rgb, opts });
}

const square = (n: number) => ({ width: n, height: n, fps: 30 });

test("fit 'blur' fills the area around the fitted clip with a blurred cover copy", async ({ page }) => {
  await openHarness(page);
  const bar = await imageMedia(page, 64, 16, [255, 0, 0]);
  const [blur] = await render(page, project(square(64), [bar], [clipOf(bar, { out: 1, fit: 'blur' })]), [0]);
  const [fit] = await render(page, project(square(64), [bar], [clipOf(bar, { out: 1, fit: 'fit' })]), [0]);
  const [r, g, b] = px(blur, 32, 4);
  expect(r).toBeGreaterThan(100);
  expect(g).toBeLessThan(40);
  expect(b).toBeLessThan(40);
  expectNear(px(blur, 32, 32), [255, 0, 0], 2, 'fitted clip');
  expectNear(px(fit, 32, 4), [0, 0, 0], 0, 'no background without blur');
  expectNear(px(fit, 32, 32), [255, 0, 0], 2, 'fitted clip');
});

test('the blurred background is a smooth average even of fine detail (no aliasing)', async ({ page }) => {
  await openHarness(page);
  // 1 px white columns every 3 px: averages to ~85 grey; a single-sample downscale picks whole stripes or gaps.
  const stripes = await imageMedia(page, 300, 40, [255, 255, 255], { stripes: 3 });
  const transform = fitTransform({ width: 300, height: 40 }, { width: 64, height: 64 }, 'fit');
  const [f] = await render(page, project(square(64), [stripes], [clipOf(stripes, { out: 1, fit: 'blur', transform })]), [0]);
  // The fitted strip covers y ≈ [28, 36); rows 4 and 60 are pure background. Each low-res texel averages ~10 source
  // columns (3 or 4 of them white: 76..102), so some ripple is inherent; a single-sample downscale spans 0..128.
  for (const y of [4, 60]) {
    const row = Array.from({ length: 64 }, (_, x) => px(f, x, y)[0]);
    const mean = row.reduce((a, b) => a + b, 0) / row.length;
    expect(Math.max(...row) - Math.min(...row), `row ${y}: ${row}`).toBeLessThanOrEqual(45);
    expect(Math.abs(mean - 85), `row ${y} mean ${mean}`).toBeLessThanOrEqual(20);
  }
});
