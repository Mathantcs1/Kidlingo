// Plan 5B Task 10: clip operations on clips carrying presets (In/Emphasis/Loop/Out), key loops and curved paths (spring
// ease, orient) in the REAL app (D12). Split and trims at a WHOLE number of frames (P5-5) leave every frame outside the
// moved entrance/exit windows unchanged; move, ripple delete and join shift the whole animation with the clip. The
// stack: a sourced image, a sourceless sticker overlay and an adjustment layer (opacity presets only), see presetStack.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { center, clipEl, trackErrors } from './helpers';
import { imageClip } from './keyframe-helpers';
import { presetStack } from './preset-robust-helpers';
import { FPS, clipById, depth, expectSameFrames, layered, load, openWithImages, presentJson, snapshots } from './robust-helpers';

test.setTimeout(240_000);

const at = (frames: number[]): number[] => frames.map((f) => f / FPS);

async function dragBy(page: Page, from: { x: number; y: number }, dx: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 6 });
  await page.mouse.up();
}
const handle = async (page: Page, id: string, edge: 'start' | 'end') => center(clipEl(page, id).getByTestId(`trim-${edge}`));

async function undoTo(page: Page, json: string, d: number): Promise<void> {
  await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(json);
  expect(await depth(page)).toBe(d);
}

test('split at a whole frame: every frame of the image, overlay and adjustment halves equals the unsplit clip; presets follow the right halves', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, presetStack(await openWithImages(page)));
  // The entrance (0.5..0.9) lies in the left halves, the exit (3.1..3.5) in the right ones; 1.0 and 2.0 sit on the
  // emphasis / loop; 1.97, 2.0 and 2.03 straddle the cut.
  const times = at([16, 30, 45, 59, 60, 61, 75, 90, 104]);
  const before = await snapshots(page, times);
  const json = await presentJson(page);
  const d = await depth(page);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.select(['img', 'ov', 'adj']);
    s.setPlayhead(2); // 45 frames after the clips' start (0.5 s)
  });
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(7);
  expect(await depth(page)).toBe(d + 1);
  expectSameFrames(before, await snapshots(page, times), 'split');
  const stacks = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks.slice(1, 4).map((t) => t.clips.map((c) => Object.keys(c.motion ?? {}).sort().join('+'))));
  // Left halves keep the entrance, the (earlier) emphasis and the loop; right halves the exit and the loop.
  expect(stacks).toEqual([['emphasis+in+loop', 'loop+out'], ['emphasis+in+loop', 'loop+out'], ['in+loop', 'loop+out']]);
  await undoTo(page, json, d);
  expect(errors).toEqual([]);
});

test('split of an overlay whose presets bound its scale: the geometry is unchanged (mean error under 1/255); only edge texels differ (Ruling T10-2)', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, presetStack(await openWithImages(page), { scaleBound: true }));
  const times = at([16, 30, 45, 59, 60, 61, 75, 90, 104]);
  const before = await snapshots(page, times);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.select(['ov']);
    s.setPlayhead(2);
  });
  await page.getByTestId('btn-split').click();
  const after = await snapshots(page, times);
  // The right half has no Pop (In stays on the left half), so its texture is sized smaller than the whole clip's: the
  // star's edge texels are resampled (no mipmaps), the shape and position are exact.
  const mean = before.map((a, i) => a.reduce((s, v, j) => s + Math.abs(v - after[i][j]), 0) / a.length);
  console.log(`overlay split with scale presets: mean error per frame ${mean.map((v) => v.toFixed(3)).join('/')}/255`);
  for (const [i, v] of mean.entries()) expect(v, `frame ${i}`).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('trims by whole frames: start of the image and the overlay, end of the adjustment layer keep every frame past the moved windows', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, presetStack(await openWithImages(page)));
  // 12 px at 60 px/s = 0.2 s = 6 frames. The entrance moves 0.2 s later (0.7..1.1) and the adjustment's exit 0.2 s
  // earlier (3.0..3.3): the checked frames lie between 1.2 and 2.9 s.
  const times = at([36, 45, 52, 60, 75, 85]);
  const before = await snapshots(page, times);
  const json = await presentJson(page);
  const d = await depth(page);
  await dragBy(page, await handle(page, 'img', 'start'), 12);
  await dragBy(page, await handle(page, 'ov', 'start'), 12);
  await dragBy(page, await handle(page, 'adj', 'end'), -12);
  expect(await depth(page)).toBe(d + 3);
  expectSameFrames(before, await snapshots(page, times), 'trim');
  const [img, ov, adj] = await Promise.all(['img', 'ov', 'adj'].map((id) => clipById(page, id)));
  const got = [img.start, img.in, ov.start, ov.in, adj.start + adj.out];
  [0.7, 0.6, 0.7, 0, 3.3].forEach((v, i) => expect(got[i]).toBeCloseTo(v, 9));
  // Sourced: the emphasis stays on the footage; sourceless start trim: emphasis -0.2 and loop phase +0.2 (D12).
  expect(img.motion!.emphasis!.at).toBe(1.2);
  expect(ov.motion!.emphasis!.at).toBeCloseTo(0.3, 9);
  expect(ov.motion!.loop!.phase).toBeCloseTo(0.2, 9);
  expect(img.motion!.in).toEqual((JSON.parse(json) as { tracks: { clips: { motion: { in: unknown } }[] }[] }).tracks[1].clips[0].motion.in);
  for (let i = 0; i < 3; i++) await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(json);
  expect(errors).toEqual([]);
});

