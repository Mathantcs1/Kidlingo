// Preview/export parity of a full 5B animation stack (Plan 5B Task 6): spring-eased curved position keys with orient, a
// repeat scale loop, a keyed colour effect and all four preset slots (Slide In, Pulse, Breathe, Fade Out), at 30 and
// 25 fps. 1080p export frame N vs preview frame N within 3/255 per pixel; the export path is deterministic frame for
// frame at a 320 px long side (Ruling T11-2: Chromium's software H.264 is not bit-reproducible at 1080p); a playhead
// between frames shows the frame start. The stack also carries a lower third with an In preset and a Pop sticker, so the
// built-in flags and the overlay texture sizing (maxDrawnScale) are covered in the export path too (another pixelScale).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { openHarness } from './harness-helpers';
import { overlayClip } from './overlay-helpers';
import { frames, imageClip, key, samePixels, solid, stack } from './keyframe-helpers';
import { emphasis, loop, use } from './preset-helpers';
import { defaultParams } from '../../src/core/videoEffects';
import type { MediaRef, Project } from '../../src/core/model';

test.setTimeout(400_000);

const W = 1920;
const H = 1080;
const LEN = 1;

function animated(bg: MediaRef, m: MediaRef, fps: number): Project {
  const top = imageClip(m, {
    id: 'top',
    effects: [{ id: 'colour', type: 'colour', enabled: true, params: defaultParams('colour'), keys: { brightness: [key(0, -0.3), key(LEN, 0.3, 'easeInOut')] } }],
    keys: {
      position: [
        { t: 0, x: -500, y: 150, ease: { kind: 'spring', spring: { stiffness: 120, damping: 14, mass: 1 } }, out: { x: 200, y: -400 } },
        { t: LEN, x: 500, y: 100, ease: { kind: 'linear' }, in: { x: -200, y: -300 } },
      ],
      scale: [key(0, 0.8), key(0.3, 1.1, 'easeOut')],
      loops: { scale: { mode: 'repeat', count: null } },
      orient: true,
    },
    motion: {
      in: use('slide', 'in', { duration: 0.3, params: { distance: 0.2 } }),
      emphasis: emphasis('pulse', 0.4, { duration: 0.3 }),
      loop: loop('breathe', { duration: 0.5, params: { intensity: 0.2 } }),
      out: use('fade', 'out', { duration: 0.3 }),
    },
  }, 0, LEN);
  // A lower third (Slide In: its built-in slide is off) and a Pop sticker: texture size comes from maxDrawnScale.
  const lower = overlayClip('lowerThird', 0, LEN, { id: 'lower', motion: { in: use('slide', 'in', { duration: 0.4, params: { distance: 0.3 } }) } });
  const sticker = overlayClip('sticker', 0, LEN, { id: 'sticker', transform: { x: -600, y: -250, scale: 1, rotation: 0, opacity: 1 }, motion: { in: use('pop', 'in', { duration: 0.4 }) } });
  return stack({ width: W, height: H, fps }, [[imageClip(bg, { id: 'bg' }, 0, LEN)], [top], [lower], [sticker]], [bg, m]);
}

async function exportFile(page: Page, p: Project, name: string, maxLongSide?: number): Promise<string> {
  const { b64, skips } = await page.evaluate(({ p, maxLongSide }) => window.cf.exportWithSkips(p, maxLongSide), { p, maxLongSide });
  expect(skips).toBeNull();
  const file = test.info().outputPath(name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

const frameHashes = (file: string): string[] =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-']).toString()
    .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1)!.trim());

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

for (const fps of [30, 25]) {
  test(`a full preset + keyed motion stack exports at 1080p like the preview at ${fps} fps; 320 px exports are frame-for-frame equal`, async ({ page }) => {
    await openHarness(page);
    const bg = await solid(page, W, H, [70, 70, 70]);
    const m = await solid(page, 480, 270, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] });
    const p = animated(bg, m, fps);
    const full = await exportFile(page, p, `presets-parity-${fps}.mp4`);
    const n = LEN * fps;
    const checked = [0, 4, Math.round(0.45 * fps), Math.round(0.6 * fps), n - 3, n - 1];
    const previews = (await page.evaluate(({ p, t }) => window.cf.renderRgb(p, t), { p, t: checked.map((f) => f / fps) })).frames
      .map((f) => new Uint8Array(Buffer.from(f, 'base64')));
    for (const [i, frame] of checked.entries()) {
      const exported = ffmpegFrame(full, frame);
      expect([exported.width, exported.height]).toEqual([W, H]);
      const d = meanAbsDiff(previews[i], new Uint8Array(exported.rgb));
      const other = meanAbsDiff(previews[i], new Uint8Array(ffmpegFrame(full, frame === 0 ? 1 : frame - 1).rgb));
      console.log(`presets parity ${fps} fps frame ${frame}: ${d.toFixed(3)}/255 per pixel (neighbour frame ${other.toFixed(3)})`);
      expect(d, `${fps} fps frame ${frame}`).toBeLessThan(3);
      expect(other, 'neighbouring frames really differ (the animation is visible)').toBeGreaterThan(d + 0.5);
    }
    const a = frameHashes(await exportFile(page, p, `presets-parity-${fps}-a.mp4`, 320));
    const b = frameHashes(await exportFile(page, p, `presets-parity-${fps}-b.mp4`, 320));
    console.log(`320 px exports: ${a.length} frames, ${new Set(a).size} distinct`);
    expect(a).toHaveLength(n);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(n - 3);
    // A playhead between frames shows the frame start (preview; export samples frame starts).
    const pairs = [[3, 3.4], [Math.round(0.45 * fps), Math.round(0.45 * fps) + 0.7], [n - 2, n - 1.5]].map(([f, g]) => [f / fps, g / fps]);
    const got = await frames(page, [p], pairs.flat(), { width: 320, height: 180 });
    for (let i = 0; i < pairs.length; i++) expect(samePixels(got[2 * i], got[2 * i + 1]), `frame at ${pairs[i][0]}`).toBe(true);
  });
}
