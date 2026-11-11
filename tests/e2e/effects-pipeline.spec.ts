// The effect pipeline (Plan 4 Task 3) with test-only shaders registered through the dev harness (never shipped).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, expectNear, importPaths, openHarness, project, px, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { fitTransform } from '../../src/core/merge';
import type { MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import type { TestShader } from '../../src/harnessShaders';

const dir = ensureFixtures();
const square = (n: number) => ({ width: n, height: n, fps: 30 });
const TL: Rgb = [200, 40, 10];
const TR: Rgb = [10, 120, 250];
const BR: Rgb = [0, 255, 0];

let n = 0;
const fx = (type: VideoEffectType, enabled = true, params: Record<string, number> = { amount: 1 }): VideoEffect =>
  ({ id: `fx-${++n}`, type, enabled, params });

function register(page: Page, type: VideoEffectType, shader: TestShader | null): Promise<void> {
  return page.evaluate(({ type, shader }) => window.cf.registerTestEffect(type, shader), { type, shader });
}

function renderEffects(page: Page, p: Project, times: number[], opts: { loseAfter?: number } = {}) {
  return page.evaluate(({ p, times, opts }) => window.cf.renderEffects(p, times, opts), { p, times, opts });
}

/** A 64x64 image: TL colour top-left and bottom-left, TR top-right, BR bottom-right (shows any flip). */
function quadImage(page: Page): Promise<MediaRef> {
  return page.evaluate(({ TL, TR, BR }) => window.cf.putImageMedia(64, 64, TL, { right: TR, bottom: BR }), { TL, TR, BR });
}

const imageProject = (m: MediaRef, effects: VideoEffect[], over: Parameters<typeof clipOf>[1] = {}): Project =>
  project(square(64), [m], [clipOf(m, { out: 1, effects, ...over })]);

const inv = (c: Rgb): Rgb => [255 - c[0], 255 - c[1], 255 - c[2]];

test('a registered test effect changes pixels exactly as its shader says, upright, in one pass per frame', async ({ page }) => {
  await openHarness(page);
  const m = await quadImage(page);
  await register(page, 'invert', 'invert');
  const r = await renderEffects(page, imageProject(m, [fx('invert')]), [0, 0.5]);
  expect(r.error).toBeNull();
  expect(r.passes).toEqual([1, 2]);
  const f = r.frames[1];
  expectNear(px(f, 8, 8), inv(TL), 1, 'top-left');
  expectNear(px(f, 56, 8), inv(TR), 1, 'top-right');
  expectNear(px(f, 8, 56), inv(TL), 1, 'bottom-left');
  expectNear(px(f, 56, 56), inv(BR), 1, 'bottom-right');

  // Params reach custom uniforms; the multi-pass hook draws two passes of the same program (invert twice = input).
  await register(page, 'invert', 'gain');
  const gain = await renderEffects(page, imageProject(m, [fx('invert', true, { amount: 0.5 })]), [0]);
  expectNear(px(gain.frames[0], 8, 8), [100, 20, 5], 1, 'gain 0.5');
  await register(page, 'invert', 'invertTwice');
  const twice = await renderEffects(page, imageProject(m, [fx('invert')]), [0]);
  expect(twice.passes).toEqual([2]);
  const [plain] = await render(page, imageProject(m, []), [0]);
  expect(twice.frames[0].data).toEqual(plain.data);
});

test('a passthrough effect leaves rotated and mirrored video exactly as drawn without effects', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  await register(page, 'invert', 'passthrough');
  const media = await importPaths(page, [join(dir, 'quad-cw90-hflip.mp4'), join(dir, 'quad-cw90.mp4')]);
  for (const m of media) {
    const size = { width: m.width!, height: m.height! };
    const p = (effects: VideoEffect[]) =>
      project({ ...size, fps: 30 }, [m], [clipOf(m, { effects, transform: fitTransform(size, size, 'fit') })]);
    const fxd = await renderEffects(page, p([fx('invert')]), [0.5]);
    const [plain] = await render(page, p([]), [0.5]);
    expect(fxd.passes).toEqual([1]);
    let worst = 0;
    for (let i = 0; i < plain.data.length; i++) worst = Math.max(worst, Math.abs(plain.data[i] - fxd.frames[0].data[i]));
    expect(worst, `max channel difference for ${m.name}`).toBeLessThanOrEqual(1);
  }
});

