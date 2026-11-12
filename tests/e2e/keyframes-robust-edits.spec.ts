// Plan 5 Task 11: clip operations on animated clips in the REAL app keep the picture where the core says they must
// (D3/D9, §3.3): split and trims at a WHOLE number of frames from the clip start (Ruling P5-5) leave every frame
// unchanged; move, ripple delete and join shift the animation with the clip. Sourced image clips (in ≠ 0), a
// sourceless sticker overlay and an adjustment layer, every transform property, colour and invert params keyed.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { center, clipEl, trackErrors } from './helpers';
import { imageClip } from './keyframe-helpers';
import {
  FPS, animate, animatedStack, clipById, depth, expectSameFrames, layered, load, openWithImages, presentJson, snapshots,
} from './robust-helpers';

test.setTimeout(180_000);

const at = (frames: number[]): number[] => frames.map((f) => f / FPS);

async function dragBy(page: Page, from: { x: number; y: number }, dx: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 6 });
  await page.mouse.up();
}

const handle = async (page: Page, id: string, edge: 'start' | 'end') => center(clipEl(page, id).getByTestId(`trim-${edge}`));

/** Undo restores the exact project (JSON) in one step. */
async function undoTo(page: Page, json: string, d: number): Promise<void> {
  await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(json);
  expect(await depth(page)).toBe(d);
}

test('split at a whole frame: every frame of the image, overlay and adjustment halves equals the unsplit clip', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, animatedStack(await openWithImages(page)));
  const times = at([16, 30, 59, 60, 61, 75, 90, 104]);
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
  // The sourceless right halves restart local time at 0: their keys moved by −1.5 s (D9).
  const ovRight = (await page.evaluate(() => window.__clipforge!.getState().history.present.tracks[2].clips[1]));
  expect(ovRight.keys!.opacity![0].t).toBeLessThan(0);
  await undoTo(page, json, d);
  expect(errors).toEqual([]);
});

test('trims by whole frames: start of the sourced image and the overlay, end of the adjustment layer', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, animatedStack(await openWithImages(page)));
  // Inside every trimmed range (0.7..3.3 s).
  const times = at([21, 30, 45, 60, 80, 98]);
  const before = await snapshots(page, times);
  const json = await presentJson(page);
  const d = await depth(page);
  // 12 px at 60 px/s = 0.2 s = 6 frames.
  await dragBy(page, await handle(page, 'img', 'start'), 12);
  await dragBy(page, await handle(page, 'ov', 'start'), 12);
  await dragBy(page, await handle(page, 'adj', 'end'), -12);
  expect(await depth(page)).toBe(d + 3);
  expectSameFrames(before, await snapshots(page, times), 'trim');
  const [img, ov, adj] = await Promise.all(['img', 'ov', 'adj'].map((id) => clipById(page, id)));
  // Each cut is a whole number of frames from the clip start (Ruling P5-5).
  const got = [img.start, img.in, ov.start, ov.in, adj.start + adj.out];
  [0.7, 0.6, 0.7, 0, 3.3].forEach((v, i) => expect(got[i]).toBeCloseTo(v, 9));
  expect(ov.keys!.position![0].t).toBeCloseTo(-0.2, 12); // sourceless start trim shifts keys by −Δ (D3)
  expect(img.keys).toEqual((JSON.parse(json) as { tracks: { clips: { keys: unknown }[] }[] }).tracks[1].clips[0].keys); // sourced: unchanged
  for (let i = 0; i < 3; i++) await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(json);
  expect(errors).toEqual([]);
});

test('move: dragging the image and the overlay 0.5 s later shifts their animation with them', async ({ page }) => {
  const errors = trackErrors(page);
  const m = await openWithImages(page);
  const p = animatedStack(m);
  await load(page, layered([p.tracks[0].clips, p.tracks[1].clips, p.tracks[2].clips], Object.values(m)));
  const times = at([16, 30, 59, 75, 104]);
  const before = await snapshots(page, times);
  const d = await depth(page);
  await dragBy(page, await center(clipEl(page, 'img')), 30);
  await dragBy(page, await center(clipEl(page, 'ov')), 30);
  expect(await depth(page)).toBe(d + 2);
  expect([(await clipById(page, 'img')).start, (await clipById(page, 'ov')).start]).toEqual([1, 1]);
  expectSameFrames(before, await snapshots(page, times.map((t) => t + 0.5)), 'move');
  expect(errors).toEqual([]);
});

test('ripple delete and join close the gap before an animated clip: the animation moves with it', async ({ page }) => {
  const errors = trackErrors(page);
  const m = await openWithImages(page);
  const filler = imageClip(m.split, { id: 'filler' }, 0, 0.5);
  const img = animate(imageClip(m.green, { id: 'img', in: 0.4, out: 3.4 }, 1), 0.4, 3);
  const bg = imageClip(m.bg, { id: 'bg', transform: { x: 0, y: 0, scale: 10, rotation: 0, opacity: 1 } }, 0, 6);
  await load(page, layered([[bg], [filler, img]], Object.values(m)));
  const times = at([31, 45, 60, 89, 118]);
  const before = await snapshots(page, times);
  const json = await presentJson(page);
  const d = await depth(page);

  // Ripple delete the filler: img moves from 1.0 to 0.5 s.
  await page.evaluate(() => window.__clipforge!.getState().select(['filler']));
  await page.getByTestId('btn-ripple-delete').click();
  expect((await clipById(page, 'img')).start).toBe(0.5);
  expectSameFrames(before, await snapshots(page, times.map((t) => t - 0.5)), 'ripple delete');
  await undoTo(page, json, d);

  // Join filler + img: img moves back to back with the filler (0.5 s).
  await page.evaluate(() => window.__clipforge!.getState().select(['filler', 'img']));
  await page.getByTestId('btn-merge').click();
  expect((await clipById(page, 'img')).start).toBe(0.5);
  expect(await depth(page)).toBe(d + 1);
  expectSameFrames(before, await snapshots(page, times.map((t) => t - 0.5)), 'join');
  await undoTo(page, json, d);
  expect(errors).toEqual([]);
});
