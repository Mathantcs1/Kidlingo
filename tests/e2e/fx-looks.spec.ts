// Plan 4 Task 8: the one-click looks, checked against the CPU reference and for their intended character.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openHarness, render } from './harness-helpers';
import type { Frame, Rgb } from './harness-helpers';
import { fx, image, oneClip } from './fx-helpers';
import { LOOK_KEYS } from '../../src/fx/looks';
import type { LookKey } from '../../src/fx/looks';
import { lookPixel } from '../../src/fx/reference';
import { clampFxParams } from '../../src/fx/params';
import type { MediaRef, VisualEffect } from '../../src/core/model';

test.setTimeout(240_000);
const N = 64;
const look = (key: LookKey, intensity = 1): VisualEffect => fx('look', { preset: LOOK_KEYS.indexOf(key), intensity });
const unit = (c: Rgb): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];
const bytes = (c: Rgb): Rgb => [c[0] * 255, c[1] * 255, c[2] * 255];

/** Mean of the central 24x24 block (clear of any vignette, averaging out grain). */
function blockMean(f: Frame): Rgb {
  const s = [0, 0, 0];
  let n = 0;
  for (let y = N / 2 - 12; y < N / 2 + 12; y++) for (let x = N / 2 - 12; x < N / 2 + 12; x++, n++) for (let k = 0; k < 3; k++) s[k] += f.data[(y * f.width + x) * 4 + k];
  return s.map((v) => v / n) as Rgb;
}

const caches = new WeakMap<Page, Map<string, MediaRef>>();
async function patch(page: Page, rgb: Rgb): Promise<MediaRef> {
  const cache = caches.get(page) ?? new Map<string, MediaRef>();
  caches.set(page, cache);
  const key = String(rgb);
  const hit = cache.get(key);
  if (hit) return hit;
  const m = await image(page, N, N, rgb);
  cache.set(key, m);
  return m;
}

async function grade(page: Page, rgb: Rgb, stack: VisualEffect[]): Promise<Rgb> {
  const m = await patch(page, rgb);
  const p = { ...oneClip(m, stack), format: { width: N, height: N, fps: 10 } };
  return blockMean((await render(page, p, [0.5]))[0]);
}

const PATCHES: Rgb[] = [[128, 128, 128], [204, 77, 26], [26, 153, 230], [200, 160, 130]];
const dist = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('every look matches the CPU reference on colour patches and changes the picture', async ({ page }) => {
  await openHarness(page);
  for (const key of LOOK_KEYS) {
    let moved = 0;
    for (const rgb of PATCHES) {
      const got = await grade(page, rgb, [look(key)]);
      const want = bytes(lookPixel(unit(rgb), key, 1));
      const tol = key === 'film35' ? 5 : 3;
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - want[k]), `${key} ${rgb} ch${k}: ${got} vs ${want}`).toBeLessThanOrEqual(tol);
      moved += dist(got, rgb);
    }
    expect(moved / PATCHES.length, `${key} mean change`).toBeGreaterThanOrEqual(4);
  }
});

test('intensity 0 changes nothing and the change grows with intensity', async ({ page }) => {
  await openHarness(page);
  const src: Rgb = [200, 100, 50];
  for (const key of LOOK_KEYS) {
    const zero = await grade(page, src, [look(key, 0)]);
    expect(dist(zero, src), `${key} @0`).toBeLessThanOrEqual(2.5);
    let prev = -1;
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      const d = dist(await grade(page, src, [look(key, k)]), src);
      expect(d + 2.5, `${key} @${k}`).toBeGreaterThanOrEqual(prev);
      prev = Math.max(prev, d);
    }
  }
});

test('each look has its intended character on grey patches', async ({ page }) => {
  await openHarness(page);
  const DARK: Rgb = [40, 40, 40];
  const MID: Rgb = [128, 128, 128];
  const LIGHT: Rgb = [215, 215, 215];
  const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  const tealDark = await grade(page, DARK, [look('tealOrange')]);
  const tealLight = await grade(page, LIGHT, [look('tealOrange')]);
  expect(tealDark[2], 'teal-orange darks go blue').toBeGreaterThan(tealDark[0]);
  expect(tealLight[0], 'teal-orange lights go warm').toBeGreaterThan(tealLight[2]);

  const golden = await grade(page, MID, [look('goldenHour')]);
  expect(golden[0]).toBeGreaterThan(golden[2] + 10);

  expect(luma(await grade(page, MID, [look('moody')]))).toBeLessThan(luma(MID) - 10);

  const cyber = await grade(page, DARK, [look('cyberpunk')]);
  expect(cyber[2]).toBeGreaterThan(cyber[1] + 8);

  const dreamy = await grade(page, [0, 0, 0], [look('dreamy')]);
  expect(Math.min(...dreamy)).toBeGreaterThanOrEqual(12);

  for (const key of ['fashion', 'cleanVlog'] as const) {
    for (const rgb of PATCHES) {
      const got = await grade(page, rgb, [look(key)]);
      expect(dist(got, rgb) / Math.sqrt(3), `${key} ${rgb} stays within 40 levels`).toBeLessThanOrEqual(40);
    }
  }

  // Film 35mm has grain: a flat grey is no longer flat; Clean Vlog has none.
  const m = await patch(page, MID);
  const std = (f: Frame): number => {
    const v: number[] = [];
    for (let i = 0; i < f.data.length; i += 4) v.push(f.data[i + 1]);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  };
  const film = (await render(page, { ...oneClip(m, [look('film35')]), format: { width: N, height: N, fps: 10 } }, [0.5]))[0];
  const clean = (await render(page, { ...oneClip(m, [look('cleanVlog')]), format: { width: N, height: N, fps: 10 } }, [0.5]))[0];
  expect(std(film)).toBeGreaterThan(2);
  expect(std(clean)).toBeLessThan(1);
});

test('a look and a colour effect do not commute; clamped preset indices stay valid', async ({ page }) => {
  await openHarness(page);
  const src: Rgb = [160, 110, 70];
  const a = await grade(page, src, [look('tealOrange'), fx('color', { saturation: 0.8, brightness: 0.2 })]);
  const b = await grade(page, src, [fx('color', { saturation: 0.8, brightness: 0.2 }), look('tealOrange')]);
  expect(dist(a, b)).toBeGreaterThan(8);
  expect(clampFxParams('look', { preset: 99 }).preset).toBe(8);
});
