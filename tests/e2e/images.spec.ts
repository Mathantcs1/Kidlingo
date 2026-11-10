// Still images are decoded at a capped size, not kept as bitmaps, and their textures are freed when inactive.
import { test, expect } from '@playwright/test';
import { clipOf, openHarness, project } from './harness-helpers';
import type { MediaRef } from '../../src/core/model';

test.setTimeout(120_000);

test('a 6000x4000 photo renders, is held at most 3840 px on its long side, and is freed when not shown', async ({ page }) => {
  await openHarness(page);
  const big: MediaRef = await page.evaluate(() => window.cf.putImageMedia(6000, 4000, [30, 200, 90]));
  const fmt = { width: 64, height: 64, fps: 30 };
  const clip = clipOf(big, { start: 0, out: 1, transform: { scale: 64 / 6000 } });
  const p = project(fmt, [big], [clip]);
  const r = await page.evaluate(async (p) => {
    const canvas = document.createElement('canvas');
    const comp = window.cf.createCompositor(canvas, { preserveDrawingBuffer: true });
    comp.resize(64, 64);
    const closed: number[] = [];
    const original = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function (this: ImageBitmap) {
      closed.push(Math.max(this.width, this.height));
      original.call(this);
    };
    try {
      await comp.renderFrame(p, 0.5, new Map());
      const data = window.cf.readPixels(canvas).data;
      const at = (x: number, y: number): number[] => data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 3);
      // Fitted to the 64 px width: x [0, 64), y [≈11, ≈53).
      const samples = [at(32, 32), at(1, 32), at(62, 32), at(32, 4)];
      const shown = comp.stats();
      await comp.renderFrame(p, 2, new Map());
      const hidden = comp.stats();
      return { samples, shown, hidden, closed };
    } finally {
      ImageBitmap.prototype.close = original;
      comp.dispose();
    }
  }, p);
  const [mid, left, right, above] = r.samples;
  for (const c of [mid, left, right]) expect(c[1], `image pixel ${c}`).toBeGreaterThan(150);
  expect(above, 'letterbox above the image').toEqual([0, 0, 0]);
  expect(r.shown.imageTextures).toBe(1);
  expect(r.shown.maxImageSide).toBe(3840);
  // The decoded bitmap is released right after its upload.
  expect(r.closed).toContain(3840);
  expect(r.hidden.imageTextures).toBe(0);
});
