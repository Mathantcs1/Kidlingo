// Per-clip blend modes through the real compositor (Plan 4 Task 11a): two solid-colour layers match blendPixel for
// every mode; soft edges have no halo; normal-only frames keep the direct path (no composite, byte-identical);
// blend + effects; letterboxing; the composite is freed when idle; a lost context fails plainly.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipOf, openHarness, px, render } from './harness-helpers';
import { edgeImage } from './colour-helpers';
import { newTrack } from '../../src/core/model';
import type { BlendMode, Clip, MediaRef, Project, VideoEffect } from '../../src/core/model';
import { BLEND_MODES, defaultParams } from '../../src/core/videoEffects';
import { blendPixel } from '../../src/render/blend';
import type { Rgba } from '../../src/render/blend';
import { COMPOSITE_IDLE_FRAMES } from '../../src/render/compositeBuffer';

type Rgb = [number, number, number];
const FMT = { width: 64, height: 64, fps: 30 };

/** `top` (with `over`) on the track above a full-frame `bottom`; `extra` tracks above both. */
function layered(bottom: MediaRef, top: MediaRef, over: Partial<Clip> = {}, hidden = false): Project {
  const bg = { ...newTrack('video'), id: 'bg', clips: [clipOf(bottom, { id: 'bg-clip', out: 1 })] };
  const fg = { ...newTrack('video'), id: 'fg', hidden, clips: [clipOf(top, { id: 'fg-clip', out: 1, ...over })] };
  return {
    version: 4, format: FMT, tracks: [bg, fg, { ...newTrack('audio'), id: 'audio' }],
    media: { [bottom.id]: bottom, [top.id]: top },
  };
}

const solid = (page: Page, w: number, h: number, rgb: Rgb): Promise<MediaRef> =>
  page.evaluate(({ w, h, rgb }) => window.cf.putImageMedia(w, h, rgb), { w, h, rgb });

const renderBlend = (page: Page, ps: Project[], times: number[], opts: { canvas?: { width: number; height: number }; loseAfter?: number } = {}) =>
  page.evaluate(({ ps, times, opts }) => window.cf.renderBlend(ps, times, opts), { ps, times, opts });

/** blendPixel on 0..255 straight colours with alphas (0..1), as 0..255 RGB over an opaque backdrop. */
function expected(mode: BlendMode, b: Rgb, s: Rgb, alpha = 1): number[] {
  const back: Rgba = [b[0] / 255, b[1] / 255, b[2] / 255, 1];
  const src: Rgba = [(s[0] / 255) * alpha, (s[1] / 255) * alpha, (s[2] / 255) * alpha, alpha];
  return blendPixel(mode, back, src).slice(0, 3).map((v) => v * 255);
}

function expectWithin(actual: number[], want: number[], tol: number, msg: string): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(actual[k] - want[k]), `${msg}: ${actual} vs ${want.map((v) => v.toFixed(1))}`).toBeLessThanOrEqual(tol);
}

// Two colour pairs between them reach both branches of overlay, hard/soft light, dodge and burn.
const PAIRS: [Rgb, Rgb][] = [
  [[51, 153, 230], [153, 64, 200]],
  [[230, 40, 128], [20, 220, 100]],
];

test('every blend mode: two solid layers match blendPixel within 2/255; outside the top layer stays the backdrop', async ({ page }) => {
  await openHarness(page);
  const projects: Project[] = [];
  const cases: [BlendMode, Rgb, Rgb, number][] = [];
  for (const [b, s] of PAIRS) {
    const [bottom, top] = await Promise.all([solid(page, 64, 64, b), solid(page, 32, 32, s)]);
    for (const mode of BLEND_MODES) {
      for (const opacity of [1, 0.5]) {
        projects.push(layered(bottom, top, { blend: mode, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity } }));
        cases.push([mode, b, s, opacity]);
      }
    }
  }
  const r = await renderBlend(page, projects, projects.map(() => 0.5));
  expect(r.error).toBeNull();
  let worst = 0;
  r.frames.forEach((f, i) => {
    const [mode, b, s, opacity] = cases[i];
    expect(f.glError).toBe(0);
    const want = expected(mode, b, s, opacity);
    for (const [x, y] of [[32, 32], [20, 20], [43, 43]]) {
      const got = px(f, x, y);
      worst = Math.max(worst, ...got.map((v, k) => Math.abs(v - want[k])));
      expectWithin(got, want, 2, `${mode} opacity ${opacity} at ${x},${y}`);
    }
    // Outside the 32x32 top layer the backdrop is copied exactly.
    expect(px(f, 4, 4), `${mode} outside`).toEqual(b);
  });
  console.log(`blend modes: worst |GL - blendPixel| = ${worst.toFixed(2)}/255 over ${r.frames.length} frames`);
  // Normal frames take the direct path: only the 22 non-normal frames ran a blend pass (one each).
  expect(r.frames.at(-1)!.blendPasses).toBe((BLEND_MODES.length - 1) * 2 * PAIRS.length);
});

