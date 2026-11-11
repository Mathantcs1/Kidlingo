// The stylise effects (Plan 4 Task 8) through the real compositor: invert twice = identity, mirror halves, rgbSplit
// offsets in 1080-row pixels, glitch / VHS deterministic per clip-relative frame, identities draw no pass, and
// transparent pixels stay transparent. Per-pixel agreement with the CPU references: effects-stylise-reference.spec.ts.
import { test, expect } from '@playwright/test';
import { clipOf, expectNear, openHarness, project, px, render } from './harness-helpers';
import { overBackdrops } from './colour-helpers';
import { rectImage, textureImage } from './blur-helpers';
import { STYLISE, changed, renderEffects, sfx, single } from './stylise-helpers';

/** The texture fixture is 96x540: half the 1080-row reference, so 1080-row pixel params are halved. */
const W = 96;
const H = 540;

test('invert twice is the identity (±1) and invert amount 0 draws no pass', async ({ page }) => {
  await openHarness(page);
  const m = await textureImage(page);
  const [plain] = await render(page, single(m, []), [0.5]);
  const twice = await renderEffects(page, single(m, [sfx('invert'), sfx('invert')]), [0.5]);
  expect(twice.passes).toEqual([2]);
  const once = await renderEffects(page, single(m, [sfx('invert')]), [0.5]);
  for (const [x, y] of [[0, 0], [50, 100], [95, 539], [43, 400], [10, 250]]) {
    expectNear(px(twice.frames[0], x, y), px(plain, x, y), 1, `invert twice at ${x},${y}`);
    expectNear(px(once.frames[0], x, y), px(plain, x, y).map((v) => 255 - v), 1, `invert at ${x},${y}`);
  }
  let worst = 0;
  for (let i = 0; i < plain.data.length; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(twice.frames[0].data[i] - plain.data[i]));
  expect(worst).toBeLessThanOrEqual(1);
  const none = await renderEffects(page, single(m, [sfx('invert', { amount: 0 })]), [0.5]);
  expect(none.passes).toEqual([0]);
  expect(none.frames[0].data).toEqual(plain.data);
});

test('mirror mode 0 makes the right half the mirror image of the left; mode 2 the bottom of the top', async ({ page }) => {
  await openHarness(page);
  const m = await textureImage(page);
  const [plain] = await render(page, single(m, []), [0.5]);
  const lr = (await renderEffects(page, single(m, [sfx('mirror', { mode: 0 })]), [0.5])).frames[0];
  const tb = (await renderEffects(page, single(m, [sfx('mirror', { mode: 2 })]), [0.5])).frames[0];
  for (let y = 0; y < H; y += 7) {
    for (let x = 0; x < W; x++) {
      expect(px(lr, x, y), `mode 0 at ${x},${y}`).toEqual(px(plain, x < W / 2 ? x : W - 1 - x, y));
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x += 5) expect(px(tb, x, y), `mode 2 at ${x},${y}`).toEqual(px(plain, x, y < H / 2 ? y : H - 1 - y));
  }
});

test('rgbSplit amount 0 is the identity; amount 20 moves red by +10 px and blue by −10 px at 540 rows', async ({ page }) => {
  await openHarness(page);
  const m = await textureImage(page);
  const [plain] = await render(page, single(m, []), [0.5]);
  const none = await renderEffects(page, single(m, [sfx('rgbSplit', { amount: 0 })]), [0.5]);
  expect(none.passes).toEqual([0]);
  expect(none.frames[0].data).toEqual(plain.data);
  for (const angle of [0, 90]) {
    const f = (await renderEffects(page, single(m, [sfx('rgbSplit', { amount: 20, angle })]), [0.5])).frames[0];
    const [dx, dy] = angle === 0 ? [10, 0] : [0, 10];
    for (let y = 20; y < H - 20; y += 3) {
      for (let x = 12; x < W - 12; x += 2) {
        const got = px(f, x, y);
        const what = `angle ${angle} at ${x},${y}`;
        expect(Math.abs(got[0] - px(plain, x - dx, y - dy)[0]), `red ${what}`).toBeLessThanOrEqual(1);
        expect(Math.abs(got[1] - px(plain, x, y)[1]), `green ${what}`).toBeLessThanOrEqual(1);
        expect(Math.abs(got[2] - px(plain, x + dx, y + dy)[2]), `blue ${what}`).toBeLessThanOrEqual(1);
      }
    }
  }
});

for (const type of ['glitch', 'vhs'] as const) {
  test(`${type} is deterministic per clip-relative frame and changes from frame to frame`, async ({ page }) => {
    await openHarness(page);
    const m = await textureImage(page);
    const params: Record<string, number> = type === 'glitch' ? { intensity: 0.6 } : { wobble: 1, noise: 0.4 };
    const [plain] = await render(page, single(m, []), [0.5]);
    const a = await renderEffects(page, single(m, [sfx(type, params)]), [0.5, 0.51, 0.5 + 1 / 30, 0.5 + 5 / 30]);
    const b = await renderEffects(page, single(m, [sfx(type, params)]), [0.5]);
    expect(a.error).toBeNull();
    expect(a.passes).toEqual([1, 2, 3, 4]); // cumulative: one pass per frame
    expect(changed(a.frames[0], plain), 'the effect changes the picture').toBeGreaterThan(W * H * 0.05);
    expect(a.frames[0].data).toEqual(b.frames[0].data);
    // 0.5 s and 0.51 s are both frame 15 at 30 fps.
    expect(a.frames[1].data).toEqual(a.frames[0].data);
    for (const f of a.frames.slice(2)) expect(changed(f, a.frames[0]), 'pixels that changed on another frame').toBeGreaterThan(W * H * 0.02);
    // Clip-relative: the same clip frame at a later timeline start renders the same picture.
    const later = await renderEffects(page, single(m, [sfx(type, params)], { start: 3 }), [3.5]);
    expect(later.frames[0].data).toEqual(a.frames[0].data);
  });
}

test('every stylise effect at its defaults leaves fully transparent pixels transparent', async ({ page }) => {
  await openHarness(page);
  const format = { width: 64, height: 64, fps: 30 };
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const clear = await rectImage(page, 64, 64, []);
  for (const type of STYLISE) {
    const [, over] = overBackdrops(clear, white, [sfx(type)], format);
    const r = await renderEffects(page, over, [0.5]);
    expect(r.error).toBeNull();
    for (const [x, y] of [[0, 0], [31, 31], [63, 63], [10, 50]]) expect(px(r.frames[0], x, y), `${type} at ${x},${y}`).toEqual([255, 255, 255]);
  }
  // And a disabled stylise effect is skipped entirely.
  const off = await renderEffects(page, project(format, [white], [clipOf(white, { out: 1, effects: STYLISE.map((t) => sfx(t, {}, false)) })]), [0]);
  expect(off.passes).toEqual([0]);
});
