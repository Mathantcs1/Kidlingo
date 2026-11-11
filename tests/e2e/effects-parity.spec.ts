// Preview/export parity of effect stacks (Plan 4 Task 11): an exported frame (decoded by ffmpeg) matches the preview
// compositor's frame at export size, and time-based effects export deterministically.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { clipOf, openHarness, project } from './harness-helpers';
import { SWAP_GAMMA, cubeText, lutFx } from './lut-helpers';
import { defaultParams } from '../../src/core/videoEffects';
import type { MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';

test.setTimeout(240_000);

let n = 0;
const fx = (type: VideoEffectType, params: Record<string, number> = {}): VideoEffect =>
  ({ id: `pfx-${++n}`, type, enabled: true, params: { ...defaultParams(type), ...params } });

/** A 1920x1080 picture with four colour quadrants (flat areas show drift; the vignette adds a gradient). */
const quadrants = (page: Page): Promise<MediaRef> =>
  page.evaluate(() => window.cf.putImageMedia(1920, 1080, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] }));

/** colour + grain + vignette + LUT (grain left out with `grain` false) on one 0.4 s clip of `m`, 1920x1080 at `fps`. */
function stackProject(m: MediaRef, lut: MediaRef, fps: number, grain = true): Project {
  const effects = [
    fx('colour', { brightness: 0.05, contrast: 0.2, saturation: 0.3 }),
    ...(grain ? [fx('grain', { amount: 0.15 })] : []),
    fx('vignette'),
    lutFx(lut.id, 0.8),
  ];
  const p = project({ width: 1920, height: 1080, fps }, [m], [clipOf(m, { id: 'parity-clip', out: 0.4, effects })]);
  return { ...p, media: { ...p.media, [lut.id]: lut } };
}

