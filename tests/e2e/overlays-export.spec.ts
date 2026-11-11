// Overlay clips export like the preview (Plan 4 Task 12): ffmpeg-decoded exported frames vs the preview compositor
// at export size, over the whole frame and inside each overlay's region, while the lower third slides and the bar fills.
// Regions are compared 2 px inside each overlay's box: at the box edges 4:2:0 H.264 chroma mixes the overlay with
// what is around it (the 5 px progress bar measured up to ~10/255 with its edges, which says nothing about the render).
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { clipOf, openHarness } from './harness-helpers';
import { FMT, boxOf, layered, overlayClip } from './overlay-helpers';
import type { Clip, MediaRef, Project } from '../../src/core/model';

test.setTimeout(180_000);

const FPS = 25;

async function preview(page: Page, p: Project, t: number): Promise<Uint8Array> {
  const r = await page.evaluate(({ p, t }) => window.cf.renderRgb(p, [t]), { p, t });
  return new Uint8Array(Buffer.from(r.frames[0], 'base64'));
}

/** Mean |a - b| per channel over the pixels of `box` (the whole frame when omitted). */
function meanAbs(a: Uint8Array, b: Uint8Array, box?: { l: number; r: number; t: number; b: number }): number {
  expect(a.length).toBe(b.length);
  const { l, r, t, b: bottom } = box ?? { l: 0, r: FMT.width, t: 0, b: FMT.height };
  let s = 0;
  let n = 0;
  for (let y = Math.max(0, Math.ceil(t)); y < Math.min(FMT.height, bottom); y++) {
    for (let x = Math.max(0, Math.ceil(l)); x < Math.min(FMT.width, r); x++) {
      const i = (y * FMT.width + x) * 3;
      for (let k = 0; k < 3; k++) s += Math.abs(a[i + k] - b[i + k]);
      n += 3;
    }
  }
  return s / n;
}

const inset = (b: { l: number; r: number; t: number; b: number }, k: number) => ({ l: b.l + k, r: b.r - k, t: b.t + k, b: b.b - k });

test('lower third, progress bar and sticker over a picture export like the preview (< 3/255; < 6/255 per region)', async ({ page }) => {
  await openHarness(page);
  const back: MediaRef = await page.evaluate((f) => window.cf.putImageMedia(f.width, f.height, [40, 90, 160], { right: [150, 130, 60] }), FMT);
  const fmt = { ...FMT, fps: FPS };
  const overlays: Clip[] = [overlayClip('lowerThird', 0, 1), overlayClip('progressBar', 0, 1), overlayClip('sticker', 0, 1, { spec: { sticker: 'star' } })];
  const p: Project = { ...layered([[clipOf(back, { out: 1 })], ...overlays.map((c) => [c])], [back]), format: fmt };
  const bare: Project = { ...layered([[clipOf(back, { out: 1 })]], [back]), format: fmt };
  const { b64, skips } = await page.evaluate((p) => window.cf.exportWithSkips(p, 320), p);
  expect(skips).toBeNull();
  const file = test.info().outputPath('overlays.mp4');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  for (const frame of [4, 8, 12]) {
    const t = frame / FPS;
    const want = await preview(page, p, t);
    const got = ffmpegFrame(file, frame);
    expect([got.width, got.height]).toEqual([FMT.width, FMT.height]);
    const rgb = new Uint8Array(got.rgb);
    const whole = meanAbs(want, rgb);
    const regions = overlays.map((c) => meanAbs(want, rgb, inset(boxOf(c), 2)));
    const without = await preview(page, bare, t);
    const visible = overlays.map((c) => meanAbs(want, without, boxOf(c)));
    console.log(`frame ${frame}: export vs preview ${whole.toFixed(2)}/255; per overlay ${regions.map((v) => v.toFixed(2)).join(', ')}; overlay vs none ${visible.map((v) => v.toFixed(1)).join(', ')}`);
    expect(whole, `frame ${frame}`).toBeLessThan(3);
    regions.forEach((v, i) => expect(v, `frame ${frame} ${overlays[i].overlay!.type}`).toBeLessThan(6));
    // The overlays really are in the picture (the lower third is still sliding in at frame 4).
    visible.forEach((v, i) => expect(v, `frame ${frame} ${overlays[i].overlay!.type} visible`).toBeGreaterThan(frame === 4 && i === 0 ? 5 : 15));
  }
});
