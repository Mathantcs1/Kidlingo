// Blend modes + effects export like the preview (Plan 4 Task 11a; the effects-parity check of Task 11 applied to a
// blended frame): an ffmpeg-decoded exported frame vs the preview compositor at export size.
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { clipOf, openHarness } from './harness-helpers';
import { newTrack } from '../../src/core/model';
import type { BlendMode, MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import { defaultParams } from '../../src/core/videoEffects';

test.setTimeout(180_000);

let n = 0;
const fx = (type: VideoEffectType, params: Record<string, number> = {}): VideoEffect =>
  ({ id: `bx-${++n}`, type, enabled: true, params: { ...defaultParams(type), ...params } });

/** Quadrant backdrop; a colour+vignette layer in `mid` mode; a smaller rotated layer in `top` mode, half opacity. */
function blendProject(back: MediaRef, a: MediaRef, b: MediaRef, mid: BlendMode, top: BlendMode): Project {
  const track = (id: string, clip: ReturnType<typeof clipOf>) => ({ ...newTrack('video'), id, clips: [clip] });
  return {
    version: 4,
    format: { width: 320, height: 180, fps: 25 },
    tracks: [
      track('back', clipOf(back, { out: 0.4 })),
      track('mid', clipOf(a, { out: 0.4, blend: mid, effects: [fx('colour', { contrast: 0.3, saturation: 0.4 }), fx('vignette')] })),
      track('top', clipOf(b, { out: 0.4, blend: top, transform: { x: 40, y: -10, rotation: 20, opacity: 0.6 } })),
      { ...newTrack('audio'), id: 'audio' },
    ],
    media: { [back.id]: back, [a.id]: a, [b.id]: b },
  };
}

async function exported(page: Page, p: Project, name: string): Promise<string> {
  const { b64, skips } = await page.evaluate((p) => window.cf.exportWithSkips(p, 320), p);
  expect(skips).toBeNull();
  const file = test.info().outputPath(name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

async function preview(page: Page, p: Project, t: number): Promise<Uint8Array> {
  const r = await page.evaluate(({ p, t }) => window.cf.renderRgb(p, [t]), { p, t });
  return new Uint8Array(Buffer.from(r.frames[0], 'base64'));
}

const meanAbs = (a: Uint8Array, b: Uint8Array): number => {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

test('multiply/overlay and screen/difference layers with effects export like the preview (< 3/255 per pixel)', async ({ page }) => {
  await openHarness(page);
  const [back, a, b] = await page.evaluate(() => Promise.all([
    window.cf.putImageMedia(320, 180, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] }),
    window.cf.putImageMedia(320, 180, [120, 200, 90], { right: [250, 120, 160] }),
    window.cf.putImageMedia(120, 80, [90, 60, 220], { bottom: [240, 240, 30] }),
  ]));
  const normal = await preview(page, blendProject(back, a, b, 'normal', 'normal'), 0);
  for (const [mid, top] of [['multiply', 'overlay'], ['screen', 'difference']] as [BlendMode, BlendMode][]) {
    const p = blendProject(back, a, b, mid, top);
    const file = await exported(page, p, `blend-${mid}-${top}.mp4`);
    for (const frame of [0, 2]) {
      const want = await preview(page, p, frame / 25);
      const got = ffmpegFrame(file, frame);
      expect([got.width, got.height]).toEqual([320, 180]);
      const diff = meanAbs(want, new Uint8Array(got.rgb));
      console.log(`blend export ${mid}/${top} frame ${frame}: ${diff.toFixed(3)}/255 per pixel vs preview`);
      expect(diff, `${mid}/${top} frame ${frame}`).toBeLessThan(3);
      // The blend really is in the picture: far from the all-normal render.
      expect(meanAbs(want, normal)).toBeGreaterThan(15);
    }
  }
});