test('disabled and unavailable effects leave the same slot: no pass, identical pixels', async ({ page }) => {
  await openHarness(page);
  const m = await quadImage(page);
  await register(page, 'invert', 'invert');
  // invert disabled; mirror/pixelate have no shader registered.
  const r = await renderEffects(page, imageProject(m, [fx('invert', false), fx('mirror'), fx('pixelate')]), [0, 0.5]);
  const [plain] = await render(page, imageProject(m, []), [0]);
  expect(r.passes).toEqual([0, 0]);
  expect(r.unavailable).toEqual([]);
  expect(r.frames[1].data).toEqual(plain.data);
});

test('a shader that fails to compile is skipped once, reported once, and the clip still draws', async ({ page }) => {
  await openHarness(page);
  const m = await quadImage(page);
  await register(page, 'sepia', 'broken');
  await register(page, 'invert', 'invert');
  const r = await renderEffects(page, imageProject(m, [fx('sepia')]), [0, 0.25, 0.5]);
  const [plain] = await render(page, imageProject(m, []), [0]);
  expect(r.error).toBeNull();
  expect(r.unavailable).toEqual(['sepia']);
  expect(r.passes).toEqual([0, 0, 0]);
  for (const f of r.frames) expect(f.data).toEqual(plain.data);

  // A second compositor (an export) neither retries nor reports it again; the rest of the stack still applies.
  const both = await renderEffects(page, imageProject(m, [fx('sepia'), fx('invert')]), [0]);
  const only = await renderEffects(page, imageProject(m, [fx('invert')]), [0]);
  expect(both.unavailable).toEqual([]);
  expect(both.passes).toEqual([1]);
  expect(both.frames[0].data).toEqual(only.frames[0].data);
  expectNear(px(both.frames[0], 8, 8), inv(TL), 1, 'inverted despite the broken effect');
});

test('a lost context with effects stays an error, not an unavailable effect', async ({ page }) => {
  await openHarness(page);
  const m = await quadImage(page);
  await register(page, 'invert', 'invert');
  const r = await renderEffects(page, imageProject(m, [fx('invert')]), [0, 0.25, 0.5], { loseAfter: 1 });
  expect(r.frames).toHaveLength(1);
  expect(r.error).toBe('WebGL context lost');
  expect(r.unavailable).toEqual([]);
});

test("the 'blur' fit backdrop is made from the processed picture", async ({ page }) => {
  await openHarness(page);
  const bar = await page.evaluate(() => window.cf.putImageMedia(64, 16, [255, 0, 0]));
  await register(page, 'invert', 'invert');
  const r = await renderEffects(page, imageProject(bar, [fx('invert')], { fit: 'blur' }), [0]);
  const f = r.frames[0];
  const [red, green, blue] = px(f, 32, 4);
  expect(red, `backdrop ${px(f, 32, 4)}`).toBeLessThan(40);
  expect(green).toBeGreaterThan(100);
  expect(blue).toBeGreaterThan(100);
  expectNear(px(f, 32, 32), [0, 255, 255], 2, 'inverted clip');
});

test('effects see the clip-relative frame, snapped: preview frame N = export frame N', async ({ page }) => {
  await openHarness(page);
  const m = await quadImage(page);
  await register(page, 'invert', 'frame');
  // The clip starts at 0.5 s; 5 frames in, and just before the 6th, it is frame 5 (time 5/30).
  const p = imageProject(m, [fx('invert')], { start: 0.5 });
  const r = await renderEffects(page, p, [0.5 + 5 / 30, 0.5 + 6 / 30 - 0.001, 0.5]);
  expectNear(px(r.frames[0], 8, 8), [5, 5, 0], 0, 'frame 5');
  expectNear(px(r.frames[1], 8, 8), [5, 5, 0], 0, 'still frame 5');
  expectNear(px(r.frames[2], 8, 8), [0, 0, 0], 0, 'frame 0');
});
