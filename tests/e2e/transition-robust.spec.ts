// Plan 5C Task 7: edge cases and budgets. Handles clamp (never extend a clip), stills have no limit, a long-GOP handle seek
// shows the right picture at the first window frame (never black), a 4K transition frame stays inside the composite memory
// budget without touching the effect pool, and three simultaneous transitions hold six decoders in the export.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, px, render } from './harness-helpers';
import { COMPOSITE_BYTE_BUDGET } from '../../src/render/compositeBuffer';
import { NOT_ENOUGH_FOOTAGE } from '../../src/core/transitionTypes';
import { addTransition } from '../../src/core/transitionEdits';
import type { MediaRef, Project } from '../../src/core/model';

test.setTimeout(240_000);

const dir = ensureFixtures();
const solid = (page: Page, w: number, h: number, rgb: [number, number, number]): Promise<MediaRef> =>
  page.evaluate(({ w, h, rgb }) => window.cf.putImageMedia(w, h, rgb), { w, h, rgb });
/** Renders in the page and returns only the numbers (4K pixel arrays would not survive the trip to the test process). */
const renderBlend = (page: Page, ps: Project[], times: number[], canvas: { width: number; height: number }) =>
  page.evaluate(async ({ ps, times, canvas }) => {
    const r = await window.cf.renderBlend(ps, times, { canvas });
    return { error: r.error, frames: r.frames.map((f) => ({ compositeMemory: f.compositeMemory, effectPasses: f.effectPasses, glError: f.glError })) };
  }, { ps, times, canvas });

test('a 3-frame handle clamps a 1 s request to 6 frames; no footage at all refuses with the plain message', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'with-audio.mp4')]); // 3 s
  // a plays footage 0..1.9 (handle after = 1.1 s), b plays 0.1..2 (3 frames, 0.1 s, before): the window is limited by b.
  const a = clipOf(m, { id: 'a', start: 0, in: 0, out: 1.9 });
  const b = clipOf(m, { id: 'b', start: 1.9, in: 0.1, out: 2 });
  const p = project({ width: 64, height: 36, fps: 30 }, [m], [a, b]);
  const q = addTransition(p, p.tracks[0].id, 'a', 'b', { type: 'dissolve', duration: 1, ease: { kind: 'linear' } });
  expect(q.tracks[0].transitions![0].duration).toBeCloseTo(6 / 30, 9);
  // b starts at footage 0: no handle before it.
  const b0 = clipOf(m, { id: 'b', start: 1.9, in: 0, out: 2 });
  const p0 = project({ width: 64, height: 36, fps: 30 }, [m], [a, b0]);
  expect(() => addTransition(p0, p0.tracks[0].id, 'a', 'b', { type: 'dissolve', duration: 1, ease: { kind: 'linear' } })).toThrow(NOT_ENOUGH_FOOTAGE);
});

test('stills have no handle limit: a 5 s dissolve between two images renders mid-window as the 50/50 mix', async ({ page }) => {
  await openHarness(page);
  const [r, b] = await Promise.all([solid(page, 64, 36, [255, 0, 0]), solid(page, 64, 36, [0, 0, 255])]);
  const a = clipOf(r, { id: 'a', start: 0, in: 0, out: 6, transform: { scale: 1 } });
  const c = clipOf(b, { id: 'c', start: 6, in: 0, out: 6, transform: { scale: 1 } });
  const p = project({ width: 64, height: 36, fps: 30 }, [r, b], [a, c]);
  const q = addTransition(p, p.tracks[0].id, 'a', 'c', { type: 'dissolve', duration: 5, ease: { kind: 'linear' } });
  expect(q.tracks[0].transitions![0].duration).toBe(5);
  const [f] = await render(page, q, [6]);
  const px0 = px(f, 32, 18);
  expect(Math.abs(px0[0] - 128)).toBeLessThanOrEqual(3);
  expect(Math.abs(px0[2] - 128)).toBeLessThanOrEqual(3);
});

