// Plan 5E Task 4: crop (a mask on the full frame), flip and anchor in the real compositor (pixel reads).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Clip, MediaRef } from '../../src/core/model';
import { clipOf, expectNear, openHarness, project, px, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';

const RED: Rgb = [255, 0, 0];
const GREEN: Rgb = [0, 255, 0];
const BLUE: Rgb = [0, 0, 255];
const BLACK: Rgb = [0, 0, 0];
const FORMAT = { width: 64, height: 64, fps: 30 };

/** 64x64: left half red, top-right green, bottom-right blue. */
const quad = (page: Page): Promise<MediaRef> =>
  page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 0, 0], { right: [0, 255, 0], bottom: [0, 0, 255] }));

async function shot(page: Page, m: MediaRef, over: Partial<Clip>, extra: Partial<Clip> = {}) {
  const [f] = await render(page, project(FORMAT, [m], [clipOf(m, { ...over, ...extra })]), [0]);
  return f;
}
const at = (f: Parameters<typeof px>[0], x: number, y: number) => px(f, x, y);
const is = (f: Parameters<typeof px>[0], x: number, y: number, c: Rgb, msg: string) => expectNear(at(f, x, y), c, 3, `${msg} @(${x},${y})`);

test('the picture is drawn unchanged without crop, flip or anchor', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  const f = await shot(page, m, {});
  is(f, 10, 10, RED, 'TL'); is(f, 10, 50, RED, 'BL'); is(f, 50, 10, GREEN, 'TR'); is(f, 50, 50, BLUE, 'BR');
});

test('crop is a mask: the visible pixels do not move (D1)', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  const left = await shot(page, m, { crop: { left: 0.5, top: 0, right: 0, bottom: 0 } });
  is(left, 10, 10, BLACK, 'cropped away'); is(left, 10, 50, BLACK, 'cropped away');
  is(left, 50, 10, GREEN, 'TR stays'); is(left, 50, 50, BLUE, 'BR stays');
  const top = await shot(page, m, { crop: { left: 0, top: 0.5, right: 0, bottom: 0 } });
  is(top, 10, 10, BLACK, 'top cropped'); is(top, 50, 10, BLACK, 'top cropped');
  is(top, 10, 50, RED, 'BL stays'); is(top, 50, 50, BLUE, 'BR stays');
  const edge = await shot(page, m, { crop: { left: 0.25, top: 0, right: 0.25, bottom: 0 } });
  is(edge, 14, 10, BLACK, 'left of the mask'); is(edge, 18, 10, RED, 'inside the mask');
  is(edge, 45, 10, GREEN, 'inside the mask'); is(edge, 49, 10, BLACK, 'right of the mask');
});

test('flip mirrors the picture about its own axes', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  const h = await shot(page, m, { flip: { h: true } });
  is(h, 10, 10, GREEN, 'TL<-TR'); is(h, 10, 50, BLUE, 'BL<-BR'); is(h, 50, 10, RED, 'TR<-TL'); is(h, 50, 50, RED, 'BR<-BL');
  const v = await shot(page, m, { flip: { v: true } });
  is(v, 10, 10, RED, 'TL<-BL'); is(v, 50, 10, BLUE, 'TR<-BR'); is(v, 50, 50, GREEN, 'BR<-TR');
  const hv = await shot(page, m, { flip: { h: true, v: true } });
  is(hv, 10, 10, BLUE, 'TL<-BR'); is(hv, 50, 50, RED, 'BR<-TL');
});

test('flip happens inside the crop (the mask stays where it is)', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  // Visible x in [16, 64): red [16,32), green/blue [32,64). Flipped inside the mask: green/blue first, red last.
  const f = await shot(page, m, { crop: { left: 0.25, top: 0, right: 0, bottom: 0 }, flip: { h: true } });
  is(f, 8, 10, BLACK, 'masked'); is(f, 20, 10, GREEN, 'was right'); is(f, 20, 50, BLUE, 'was right'); is(f, 60, 10, RED, 'was left');
});

test('crop and rotation: the mask turns with the frame, about the frame centre', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  const f = await shot(page, m, { crop: { left: 0.5, top: 0, right: 0, bottom: 0 }, transform: { x: 0, y: 0, scale: 1, rotation: 90, opacity: 1 } });
  is(f, 48, 48, GREEN, 'TR rotated to BR'); is(f, 16, 48, BLUE, 'BR rotated to BL');
  is(f, 16, 16, BLACK, 'top half empty'); is(f, 48, 16, BLACK, 'top half empty');
});

