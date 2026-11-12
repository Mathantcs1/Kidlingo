// Plan 5 Task 11: format switches with animated clips (D9, Ruling J): 16:9 -> 9:16 -> 1:1 -> 16:9 in the real app.
// Position keys scale like x/y and scale keys like scale on the image AND the sticker overlay (overlay scale keys are
// format-relative and stay); rotation, opacity, effect and adjustment-layer keys are untouched; the motion path follows
// each format; the round trip restores every key (1e-9) and every preview pixel.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { canvasBox } from './pip-helpers';
import { animatedStack, clipById, depth, expectSameFrames, load, openWithImages, present, snapshots } from './robust-helpers';
import type { Clip, Project } from '../../src/core/model';

test.setTimeout(120_000);

const SIZES = { youtube: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] } as const;

/** Every number in `a` within `tol` of the one at the same place in `b` (same shape otherwise). */
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

/** The motion-path dots of the selected clip in FORMAT px (from their page position and the displayed canvas box). */
async function dots(page: Page): Promise<{ x: number; y: number }[]> {
  const b = await canvasBox(page);
  const boxes = await page.getByTestId('motion-key').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }));
  return boxes.map((p) => ({ x: (p.x - b.left) / b.s, y: (p.y - b.top) / b.s }));
}

/** The keys `c0` must have after reframing from 1920×1080 to w×h (x·rx, y·ry, scale·√(rx·ry) unless an overlay). */
function expectReframed(c: Clip, c0: Clip, w: number, h: number): void {
  const rx = w / 1920;
  const ry = h / 1080;
  c.keys!.position!.forEach((q, i) => {
    expect(q.x).toBeCloseTo(c0.keys!.position![i].x * rx, 9);
    expect(q.y).toBeCloseTo(c0.keys!.position![i].y * ry, 9);
  });
  const k = c.kind === 'overlay' ? 1 : Math.sqrt(rx * ry);
  c.keys!.scale!.forEach((q, i) => expect(q.v).toBeCloseTo(c0.keys!.scale![i].v * k, 9));
  expect(c.keys!.rotation).toEqual(c0.keys!.rotation);
  expect(c.keys!.opacity).toEqual(c0.keys!.opacity);
  expect(c.effects).toEqual(c0.effects);
}

test('16:9 -> 9:16 -> 1:1 -> 16:9 with animated clips: keys follow each format, the round trip restores keys and pixels', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, animatedStack(await openWithImages(page)));
  await page.evaluate(() => window.__clipforge!.getState().select(['img']));
  const times = [0.6, 1.2, 2, 2.8, 3.4];
  const before = await snapshots(page, times);
  const p0: Project = await present(page);
  const clip0 = (id: string) => p0.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;
  // The last key sits on the clip's end (end exclusive, T10-4): two dots.
  await expect(page.getByTestId('motion-key')).toHaveCount(2);
  const dots0 = await dots(page);
  const d = await depth(page);

  for (const [i, key] of (['vertical', 'square'] as const).entries()) {
    await page.getByTestId('format-select').selectOption(key);
    const [w, h] = SIZES[key];
    expect((await present(page)).format).toEqual({ width: w, height: h, fps: 30 });
    expect(await depth(page)).toBe(d + i + 1);
    for (const id of ['img', 'ov']) expectReframed(await clipById(page, id), clip0(id), w, h);
    expect(await clipById(page, 'adj')).toEqual(clip0('adj'));
    // The motion path sits on the reframed keys: centre + key offset, in the new format's pixels.
    const img = await clipById(page, 'img');
    await expect.poll(async () => (await dots(page)).length).toBe(2);
    (await dots(page)).forEach((q, j) => {
      expect(Math.abs(q.x - (w / 2 + img.keys!.position![j].x)), `dot ${j} x in ${key}`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(q.y - (h / 2 + img.keys!.position![j].y)), `dot ${j} y in ${key}`).toBeLessThanOrEqual(1.5);
    });
  }

  await page.getByTestId('format-select').selectOption('youtube');
  const p1 = await present(page);
  expectClose(p1, p0, 1e-9);
  expectSameFrames(before, await snapshots(page, times), 'format round trip', 1);
  (await dots(page)).forEach((q, j) => expect(Math.hypot(q.x - dots0[j].x, q.y - dots0[j].y)).toBeLessThanOrEqual(0.5));
  // One undo step per switch.
  for (let i = 0; i < 3; i++) await page.getByTestId('btn-undo').click();
  expect(JSON.stringify(await present(page))).toBe(JSON.stringify(p0));
  expect(errors).toEqual([]);
});