test('move: dragging the image and the overlay 0.5 s later shifts the whole animation (presets included) with them', async ({ page }) => {
  const errors = trackErrors(page);
  const m = await openWithImages(page);
  await load(page, presetStack(m));
  const times = at([16, 30, 59, 75, 104]); // includes the entrance and exit windows: they move with the clip
  const before = await snapshots(page, times);
  const d = await depth(page);
  await dragBy(page, await center(clipEl(page, 'img')), 30);
  await dragBy(page, await center(clipEl(page, 'ov')), 30);
  expect(await depth(page)).toBe(d + 2);
  expect([(await clipById(page, 'img')).start, (await clipById(page, 'ov')).start]).toEqual([1, 1]);
  // The adjustment layer did not move: move it too (a setup edit) so the whole stack is the original shifted by 0.5 s.
  const moved = await presentJson(page);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v3' ? { ...t, clips: t.clips.map((c) => ({ ...c, start: 1 })) } : t)) }));
  });
  expectSameFrames(before, await snapshots(page, times.map((t) => t + 0.5)), 'move');
  await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(moved);
  expect(errors).toEqual([]);
});

test('ripple delete and join close the gap before a preset clip: the presets move with it (data and undo)', async ({ page }) => {
  const errors = trackErrors(page);
  const m = await openWithImages(page);
  const filler = imageClip(m.split, { id: 'filler' }, 0, 0.5);
  const stack = presetStack(m);
  const img = { ...stack.tracks[1].clips[0], start: 1 };
  const ov = { ...stack.tracks[2].clips[0], start: 1 };
  const bg = stack.tracks[0].clips[0];
  await load(page, layered([[bg], [filler, img], [ov]], Object.values(m)));
  const json = await presentJson(page);
  const d = await depth(page);

  await page.evaluate(() => window.__clipforge!.getState().select(['filler']));
  await page.getByTestId('btn-ripple-delete').click();
  expect((await clipById(page, 'img')).start).toBe(0.5);
  // Ripple deletes on the filler's track only: the overlay on its own layer stays at 1.0 s.
  expect((await clipById(page, 'ov')).start).toBe(1);
  await undoTo(page, json, d);
  await page.evaluate(() => window.__clipforge!.getState().select(['filler', 'img']));
  await page.getByTestId('btn-merge').click();
  expect((await clipById(page, 'img')).start).toBe(0.5);
  expect(await depth(page)).toBe(d + 1);
  expect((await clipById(page, 'img')).motion).toEqual(img.motion);
  await undoTo(page, json, d);
  expect(errors).toEqual([]);
});

test('a lone sourced clip with presets: ripple delete shifts every frame by exactly the gap', async ({ page }) => {
  const errors = trackErrors(page);
  const m = await openWithImages(page);
  const filler = imageClip(m.split, { id: 'filler' }, 0, 0.5);
  const stack = presetStack(m);
  const img = { ...stack.tracks[1].clips[0], start: 1 };
  const bg = stack.tracks[0].clips[0];
  await load(page, layered([[bg], [filler, img]], Object.values(m)));
  // The preset stack of the image includes in/out windows: every frame moves with the clip, loop/emphasis included.
  const times = at([31, 36, 45, 60, 80, 118]);
  const before = await snapshots(page, times);
  await page.evaluate(() => window.__clipforge!.getState().select(['filler']));
  await page.getByTestId('btn-ripple-delete').click();
  expectSameFrames(before, await snapshots(page, times.map((t) => t - 0.5)), 'ripple delete');
  expect(errors).toEqual([]);
});
