// Plan 5B Task 10: format switches with preset clips (D12): 16:9 -> 9:16 -> 1:1 -> 16:9 in the real app. The preset
// stacks and loops are untouched (their distances are format fractions), position keys AND their tangents scale like
// x/y, the round trip restores the project (1e-9) and every preview pixel; one undo step per switch.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';
import { presetStack } from './preset-robust-helpers';
import { clipById, depth, expectSameFrames, load, openWithImages, present, snapshots } from './robust-helpers';
import type { Clip, Project } from '../../src/core/model';

test.setTimeout(120_000);

const SIZES = { vertical: [1080, 1920], square: [1080, 1080] } as const;

function expectClose(a: unknown, b: unknown, tol: number, path = '$'): void {
  if (typeof a === 'number' && typeof b === 'number') {
    expect(Math.abs(a - b), `${path}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);
    return;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    expect(a, path).toEqual(b);
    return;
  }
  expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
  for (const k of Object.keys(a)) expectClose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tol, `${path}.${k}`);
}

function expectReframed(c: Clip, c0: Clip, w: number, h: number): void {
  const rx = w / 1920;
  const ry = h / 1080;
  c.keys!.position!.forEach((q, i) => {
    const o = c0.keys!.position![i];
    expect(q.x).toBeCloseTo(o.x * rx, 9);
    expect(q.y).toBeCloseTo(o.y * ry, 9);
    expect(q.in!.x).toBeCloseTo(o.in!.x * rx, 9);
    expect(q.in!.y).toBeCloseTo(o.in!.y * ry, 9);
    expect(q.out!.x).toBeCloseTo(o.out!.x * rx, 9);
    expect(q.out!.y).toBeCloseTo(o.out!.y * ry, 9);
  });
  expect(c.keys!.loops).toEqual(c0.keys!.loops);
  expect(c.keys!.orient).toBe(true);
  expect(c.motion).toEqual(c0.motion); // fractions of the format: nothing to scale
}

test('16:9 -> 9:16 -> 1:1 -> 16:9 with preset clips: stacks kept, path tangents scale, the round trip restores data and pixels', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, presetStack(await openWithImages(page)));
  await page.evaluate(() => window.__clipforge!.getState().select(['img']));
  const times = [0.6, 1.2, 1.7, 2.4, 3.3];
  const before = await snapshots(page, times);
  const p0: Project = await present(page);
  const clip0 = (id: string) => p0.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;
  const d = await depth(page);
  for (const [i, key] of (['vertical', 'square'] as const).entries()) {
    await page.getByTestId('format-select').selectOption(key);
    const [w, h] = SIZES[key];
    expect((await present(page)).format).toEqual({ width: w, height: h, fps: 30 });
    expect(await depth(page)).toBe(d + i + 1);
    for (const id of ['img', 'ov']) expectReframed(await clipById(page, id), clip0(id), w, h);
    expect((await clipById(page, 'adj')).motion).toEqual(clip0('adj').motion);
  }
  await page.getByTestId('format-select').selectOption('youtube');
  expectClose(await present(page), p0, 1e-9);
  expectSameFrames(before, await snapshots(page, times), 'format round trip', 1);
  for (let i = 0; i < 3; i++) await page.getByTestId('btn-undo').click();
  expect(JSON.stringify(await present(page))).toBe(JSON.stringify(p0));
  expect(errors).toEqual([]);
});
