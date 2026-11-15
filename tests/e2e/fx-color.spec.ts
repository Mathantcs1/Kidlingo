// Plan 4 Task 4: the effect pipeline and the single-pass colour effects, checked against the CPU reference formulas.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ROTATED, ensureFixtures } from './fixtures';
import { stubGl, setStub } from './gl-stub';
import { clipOf, expectNear, importPaths, openHarness, project, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { SIZE, centre, flat, fx, image, oneClip, pixelAt, renderStack, toBytes, toUnit } from './fx-helpers';
import { fitTransform } from '../../src/core/merge';
import { bwPixel, colorPixel, invertPixel, sepiaPixel } from '../../src/fx/reference';
import { defaultFxParams } from '../../src/fx/params';

test.setTimeout(180_000);
const dir = ensureFixtures();
const TOL = 3;
const SAMPLES: Rgb[] = [[128, 128, 128], [204, 77, 26], [26, 153, 230]];

const colorStack = (over: Record<string, number>) => [fx('color', over)];
const expectColor = (got: Rgb, want: Rgb, msg: string) => expectNear(got, toBytes(want), TOL, msg);

test('color: every parameter matches the CPU reference on several colours', async ({ page }) => {
  await openHarness(page);
  const cases: Record<string, number>[] = [
    { exposure: 1 }, { exposure: -1 }, { brightness: 0.4 }, { brightness: -0.4 }, { contrast: 0.5 }, { contrast: -0.5 },
    { saturation: -1 }, { saturation: 0.6 }, { hue: 120 }, { hue: -60 }, { temperature: 0.8 }, { tint: -0.8 },
    { shadows: 1 }, { highlights: -1 }, { exposure: 0.5, contrast: 0.3, saturation: 0.4, hue: 30, temperature: 0.2, shadows: 0.5 },
  ];
  for (const rgb of SAMPLES) {
    const m = await flat(page, rgb);
    for (const params of cases) {
      const f = await renderStack(page, m, colorStack(params));
      expectColor(centre(f), colorPixel(toUnit(rgb), { ...defaultFxParams('color'), ...params }), `${rgb} ${JSON.stringify(params)}`);
    }
  }
});

test('bw, sepia and invert match their references; amount 0 changes nothing', async ({ page }) => {
  await openHarness(page);
  for (const rgb of SAMPLES) {
    const m = await flat(page, rgb);
    for (const amount of [0, 0.5, 1]) {
      expectColor(centre(await renderStack(page, m, [fx('bw', { amount })])), bwPixel(toUnit(rgb), amount), `bw ${rgb} ${amount}`);
      expectColor(centre(await renderStack(page, m, [fx('sepia', { amount })])), sepiaPixel(toUnit(rgb), amount), `sepia ${rgb} ${amount}`);
      expectColor(centre(await renderStack(page, m, [fx('invert', { amount })])), invertPixel(toUnit(rgb), amount), `invert ${rgb} ${amount}`);
    }
  }
});

test('vignette leaves the centre alone and darkens the corners; amount 0 is the identity', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [200, 200, 200]);
  const strong = await renderStack(page, m, [fx('vignette', { amount: 1 })]);
  expectNear(centre(strong), [200, 200, 200], 1, 'centre');
  expect(pixelAt(strong, 0, 0)[0]).toBeLessThanOrEqual(150);
  expect(pixelAt(strong, SIZE - 1, SIZE - 1)[0]).toBeLessThanOrEqual(150);
  const none = await renderStack(page, m, [fx('vignette', { amount: 0 })]);
  expectNear(pixelAt(none, 0, 0), [200, 200, 200], 1, 'corner with amount 0');
});

test('translucent pixels: no fringes and the default colour effect equals no effect', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [200, 100, 40], 0.5);
  const plain = await renderStack(page, m, []);
  const same = await renderStack(page, m, [fx('color')]);
  expectNear(centre(same), centre(plain), 1, 'default colour effect');
  // Every colour effect must keep premultiplied colour <= alpha (0.5 over black => <= 128).
  for (const stack of [colorStack({ brightness: 0.4 }), colorStack({ exposure: 2 }), [fx('sepia')], [fx('bw')], [fx('invert')], [fx('vignette', { amount: 1 })]]) {
    const f = await renderStack(page, m, stack);
    for (const v of centre(f)) expect(v, JSON.stringify(stack)).toBeLessThanOrEqual(129);
  }
  const inv = await renderStack(page, m, [fx('invert')]);
  expectNear(centre(inv), [Math.round((255 - 200) * 0.5), Math.round((255 - 100) * 0.5), Math.round((255 - 40) * 0.5)], TOL, 'inverted translucent');
});