test('anchor: the pivot sits at the clip position; scale and rotation turn about it (D4)', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  const still = await shot(page, m, { anchor: { x: -0.5, y: -0.5 } });
  is(still, 40, 40, RED, 'TL corner now at the canvas centre'); is(still, 10, 10, BLACK, 'frame moved away');
  is(still, 60, 40, RED, 'left half of the picture reaches the canvas edge'); is(still, 60, 60, RED, 'still the left half');
  const turned = await shot(page, m, { anchor: { x: -0.5, y: -0.5 }, transform: { x: 0, y: 0, scale: 1, rotation: 90, opacity: 1 } });
  is(turned, 16, 48, RED, 'turned about the corner'); is(turned, 48, 16, BLACK, 'nothing up-right'); is(turned, 48, 48, BLACK, 'nothing down-right');
  // Quarter size about the corner: the whole picture sits in x, y in [32, 48).
  const small = await shot(page, m, { anchor: { x: -0.5, y: -0.5 }, transform: { x: 0, y: 0, scale: 0.25, rotation: 0, opacity: 1 } });
  is(small, 35, 35, RED, 'TL'); is(small, 44, 36, GREEN, 'TR'); is(small, 44, 44, BLUE, 'BR'); is(small, 56, 56, BLACK, 'beyond'); is(small, 28, 28, BLACK, 'before');
});

test('crop, flip and effects together: the effect sees the cropped, flipped picture', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  const invert = { id: 'inv', type: 'invert' as const, enabled: true, params: { amount: 1 } };
  const plain = await shot(page, m, { effects: [invert], crop: { left: 0.25, top: 0, right: 0, bottom: 0 } });
  is(plain, 20, 10, [0, 255, 255], 'red inverted'); is(plain, 60, 10, [255, 0, 255], 'green inverted'); is(plain, 8, 10, BLACK, 'masked, not inverted to white');
  const flipped = await shot(page, m, { effects: [invert], crop: { left: 0.25, top: 0, right: 0, bottom: 0 }, flip: { h: true } });
  is(flipped, 20, 10, [255, 0, 255], 'green inverted, flipped to the left'); is(flipped, 60, 10, [0, 255, 255], 'red inverted, flipped to the right');
});

test('a hairline crop edge does not bleed the cropped-away pixels', async ({ page }) => {
  await openHarness(page);
  const m = await quad(page);
  // 1.5x canvas: the crop edge (the red/green seam) lands between pixel centres and the texel centres, where bilinear
  // sampling would mix red in without the half-texel inset.
  const p = project(FORMAT, [m], [clipOf(m, { crop: { left: 0.5, top: 0, right: 0, bottom: 0 } })]);
  const [f] = await render(page, p, [0], { canvas: { width: 96, height: 96 } });
  for (let y = 6; y < 44; y += 9) {
    const [r, g] = px(f, 48, y);
    expect(r, `no red bleed at (48,${y})`).toBeLessThan(10);
    expect(g, `green at (48,${y})`).toBeGreaterThan(240);
  }
});

test('the blur fit covers the frame from the CROPPED picture', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(64, 32, [255, 0, 0], { right: [0, 255, 0] }));
  // 64x32 in a 64x64 canvas, blur fit; crop away all but the right quarter (green, 16x32): the backdrop must be
  // green over the WHOLE frame (cover scale from the cropped 16x32 size), not red/black.
  const f = await shot(page, m, { fit: 'blur', crop: { left: 0.75, top: 0, right: 0, bottom: 0 } });
  for (const [x, y] of [[4, 8], [4, 56], [32, 6], [58, 58]]) {
    const [r, g] = at(f, x, y);
    expect(r, `no red in the backdrop @(${x},${y})`).toBeLessThan(60);
    expect(g, `green backdrop @(${x},${y})`).toBeGreaterThan(150);
  }
});

test('effects run on the cropped picture only: the working target is smaller', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(128, 128, [255, 0, 0]));
  const invert = { id: 'inv', type: 'invert' as const, enabled: true, params: { amount: 1 } };
  const bytes = async (crop?: Clip['crop']) => {
    const p = project({ width: 128, height: 128, fps: 30 }, [m], [clipOf(m, { effects: [invert], crop })]);
    const r = await page.evaluate((p) => window.cf.renderEffects(p, [0]), p);
    return r.memory[0].bytes;
  };
  const full = await bytes();
  const half = await bytes({ left: 0.5, top: 0, right: 0, bottom: 0 });
  expect(full).toBeGreaterThan(0);
  expect(half, 'half-width crop allocates about half the effect target memory').toBeLessThan(full * 0.6);
});
