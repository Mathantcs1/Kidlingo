// The look effects (Plan 4 Task 5: bw, sepia, splitTone, vignette) through the real compositor, checked against the
// CPU references of looksMath.ts: gradient drift guards, identity at amount 0, alpha edges. Grain: effects-grain.spec.ts.
import { test, expect } from '@playwright/test';
import { clipOf, expectNear, openHarness, project, px, render } from './harness-helpers';
import { edgeImage, overBackdrops, straight } from './colour-helpers';
import type { Rgb } from './colour-helpers';
import { GRADIENT_FORMAT, driftGuard, extremes, gradientImage, look, refLook, renderEffects } from './look-helpers';
import type { LookType } from './look-helpers';

const FORMAT = { width: 64, height: 64, fps: 30 };

const SETS: Record<'bw' | 'sepia' | 'splitTone' | 'vignette', Record<string, number>[]> = {
  bw: [...extremes('bw'), {}, { amount: 0.4 }],
  sepia: [...extremes('sepia'), {}, { amount: 0.55 }],
  splitTone: [
    ...extremes('splitTone'), {},
    { shadowHue: 190, shadowAmount: 0.8, highlightHue: 30, highlightAmount: 0.6, balance: 0.3 },
    { shadowHue: 300, shadowAmount: 1, highlightHue: 120, highlightAmount: 1, balance: -0.8 },
  ],
  vignette: [
    ...extremes('vignette'), {},
    { amount: 1, size: 0, softness: 1 }, { amount: 0.8, size: 0.3, softness: 0.2 }, { amount: 0.6, size: 0.9, softness: 0.05 },
  ],
};
const IDENTITY: Record<'bw' | 'sepia' | 'splitTone' | 'vignette', Record<string, number>> = {
  bw: { amount: 0 }, sepia: { amount: 0 }, splitTone: { shadowAmount: 0, highlightAmount: 0 }, vignette: { amount: 0 },
};

test('bw on solid red gives R=G=B at the Rec.709 luma; amount 0 leaves it unchanged', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 0, 0]));
  const p = (params: Record<string, number>) => project(FORMAT, [m], [clipOf(m, { out: 1, effects: [look('bw', params)] })]);
  const full = await renderEffects(page, p({}), [0]);
  expect(full.error).toBeNull();
  expect(full.passes).toEqual([1]);
  const luma = 0.2126 * 255;
  for (const [x, y] of [[0, 0], [32, 32], [63, 63]]) {
    const c = px(full.frames[0], x, y);
    expectNear(c, [luma, luma, luma], 2, `luma at ${x},${y}`);
    expect(c[0] === c[1] && c[1] === c[2], `R=G=B at ${x},${y}: ${c}`).toBe(true);
  }
  const none = await renderEffects(page, p({ amount: 0 }), [0]);
  expectNear(px(none.frames[0], 32, 32), [255, 0, 0], 1, 'amount 0');
});

for (const type of ['bw', 'sepia', 'splitTone', 'vignette'] as const) {
  test(`${type}: every param at min and max and combined sets match the reference over the gradient; amount 0 is identity`, async ({ page }) => {
    await openHarness(page);
    const m = await gradientImage(page);
    await driftGuard(page, m, type, SETS[type], IDENTITY[type]);
  });
}

test('vignette darkens the corners but not the centre of a flat picture', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(64, 64, [200, 160, 100]));
  const r = await renderEffects(page, project(FORMAT, [m], [clipOf(m, { out: 1, effects: [look('vignette')] })]), [0]);
  expect(r.error).toBeNull();
  const [plain] = await render(page, project(FORMAT, [m], [clipOf(m, { out: 1 })]), [0]);
  const centre = px(r.frames[0], 32, 32);
  expectNear(centre, px(plain, 32, 32), 1, 'centre');
  for (const [x, y] of [[0, 0], [63, 0], [0, 63], [63, 63]]) {
    const c = px(r.frames[0], x, y);
    for (let k = 0; k < 3; k++) expect(c[k], `corner ${x},${y} channel ${k}`).toBeLessThan(0.8 * centre[k]);
  }
});

test('vignette is circular on a wide picture (aspect-correct), not an ellipse', async ({ page }) => {
  await openHarness(page);
  const white = await page.evaluate(() => window.cf.putImageMedia(256, 48, [255, 255, 255]));
  const p = project(GRADIENT_FORMAT, [white], [clipOf(white, { out: 1, effects: [look('vignette', { amount: 1, size: 0.1, softness: 0.4 })] })]);
  const r = await renderEffects(page, p, [0]);
  // 20 px to the right of the centre and 20 px below it (both inside the 24 px half height) darken equally.
  const a = px(r.frames[0], 128 + 20, 24)[0];
  const b = px(r.frames[0], 128, 44)[0];
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(2);
  expect(a).toBeLessThan(250);
});

test('a 50 %- and a 15 %-alpha edge keep alpha and colour under bw, sepia, split tone and vignette: no halo', async ({ page }) => {
  await openHarness(page);
  const C: Rgb = [200, 120, 60];
  const edge = await edgeImage(page, C);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const cases: [LookType, Record<string, number>][] = [
    ['bw', { amount: 0.8 }], ['sepia', { amount: 0.8 }],
    ['splitTone', { shadowAmount: 0.8, highlightAmount: 0.8, shadowHue: 200, highlightHue: 20 }],
    ['vignette', { amount: 0.8, size: 0, softness: 1 }],
  ];
  const [plainB, plainW] = await Promise.all(overBackdrops(edge, white, [], FORMAT).map((p) => render(page, p, [0]).then((f) => f[0])));
  const worst: Record<string, number> = {};
  for (const [type, params] of cases) {
    const [pb, pw] = overBackdrops(edge, white, [look(type, params)], FORMAT);
    const fxB = (await renderEffects(page, pb, [0])).frames[0];
    const fxW = (await renderEffects(page, pw, [0])).frames[0];
    for (const y of [4, 32, 60]) {
      expectNear(px(fxB, 16, y), refLook(type, px(plainB, 16, y), params, 16, y, FORMAT), 3, `${type} opaque interior at y=${y}`);
      for (const [x, alpha] of [[33, 0.5], [36, 0.5], [39, 0.5], [40, 0.15], [43, 0.15]] as const) {
        const before = straight(plainB, plainW, x, y);
        const after = straight(fxB, fxW, x, y);
        expect(Math.abs(after.a - before.a), `${type} alpha at ${x},${y}`).toBeLessThanOrEqual(1.5 / 255);
        const want = refLook(type, before.rgb, params, x, y, FORMAT);
        expectNear(after.rgb, want, 1.5 / alpha, `${type} edge colour at ${x},${y} (alpha ${alpha})`);
        for (let k = 0; k < 3; k++) worst[`${type} ${alpha}`] = Math.max(worst[`${type} ${alpha}`] ?? 0, Math.abs(after.rgb[k] - want[k]));
      }
      expectNear(px(fxW, 56, y), [255, 255, 255], 0, `${type} transparent at y=${y}`);
    }
  }
  console.log('look edges: max straight-colour error', JSON.stringify(worst));
});