test('a disabled effect and the Effects-off option are byte-identical to no effect', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [90, 160, 220]);
  const plain = await renderStack(page, m, []);
  const disabled = await renderStack(page, m, [fx('invert', {}, { enabled: false })]);
  const bypass = await renderStack(page, m, [fx('invert')], {}, { bypassFx: true });
  expect(disabled.data).toEqual(plain.data);
  expect(bypass.data).toEqual(plain.data);
  const on = await renderStack(page, m, [fx('invert')]);
  expect(on.data).not.toEqual(plain.data);
});

test('effect order matters', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [100, 100, 100]);
  const a = centre(await renderStack(page, m, [fx('color', { brightness: 0.4 }), fx('invert')]));
  const b = centre(await renderStack(page, m, [fx('invert'), fx('color', { brightness: 0.4 })]));
  expectNear(a, toBytes(invertPixel(colorPixel(toUnit([100, 100, 100]), { brightness: 0.4 }), 1)), TOL, 'brightness then invert');
  expectNear(b, toBytes(colorPixel(invertPixel(toUnit([100, 100, 100]), 1), { brightness: 0.4 })), TOL, 'invert then brightness');
  expect(Math.abs(a[0] - b[0])).toBeGreaterThan(50);
});

test('a scaled and rotated clip keeps its effect colour at the centre', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [204, 77, 26]);
  const p = oneClip(m, colorStack({ hue: 120 }), { transform: { scale: 0.5, rotation: 30 } });
  const [f] = await render(page, p, [0.5]);
  expectColor(centre(f), colorPixel(toUnit([204, 77, 26]), { ...defaultFxParams('color'), hue: 120 }), 'rotated centre');
  expectNear(pixelAt(f, 1, 1), [0, 0, 0], 0, 'outside the clip stays black');
});

test('a rotated phone video with an effect stays upright (inverted corners match the plain render)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, ROTATED[90])]);
  const size = { width: m.width!, height: m.height! };
  const fmt = { ...size, fps: 30 };
  const clip = (stack: ReturnType<typeof fx>[]) => clipOf(m, { transform: fitTransform(size, size, 'fit'), fx: stack });
  const [plain] = await render(page, project(fmt, [m], [clip([])]), [0.5]);
  const [inv] = await render(page, project(fmt, [m], [clip([fx('invert')])]), [0.5]);
  for (const [x, y] of [[8, 8], [size.width - 9, 8], [8, size.height - 9], [size.width - 9, size.height - 9]]) {
    const a = pixelAt(plain, x, y);
    expectNear(pixelAt(inv, x, y), [255 - a[0], 255 - a[1], 255 - a[2]], 6, `corner ${x},${y}`);
  }
});

test("fit 'blur': the blurred background is processed too", async ({ page }) => {
  await openHarness(page);
  const bar = await image(page, 64, 16, [255, 0, 0]);
  const p = project({ width: 64, height: 64, fps: 10 }, [bar], [clipOf(bar, { out: 1, fit: 'blur', fx: [fx('invert')], transform: fitTransform({ width: 64, height: 16 }, { width: 64, height: 64 }, 'fit') })]);
  const [f] = await render(page, p, [0]);
  const bg = pixelAt(f, 32, 4);
  expect(bg[0]).toBeLessThan(60);
  expect(bg[1]).toBeGreaterThan(150);
  expect(bg[2]).toBeGreaterThan(150);
});

test('the target pool stays bounded over 100 frames of a three-effect stack', async ({ page }) => {
  await openHarness(page);
  const m = await flat(page, [90, 160, 220]);
  const p = oneClip(m, [fx('color', { hue: 40 }), fx('sepia'), fx('vignette')]);
  const s = await page.evaluate((p) => window.cf.renderStats(p, Array.from({ length: 100 }, (_, i) => i / 100)), p);
  expect(s.after.fxTargets).toBeLessThanOrEqual(6);
  expect(s.after.fxTargets).toBe(s.mid.fxTargets);
  expect(s.after.imageTextures).toBe(s.mid.imageTextures);
  expect(s.glError).toBe(0);
});

test('a shader that fails to compile is skipped alone, named once; the rest of the stack still renders', async ({ page }) => {
  await stubGl(page, {});
  await openHarness(page);
  await setStub(page, { shaderFailPattern: 'fx:vignette' });
  const m = await flat(page, [200, 200, 200]);
  const p = oneClip(m, [fx('vignette', { amount: 1 }), fx('invert')]);
  const frames = await page.evaluate((p) => window.cf.renderPixels(p, [0.1, 0.2, 0.3]), p);
  for (const f of frames) {
    expectNear(pixelAt(f, 0, 0), [55, 55, 55], 2, 'corner: inverted, not vignetted');
    expectNear(centre(f), [55, 55, 55], 2, 'centre');
  }
  expect(await page.evaluate(() => window.cf.fxErrors)).toEqual(['vignette']);
});
