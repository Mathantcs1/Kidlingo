// Preview/export parity of an animated stack (Plan 5 Task 5): position + opacity keys on a picture with keyed colour and
// grain, over a static background, exported at 1080p and compared with the preview compositor's frame N at 30 and 25
// fps. Grain is checked per Plan 4 Ruling T11-1: per pixel without grain, on 8x8 block means with grain, and the
// exported grain must be frame N's (more correlated with preview frame N than with N + 1).
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { openHarness } from './harness-helpers';
import { imageClip, key, pos, solid, stack } from './keyframe-helpers';
import { resolvedTransform } from '../../src/core/animate';
import { defaultParams } from '../../src/core/videoEffects';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';

test.setTimeout(300_000);

const W = 1920;
const H = 1080;

/** The animated stack: 0.4 s, a 960x540 four-colour picture moving across a grey background while it fades in. */
function animated(bg: MediaRef, m: MediaRef, fps: number, grain = true): Project {
  const effects: VideoEffect[] = [
    { id: 'colour', type: 'colour', enabled: true, params: { ...defaultParams('colour'), contrast: 0.2 }, keys: { brightness: [key(0, -0.3), key(0.4, 0.3, 'easeInOut')] } },
    ...(grain ? [{ id: 'grain', type: 'grain' as const, enabled: true, params: defaultParams('grain'), keys: { amount: [key(0, 0.3), key(0.4, 0.4)] } }] : []),
  ];
  const top = imageClip(m, {
    id: 'top', effects,
    keys: { position: [pos(0, -400, -100), pos(0.4, 400, 100, 'easeOut')], opacity: [key(0, 0.7), key(0.4, 1)] },
  }, 0, 0.4);
  return stack({ width: W, height: H, fps }, [[imageClip(bg, { id: 'bg' }, 0, 0.4)], [top]], [bg, m]);
}

async function exportFile(page: Page, p: Project, name: string): Promise<string> {
  const { b64, skips } = await page.evaluate((p) => window.cf.exportWithSkips(p), p);
  expect(skips).toBeNull();
  const file = test.info().outputPath(name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

async function previewRgb(page: Page, p: Project, times: number[]): Promise<Uint8Array[]> {
  const r = await page.evaluate(({ p, times }) => window.cf.renderRgb(p, times), { p, times });
  return r.frames.map((f) => new Uint8Array(Buffer.from(f, 'base64')));
}

/** Mean |a − b| over every RGB byte after averaging `block`×`block` pixel blocks (1 = per pixel). */
function meanAbsDiff(a: Uint8Array, b: Uint8Array, block = 1): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  let count = 0;
  for (let by = 0; by + block <= H; by += block) {
    for (let bx = 0; bx + block <= W; bx += block) {
      for (let k = 0; k < 3; k++) {
        let d = 0;
        for (let y = by; y < by + block; y++) for (let x = bx; x < bx + block; x++) d += a[(y * W + x) * 3 + k] - b[(y * W + x) * 3 + k];
        sum += Math.abs(d) / (block * block);
        count++;
      }
    }
  }
  return sum / count;
}

/** The grained clip's box at time t (from the same resolver the compositor uses), in output pixels. */
function boxAt(p: Project, t: number): { l: number; r: number; t: number; b: number } {
  const tr = resolvedTransform(p.tracks[1].clips[0], t, p.format.fps);
  const cx = W / 2 + tr.x;
  const cy = H / 2 + tr.y;
  return { l: Math.ceil(cx - 480) + 2, r: Math.floor(cx + 480) - 2, t: Math.ceil(cy - 270) + 2, b: Math.floor(cy + 270) - 2 };
}

/** Pearson correlation of (a − base) and (b − base) inside `box` (the grain is only on the moving clip). */
function residualCorrelation(a: Uint8Array, b: Uint8Array, base: Uint8Array, box: ReturnType<typeof boxAt>): number {
  let sab = 0, saa = 0, sbb = 0;
  for (let y = Math.max(0, box.t); y < Math.min(H, box.b); y++) {
    for (let x = Math.max(0, box.l); x < Math.min(W, box.r); x++) {
      for (let k = 0; k < 3; k++) {
        const i = (y * W + x) * 3 + k;
        const u = a[i] - base[i];
        const v = b[i] - base[i];
        sab += u * v; saa += u * u; sbb += v * v;
      }
    }
  }
  return sab / Math.sqrt(saa * sbb || 1);
}

for (const fps of [30, 25]) {
  test(`an animated stack (position, opacity, colour, grain keys) exports at 1080p like the preview at ${fps} fps`, async ({ page }) => {
    await openHarness(page);
    const bg = await solid(page, W, H, [70, 70, 70]);
    const m = await solid(page, 960, 540, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] });
    const full = animated(bg, m, fps);
    const noGrain = animated(bg, m, fps, false);
    const fullFile = await exportFile(page, full, `kf-parity-${fps}.mp4`);
    const noGrainFile = await exportFile(page, noGrain, `kf-parity-${fps}-no-grain.mp4`);
    const last = Math.round(0.4 * fps) - 1;
    const checked = [0, 3, Math.floor(last / 2) + 1, last];
    const previews = await previewRgb(page, noGrain, checked.map((f) => f / fps));
    for (const [i, frame] of checked.entries()) {
      const exported = ffmpegFrame(noGrainFile, frame);
      expect([exported.width, exported.height]).toEqual([W, H]);
      const d = meanAbsDiff(previews[i], new Uint8Array(exported.rgb));
      const other = meanAbsDiff(previews[i], new Uint8Array(ffmpegFrame(noGrainFile, frame === 0 ? 1 : frame - 1).rgb));
      console.log(`kf parity ${fps} fps frame ${frame}: no grain ${d.toFixed(3)}/255 per pixel (vs neighbour frame ${other.toFixed(3)})`);
      expect(d, `no-grain animated stack, ${fps} fps frame ${frame}`).toBeLessThan(3);
      expect(other, 'neighbouring frames really differ (the animation is visible)').toBeGreaterThan(d + 1);
    }
    for (const frame of [0, 2]) {
      const t = frame / fps;
      const exported = new Uint8Array(ffmpegFrame(fullFile, frame).rgb);
      const [previewN, previewNext] = await previewRgb(page, full, [t, (frame + 1) / fps]);
      const [base] = await previewRgb(page, noGrain, [t]);
      const blocks = meanAbsDiff(previewN, exported, 8);
      const box = boxAt(full, t);
      const same = residualCorrelation(exported, previewN, base, box);
      const next = residualCorrelation(exported, previewNext, base, box);
      console.log(`kf parity ${fps} fps frame ${frame}: full stack ${blocks.toFixed(3)}/255 on 8x8 blocks; grain correlation ${same.toFixed(3)} with frame ${frame}, ${next.toFixed(3)} with ${frame + 1}`);
      expect(blocks, `full animated stack, 8x8 blocks, ${fps} fps frame ${frame}`).toBeLessThan(3);
      expect(same, 'exported grain matches the preview grain of the same frame').toBeGreaterThan(0.3);
      expect(same - next, 'exported grain is frame N, not frame N + 1').toBeGreaterThan(0.15);
    }
  });
}