function saveExport(name: string, b64: string): string {
  const file = test.info().outputPath(name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

async function exportFile(page: Page, p: Project, name: string): Promise<string> {
  const { b64, skips } = await page.evaluate((p) => window.cf.exportWithSkips(p), p);
  expect(skips).toBeNull();
  return saveExport(name, b64);
}

/** The preview compositor's frames at export size (p.format) at each time, as packed RGB. */
async function previewRgb(page: Page, p: Project, times: number[]): Promise<Uint8Array[]> {
  const r = await page.evaluate(({ p, times }) => window.cf.renderRgb(p, times), { p, times });
  return r.frames.map((f) => new Uint8Array(Buffer.from(f, 'base64')));
}

/** Mean |a − b| over every RGB byte, after averaging `block`×`block` pixel blocks of 1920x1080 RGB (1 = per pixel). */
function meanAbsDiff(a: Uint8Array, b: Uint8Array, block = 1, width = 1920): number {
  expect(a.length).toBe(b.length);
  const height = a.length / 3 / width;
  let sum = 0;
  let count = 0;
  for (let by = 0; by + block <= height; by += block) {
    for (let bx = 0; bx + block <= width; bx += block) {
      for (let k = 0; k < 3; k++) {
        let d = 0;
        for (let y = by; y < by + block; y++) for (let x = bx; x < bx + block; x++) d += a[(y * width + x) * 3 + k] - b[(y * width + x) * 3 + k];
        sum += Math.abs(d) / (block * block);
        count++;
      }
    }
  }
  return sum / count;
}

/** Pearson correlation of (a − base) and (b − base): ~0 for unrelated noise, high for the same grain. */
function residualCorrelation(a: Uint8Array, b: Uint8Array, base: Uint8Array): number {
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < base.length; i++) {
    const u = a[i] - base[i];
    const v = b[i] - base[i];
    sab += u * v;
    saa += u * u;
    sbb += v * v;
  }
  return sab / Math.sqrt(saa * sbb || 1);
}

// H.264 at the 1080p bitrate (12 Mbit/s) cannot keep per-pixel film grain: measured ~8/255 per pixel on the grain
// alone and ~0.49 correlation with the true grain (Task 11 report). So the stack is checked three ways: without grain,
// per pixel; with grain, on 8x8 block means (what the codec keeps); and the exported grain must be frame N's grain
// (clearly more correlated with the preview's frame N than with frame N + 1). Frames 0 and 2 are checked: in later
// P-frames of this 0.4 s file the encoder's rate control drops the grain almost entirely (measured correlation ~0.05
// with ANY preview frame at frame 7 for grain alone), a bitrate limit, not a render difference.
for (const fps of [30, 25]) {
  test(`a 4-effect stack (colour, grain, vignette, LUT) exports at 1080p like the preview at ${fps} fps`, async ({ page }) => {
    await openHarness(page);
    const m = await quadrants(page);
    const lut = await page.evaluate((text) => window.cf.importLutText(text, 'parity.cube'), cubeText(17, SWAP_GAMMA));
    const full = stackProject(m, lut, fps);
    const noGrain = stackProject(m, lut, fps, false);
    const fullFile = await exportFile(page, full, `parity-${fps}.mp4`);
    const noGrainFile = await exportFile(page, noGrain, `parity-${fps}-no-grain.mp4`);
    for (const frame of [0, 2]) {
      const t = frame / fps;
      const exported = ffmpegFrame(fullFile, frame);
      expect([exported.width, exported.height]).toEqual([1920, 1080]);
      const [previewN, previewNext] = await previewRgb(page, full, [t, (frame + 1) / fps]);
      const [base] = await previewRgb(page, noGrain, [t]);
      const exportedRgb = new Uint8Array(exported.rgb);
      const perPixel = meanAbsDiff(base, new Uint8Array(ffmpegFrame(noGrainFile, frame).rgb));
      const blocks = meanAbsDiff(previewN, exportedRgb, 8);
      const same = residualCorrelation(exportedRgb, previewN, base);
      const next = residualCorrelation(exportedRgb, previewNext, base);
      console.log(
        `parity ${fps} fps frame ${frame}: no grain ${perPixel.toFixed(3)}/255 per pixel; full stack ${blocks.toFixed(3)}/255 ` +
          `on 8x8 blocks (${meanAbsDiff(previewN, exportedRgb).toFixed(3)} per pixel); grain correlation ${same.toFixed(3)} ` +
          `with frame ${frame}, ${next.toFixed(3)} with frame ${frame + 1}`,
      );
      expect(perPixel, `no-grain stack, mean abs diff per pixel, ${fps} fps frame ${frame}`).toBeLessThan(3);
      expect(blocks, `full stack, mean abs diff of 8x8 blocks, ${fps} fps frame ${frame}`).toBeLessThan(3);
      // The residual keeps a small frame-independent part (grain before a non-linear vignette/LUT shifts the mean).
      // Measured (SwiftShader + Chromium's encoder): same 0.44-0.68, next 0.14-0.20; a frame-index slip swaps them.
      expect(same, 'exported grain matches the preview grain of the same frame').toBeGreaterThan(0.3);
      expect(same - next, 'exported grain is frame N, not frame N + 1').toBeGreaterThan(0.15);
    }
  });
}

/** ffmpeg's per-frame MD5 of the decoded video stream. */
function frameHashes(file: string): string[] {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-']).toString();
  return out.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1)!.trim());
}

test('time-based effects (grain, glitch, VHS) at 25 fps export identically twice, and change frame to frame', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(320, 180, [120, 120, 120], { right: [30, 60, 200] }));
  const effects = [fx('grain', { amount: 0.3 }), fx('glitch', { intensity: 0.8 }), fx('vhs')];
  const p = project({ width: 320, height: 180, fps: 25 }, [m], [clipOf(m, { out: 0.4, effects })]);
  const runs: string[][] = [];
  for (const i of [1, 2]) {
    const { b64 } = await page.evaluate((p) => window.cf.exportWithSkips(p, 320), p);
    runs.push(frameHashes(saveExport(`deterministic-${i}.mp4`, b64)));
  }
  expect(runs[0]).toHaveLength(10);
  expect(runs[1]).toEqual(runs[0]);
  // Time-based: the frames are not all the same picture.
  expect(new Set(runs[0]).size).toBeGreaterThan(5);
});
