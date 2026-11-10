// Videos with display-rotation metadata (portrait phone clips) must render upright in the preview and export.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ROTATED, ensureFixtures, ffmpegFrame } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, px, render } from './harness-helpers';
import { fitTransform } from '../../src/core/merge';

test.setTimeout(120_000);

const dir = ensureFixtures();
const quad = join(dir, 'quad.mp4');
const files: [number, string][] = [[0, quad], ...Object.entries(ROTATED).map(([r, f]) => [Number(r), join(dir, f)] as [number, string])];

type Img = { width: number; height: number; data: ArrayLike<number> };

/** Colours 8 px in from each corner: TL, TR, BL, BR. */
function corners(img: Img, channels: number): number[][] {
  const i = 8;
  const { width: w, height: h } = img;
  return [
    px(img, i, i, channels),
    px(img, w - 1 - i, i, channels),
    px(img, i, h - 1 - i, channels),
    px(img, w - 1 - i, h - 1 - i, channels),
  ];
}

const truth = new Map(files.map(([r, f]) => [r, ffmpegFrame(f)]));
const truthCorners = (r: number): number[][] => {
  const t = truth.get(r)!;
  return corners({ width: t.width, height: t.height, data: t.rgb }, 3);
};

test('imports rotated video with its display size and draws it upright (0/90/180/270)', async ({ page }) => {
  await openHarness(page);
  const media = await importPaths(page, files.map(([, f]) => f));
  for (const [i, [rot]] of files.entries()) {
    const m = media[i];
    const t = truth.get(rot)!;
    expect([m.width, m.height], `media size for ${rot}°`).toEqual([t.width, t.height]);
    const size = { width: m.width!, height: m.height! };
    const clip = clipOf(m, { transform: fitTransform(size, size, 'fit') });
    const [f] = await render(page, project({ ...size, fps: 30 }, [m], [clip]), [0.5]);
    const got = corners(f, 4);
    const want = truthCorners(rot);
    for (let c = 0; c < 4; c++) expectNear(got[c], want[c], 48, `${rot}° corner ${['TL', 'TR', 'BL', 'BR'][c]}`);
  }
});

test('the blurred background of a rotated clip is rotated too', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, ROTATED[90])]);
  const fmt = { width: 128, height: 128, fps: 30 };
  const clip = clipOf(m, { fit: 'blur', transform: fitTransform({ width: m.width!, height: m.height! }, fmt, 'fit') });
  const [f] = await render(page, project(fmt, [m], [clip]), [0.5]);
  // The upright 72x128 clip sits at x [28, 100); left of it is the blurred cover copy whose top-left area shows the
  // clip's top-left quadrant colour and bottom-left area its bottom-left quadrant colour.
  const palette = truthCorners(90);
  const nearest = (c: number[]): number =>
    palette.map((p, i) => [p.reduce((s, v, k) => s + (v - c[k]) ** 2, 0), i]).sort((a, b) => a[0] - b[0])[0][1];
  expect(nearest(px(f, 6, 12)), `top-left background ${px(f, 6, 12)}`).toBe(0);
  expect(nearest(px(f, 6, 115)), `bottom-left background ${px(f, 6, 115)}`).toBe(2);
});

test('exports a rotated clip upright', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, ROTATED[90])]);
  const size = { width: m.width!, height: m.height! };
  const p = project({ ...size, fps: 30 }, [m], [clipOf(m, { out: 0.5, transform: fitTransform(size, size, 'fit') })]);
  const b64 = await page.evaluate(({ p }) => window.cf.exportBase64(p, 128), { p });
  const out = join(test.info().outputDir, 'rotated-export.mp4');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(test.info().outputDir, { recursive: true });
  writeFileSync(out, Buffer.from(b64, 'base64'));
  const frame = ffmpegFrame(out, 5);
  expect([frame.width, frame.height]).toEqual([72, 128]);
  const got = corners({ width: frame.width, height: frame.height, data: frame.rgb }, 3);
  const want = truthCorners(90);
  for (let c = 0; c < 4; c++) expectNear(got[c], want[c], 48, `exported corner ${['TL', 'TR', 'BL', 'BR'][c]}`);
});
