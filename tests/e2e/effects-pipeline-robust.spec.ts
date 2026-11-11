// Effect pipeline robustness (Plan 4 Task 3 review): context loss mid-stack, effect errors, several clips per frame.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import type { TestShader } from '../../src/harnessShaders';

const dir = ensureFixtures();
let n = 0;
const fx = (type: VideoEffectType): VideoEffect => ({ id: `fx-${++n}`, type, enabled: true, params: { amount: 1 } });

function register(page: Page, type: VideoEffectType, shader: TestShader | null): Promise<void> {
  return page.evaluate(({ type, shader }) => window.cf.registerTestEffect(type, shader), { type, shader });
}

function renderEffects(page: Page, p: Project, times: number[]) {
  return page.evaluate(({ p, times }) => window.cf.renderEffects(p, times), { p, times });
}

function image(page: Page, w: number, h: number, rgb: Rgb, opts?: { right?: Rgb; bottom?: Rgb }): Promise<MediaRef> {
  return page.evaluate(({ w, h, rgb, opts }) => window.cf.putImageMedia(w, h, rgb, opts), { w, h, rgb, opts });
}

/** One video track per clip (first clip at the bottom). */
function layered(format: Project['format'], media: MediaRef[], clips: Clip[]): Project {
  const tracks = clips.map((c, i) => ({ ...newTrack('video'), id: `v${i}`, clips: [c] }));
  return { version: 4, format, tracks, media: Object.fromEntries(media.map((m) => [m.id, m])) };
}

/** Non-overlapping clips over black: the combined frame is the per-channel maximum of the single-clip frames. */
function expectUnion(both: { data: number[] }, singles: { data: number[] }[], msg: string): void {
  let worst = 0;
  for (let i = 0; i < both.data.length; i++) {
    worst = Math.max(worst, Math.abs(both.data[i] - Math.max(...singles.map((s) => s.data[i]))));
  }
  expect(worst, msg).toBeLessThanOrEqual(1);
}

const square = (s: number) => ({ width: s, height: s, fps: 30 });

test('a context lost between two passes of a multi-pass effect is "WebGL context lost"', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 64, 64, [200, 40, 10]);
  await register(page, 'invert', 'loseMidway');
  const r = await renderEffects(page, layered(square(64), [m], [clipOf(m, { out: 1, effects: [fx('invert')] })]), [0, 0.5]);
  expect(r.error).toBe('WebGL context lost');
  expect(r.frames).toHaveLength(0);
  expect(r.unavailable).toEqual([]);
  expect(r.unavailableTypes).not.toContain('invert');
});

test('effects that throw are skipped once per session and rolled back; the next effect still applies', async ({ page }) => {
  await openHarness(page);
  const m = await image(page, 64, 64, [200, 40, 10], { right: [10, 120, 250] });
  await register(page, 'sepia', 'throwing');
  await register(page, 'glow', 'throwsMidway');
  await register(page, 'vhs', 'badVector');
  await register(page, 'invert', 'invert');
  const p = (effects: VideoEffect[]) => layered(square(64), [m], [clipOf(m, { out: 1, effects })]);
  const [plain] = await render(page, p([]), [0]);
  const first = await renderEffects(page, p([fx('sepia'), fx('glow'), fx('vhs')]), [0, 0.5]);
  expect(first.error).toBeNull();
  expect(first.unavailable).toEqual(['sepia', 'glow', 'vhs']);
  expect(first.unavailableTypes).toEqual(['sepia', 'glow', 'vhs']);
  for (const f of first.frames) expect(f.data).toEqual(plain.data);
  // Later compositors (an export) skip them silently; glow's half-done pass must not leak into the result.
  const after = await renderEffects(page, p([fx('sepia'), fx('glow'), fx('invert'), fx('vhs')]), [0]);
  const only = await renderEffects(page, p([fx('invert')]), [0]);
  expect(after.unavailable).toEqual([]);
  expect(after.passes).toEqual([1]);
  expect(after.frames[0].data).toEqual(only.frames[0].data);
});

test('two image clips with effects in one frame, at the same and at different working sizes', async ({ page }) => {
  await openHarness(page);
  const a = await image(page, 64, 64, [200, 40, 10], { right: [10, 120, 250], bottom: [0, 255, 0] });
  const b = await image(page, 64, 64, [90, 90, 30], { bottom: [250, 0, 200] });
  const small = await image(page, 16, 8, [20, 200, 90], { right: [255, 255, 0] });
  await register(page, 'invert', 'invert');
  const left = clipOf(a, { out: 1, effects: [fx('invert')], transform: { scale: 0.5, x: -16 } });
  for (const [other, label] of [[b, 'same size'], [small, 'different sizes']] as const) {
    const right = clipOf(other, { out: 1, effects: [fx('invert')], transform: { scale: 0.5, x: 16 } });
    const both = await renderEffects(page, layered(square(64), [a, other], [left, right]), [0, 0.5]);
    const onlyLeft = await renderEffects(page, layered(square(64), [a], [left]), [0]);
    const onlyRight = await renderEffects(page, layered(square(64), [other], [right]), [0]);
    expect(both.passes, label).toEqual([2, 4]);
    for (const f of both.frames) expectUnion(f, [onlyLeft.frames[0], onlyRight.frames[0]], label);
  }
});

test('one video source used by two clips with effects in one frame', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'quad.mp4')]);
  await register(page, 'invert', 'invert');
  const format = { width: m.width!, height: m.height!, fps: 30 };
  const half = m.width! / 4;
  const left = clipOf(m, { effects: [fx('invert')], transform: { scale: 0.5, x: -half } });
  const right = clipOf(m, { effects: [fx('invert')], transform: { scale: 0.5, x: half } });
  const both = await renderEffects(page, layered(format, [m], [left, right]), [0.25, 0.5]);
  const onlyLeft = await renderEffects(page, layered(format, [m], [left]), [0.25, 0.5]);
  const onlyRight = await renderEffects(page, layered(format, [m], [right]), [0.25, 0.5]);
  expect(both.passes).toEqual([2, 4]);
  for (const i of [0, 1]) expectUnion(both.frames[i], [onlyLeft.frames[i], onlyRight.frames[i]], `shared source, frame ${i}`);
});