test('a long-GOP handle seek: the first window frames show the incoming clip, never black', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'long-gop.mp4')]); // 10 s, one key frame per 300 frames
  const a = clipOf(m, { id: 'a', start: 0, in: 0, out: 4, transform: { scale: 0.1 } });
  const b = clipOf(m, { id: 'b', start: 4, in: 5, out: 9, transform: { scale: 0.1 } });
  const p = project({ width: 96, height: 54, fps: 30 }, [m], [a, b]);
  const q = addTransition(p, p.tracks[0].id, 'a', 'b', { type: 'wipe', direction: 'right', softness: 0, duration: 0.6, ease: { kind: 'linear' } });
  // The window starts at 3.7 s: B's picture comes from footage 4.7 s (deep inside the GOP). At e = 0.5 (3.97+) the left half is B.
  const frames = await render(page, q, [3.7 + 10 / 30, 3.7 + 14 / 30]);
  for (const f of frames) {
    let lum = 0;
    for (let y = 18; y < 36; y++) for (let x = 6; x < 30; x++) lum += px(f, x, y).reduce((s, v) => s + v, 0);
    expect(lum / (18 * 24 * 3), 'incoming picture region is not black').toBeGreaterThan(8);
  }
});

test('a 4K transition frame stays inside the composite budget and does not touch the effect pool', async ({ page }) => {
  await openHarness(page);
  const [r, b] = await Promise.all([solid(page, 64, 36, [255, 0, 0]), solid(page, 64, 36, [0, 0, 255])]);
  const a = clipOf(r, { id: 'a', start: 0, in: 0, out: 2, transform: { scale: 20 } });
  const c = clipOf(b, { id: 'c', start: 2, in: 0, out: 2, transform: { scale: 20 } });
  const p = project({ width: 3840, height: 2160, fps: 30 }, [r, b], [a, c]);
  const q = addTransition(p, p.tracks[0].id, 'a', 'c', { type: 'dissolve', duration: 1, ease: { kind: 'linear' } });
  const withT = await renderBlend(page, [q], [2], { width: 3840, height: 2160 });
  const without = await renderBlend(page, [p], [2], { width: 3840, height: 2160 });
  expect(withT.error).toBeNull();
  const s = withT.frames[0];
  console.log(`4K transition frame: ${s.compositeMemory.targets} targets, ${(s.compositeMemory.bytes / 1048576).toFixed(1)} MiB, effect passes ${s.effectPasses} (plain ${without.frames[0].effectPasses})`);
  expect(s.compositeMemory.bytes).toBeLessThanOrEqual(COMPOSITE_BYTE_BUDGET);
  // A Normal-mode transition needs 4 targets and 4K stays at full size (a fifth target would scale the composite down).
  expect(s.compositeMemory.targets).toBe(4);
  expect(s.compositeMemory.bytes).toBe(4 * 3840 * 2160 * 4);
  expect(s.effectPasses).toBe(without.frames[0].effectPasses);
  expect(s.glError).toBe(0);
});

test('three simultaneous transitions on three tracks hold six decoders in the export', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'with-audio.mp4')]);
  const mkTrack = (n: number) => {
    const a = clipOf(m, { id: `a${n}`, start: 0, in: 0.5, out: 2 });
    const b = clipOf(m, { id: `b${n}`, start: 1.5, in: 0.5, out: 2 });
    return { a, b };
  };
  let p = project({ width: 128, height: 72, fps: 30 }, [m], []);
  const base = p.tracks[0];
  const pairs = [1, 2, 3].map(mkTrack);
  p = {
    ...p,
    tracks: [
      ...pairs.map(({ a, b }, i) => ({ ...base, id: `v${i}`, clips: [a, b] })),
      ...p.tracks.slice(1),
    ],
  };
  for (const [i, { a, b }] of pairs.entries()) {
    p = addTransition(p, `v${i}`, a.id, b.id, { type: 'dissolve', duration: 0.6, ease: { kind: 'linear' } });
  }
  const r = await page.evaluate(async (p) => {
    window.cf.resetVideoSourceStats();
    const out = await window.cf.runExport(p, { maxLongSide: 128 });
    if (out.error) throw new Error(out.error.message);
    return { peak: window.cf.videoSourceStats().peak, open: window.cf.videoSourceStats().open };
  }, p);
  expect(r.peak).toBe(6);
  expect(r.open).toBe(0);
});
