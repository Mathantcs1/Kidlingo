// Plan 5E Task 4: export == preview for a cropped, flipped, anchored, rotated and keyed picture, at 30 and 25 fps.
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { openHarness } from './harness-helpers';
import { imageClip, key, solid, stack } from './keyframe-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(300_000);

const W = 1920;
const H = 1080;

function cropped(m: Parameters<typeof imageClip>[0], bg: Parameters<typeof imageClip>[0], fps: number): Project {
  const top = imageClip(m, {
    id: 'top',
    crop: { left: 0.15, top: 0.1, right: 0.2, bottom: 0.25 },
    flip: { h: true },
    anchor: { x: -0.2, y: 0.1 },
    transform: { x: 100, y: 40, scale: 0.9, rotation: 0, opacity: 1 },
    keys: { rotation: [key(0, -15), key(0.4, 25, 'easeInOut')] },
  }, 0, 0.4);
  return stack({ width: W, height: H, fps }, [[imageClip(bg, { id: 'bg' }, 0, 0.4)], [top]], [bg, m]);
}

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

for (const fps of [30, 25]) {
  test(`cropped + flipped + anchored + rotating picture: export frame N equals preview frame N at ${fps} fps`, async ({ page }) => {
    await openHarness(page);
    const bg = await solid(page, 64, 36, [40, 40, 40]);
    const m = await solid(page, 960, 540, [220, 30, 30], { right: [30, 200, 60], bottom: [40, 60, 230] });
    const p = cropped(m, bg, fps);
    const { b64, skips } = await page.evaluate((p) => window.cf.exportWithSkips(p), p);
    expect(skips).toBeNull();
    const file = test.info().outputPath(`crop-parity-${fps}.mp4`);
    writeFileSync(file, Buffer.from(b64, 'base64'));
    const last = Math.round(0.4 * fps) - 1;
    const checked = [0, Math.floor(last / 2), last];
    const r = await page.evaluate(({ p, times }) => window.cf.renderRgb(p, times), { p, times: checked.map((f) => f / fps) });
    for (const [i, frame] of checked.entries()) {
      const exported = ffmpegFrame(file, frame);
      expect([exported.width, exported.height]).toEqual([W, H]);
      const preview = new Uint8Array(Buffer.from(r.frames[i], 'base64'));
      const d = meanAbsDiff(preview, new Uint8Array(exported.rgb));
      const other = meanAbsDiff(preview, new Uint8Array(ffmpegFrame(file, frame === 0 ? 1 : frame - 1).rgb));
      console.log(`crop parity ${fps} fps frame ${frame}: ${d.toFixed(3)}/255 (neighbour ${other.toFixed(3)})`);
      expect(d, `${fps} fps frame ${frame}`).toBeLessThan(3);
      expect(other, 'the rotation animation is visible between frames').toBeGreaterThan(d + 0.3);
    }
  });
}