test('a half-transparent source edge blends with its straight colour (no halo) and transparency keeps the backdrop', async ({ page }) => {
  await openHarness(page);
  const C: Rgb = [200, 120, 60];
  const B: Rgb = [40, 160, 220];
  const top = await edgeImage(page, C);
  const bottom = await solid(page, 64, 64, B);
  const modes: BlendMode[] = ['multiply', 'screen', 'difference', 'softLight'];
  const r = await renderBlend(page, modes.map((blend) => layered(bottom, top, { blend })), modes.map(() => 0.5));
  r.frames.forEach((f, i) => {
    // Columns: 0-31 opaque, 32-39 alpha 128/255, 40-43 alpha 38/255, 44+ transparent.
    for (const [x, a] of [[10, 1], [35, 128 / 255], [42, 38 / 255]] as const) {
      expectWithin(px(f, x, 30), expected(modes[i], B, C, a), 3, `${modes[i]} column ${x}`);
    }
    expect(px(f, 56, 30), `${modes[i]} transparent column`).toEqual(B);
  });
});

test('normal-only frames never touch the composite and render byte-identically, also after blended frames', async ({ page }) => {
  await openHarness(page);
  const [bottom, top] = await Promise.all([solid(page, 64, 64, [51, 153, 230]), solid(page, 32, 32, [153, 64, 200])]);
  const normal = layered(bottom, top);
  const multiply = layered(bottom, top, { blend: 'multiply' });
  const hiddenMultiply = layered(bottom, top, { blend: 'multiply' }, true);
  const hiddenNormal = layered(bottom, top, {}, true);
  const [fresh] = await render(page, normal, [0.5]);
  const [freshHidden] = await render(page, hiddenNormal, [0.5]);
  // normal, multiply, normal again, hidden multiply, a multiply clip outside its time range (t = 2).
  const r = await renderBlend(page, [normal, multiply, normal, hiddenMultiply, multiply], [0.5, 0.5, 0.5, 0.5, 2]);
  const [first, blended, again, hidden, outside] = r.frames;
  expect(first.blendPasses).toBe(0);
  expect(first.compositeMemory).toEqual({ targets: 0, bytes: 0 });
  expect(first.data).toEqual(fresh.data);
  expect(blended.blendPasses).toBe(1);
  expect(blended.compositeMemory).toEqual({ targets: 3, bytes: 3 * 64 * 64 * 4 });
  expect(blended.data).not.toEqual(fresh.data);
  expect(again.data).toEqual(fresh.data);
  expect(hidden.data).toEqual(freshHidden.data);
  expect(outside.blendPasses).toBe(1);
  // The composite is kept while scrubbing, then freed after COMPOSITE_IDLE_FRAMES normal frames in a row.
  expect(outside.compositeMemory.targets).toBe(3);
  const idle = await renderBlend(page, [multiply, normal], Array.from({ length: COMPOSITE_IDLE_FRAMES + 1 }, () => 0.5));
  expect(idle.frames[COMPOSITE_IDLE_FRAMES - 1].compositeMemory.targets).toBe(3);
  expect(idle.frames[COMPOSITE_IDLE_FRAMES].compositeMemory).toEqual({ targets: 0, bytes: 0 });
});

let n = 0;
const fx = (type: VideoEffect['type']): VideoEffect => ({ id: `bfx-${++n}`, type, enabled: true, params: defaultParams(type) });

test('blend + effects: the effect stack runs first, then the result blends; letterboxed canvases keep black bars', async ({ page }) => {
  await openHarness(page);
  const B: Rgb = [51, 153, 230];
  const S: Rgb = [153, 64, 200];
  const [bottom, top] = await Promise.all([solid(page, 64, 64, B), solid(page, 32, 32, S)]);
  const inverted: Rgb = [255 - S[0], 255 - S[1], 255 - S[2]];
  const p = layered(bottom, top, { blend: 'multiply', effects: [fx('invert')] });
  const r = await renderBlend(page, [p, p], [0.5, 0.5]);
  expect(r.frames[0].effectPasses).toBe(1);
  expectWithin(px(r.frames[0], 32, 32), expected('multiply', B, inverted), 2, 'invert then multiply');
  // A blended blur-fit clip draws its backdrop into the layer, not onto the canvas.
  const blurFit = layered(bottom, top, { blend: 'screen', fit: 'blur' });
  const [blurred] = (await renderBlend(page, [blurFit], [0.5])).frames;
  expect(blurred.glError).toBe(0);
  expect(blurred.blendPasses).toBe(1);
  expectWithin(px(blurred, 32, 32), expected('screen', B, S), 2, 'blur-fit clip blended');
  // 96x64 canvas: the 64x64 picture sits at x 16..80 with black bars.
  const wide = await renderBlend(page, [layered(bottom, top, { blend: 'difference' })], [0.5], { canvas: { width: 96, height: 64 } });
  const f = wide.frames[0];
  expect([f.width, f.height]).toEqual([96, 64]);
  expect(px(f, 4, 32)).toEqual([0, 0, 0]);
  expect(px(f, 92, 32)).toEqual([0, 0, 0]);
  expectWithin(px(f, 48, 32), expected('difference', B, S), 2, 'letterboxed centre');
  expectWithin(px(f, 20, 4), B, 1, 'letterboxed backdrop');
});

test('a context lost before a blended frame fails with the plain "WebGL context lost"', async ({ page }) => {
  await openHarness(page);
  const [bottom, top] = await Promise.all([solid(page, 64, 64, [10, 20, 30]), solid(page, 32, 32, [200, 100, 50])]);
  const p = layered(bottom, top, { blend: 'screen' });
  const r = await renderBlend(page, [p], [0.5, 0.5], { loseAfter: 1 });
  expect(r.frames).toHaveLength(1);
  expect(r.error).toBe('WebGL context lost');
});
