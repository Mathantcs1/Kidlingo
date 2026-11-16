// Plan 5C Task 7: transitions with speed, reverse and a ramp. The handle of a retimed clip is read through the 5D time map
// (the fixture frame-index.mp4 encodes its frame number in grey levels, fixtures.ts): a wipe (softness 0, travelling right)
// shows the incoming picture on the LEFT of the frame (low digit, x = W/4) and the outgoing one on the RIGHT (high digit, x = 3W/4).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { SR } from './effect-helpers';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, px, render } from './harness-helpers';
import { sourceTimeAt, videoSourceTime, clipEnd } from '../../src/core/clipTime';
import { setRamp } from '../../src/core/speedEdits';
import { addTransition } from '../../src/core/transitionEdits';
import { splitClip } from '../../src/core/timeline';
import type { Clip, MediaRef, Project } from '../../src/core/model';

test.setTimeout(180_000);

const FMT = { width: 128, height: 72, fps: 30 };
const level = (rgb: number[]): number => Math.round((rgb[0] * 219) / 255 / 6);
type Img = { width: number; height: number; data: ArrayLike<number> };
const low = (f: Img): number => level(px(f, Math.floor(f.width / 4), Math.floor(f.height / 2)));
const high = (f: Img): number => level(px(f, Math.floor((3 * f.width) / 4), Math.floor(f.height / 2)));
const frameOf = (c: Clip, t: number): number => Math.floor(videoSourceTime(c, t, 30) * 30 + 1e-6);

function wipeProject(m: MediaRef, a: Clip, b: Clip, d: number): Project {
  const p = project(FMT, [m], [a, b]);
  return addTransition(p, p.tracks[0].id, a.id, b.id, { type: 'wipe', duration: d, direction: 'right', softness: 0, ease: { kind: 'linear' } });
}

/** Renders `times` and checks the incoming low digit (mod 32) and the outgoing high digit against the time map. */
async function check(page: Page, p: Project, a: Clip, b: Clip, times: number[]): Promise<void> {
  const frames = await render(page, p, times);
  frames.forEach((f, i) => {
    const t = times[i];
    const wantB = frameOf(p.tracks[0].clips.find((c) => c.id === b.id)!, t) % 32;
    const wantA = Math.floor(frameOf(p.tracks[0].clips.find((c) => c.id === a.id)!, t) / 32);
    expect(Math.abs(low(f) - wantB), `incoming low digit at ${t}`).toBeLessThanOrEqual(1);
    expect(Math.abs(high(f) - wantA), `outgoing high digit at ${t}`).toBeLessThanOrEqual(1);
  });
}

test('2x outgoing clip: its handle past `out` plays at 2x (frames 66 and 72 at 1.1 s and 1.2 s)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(ensureFixtures(), 'frame-index.mp4')]);
  const a = clipOf(m, { id: 'a', start: 0, in: 0, out: 2, speed: 2, transform: { scale: 1 } }); // 0..1 s, handle after: 2 s of footage = 1 s
  const b = clipOf(m, { id: 'b', start: 1, in: 1, out: 3, transform: { scale: 1 } });
  const p = wipeProject(m, a, b, 0.6);
  expect(frameOf(a, 1.1)).toBe(66);
  await check(page, p, a, b, [0.9, 1.0, 1.1, 1.2]);
});

test('0.5x reversed incoming clip: its handle BEFORE `start` continues past `out` (mirrored)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(ensureFixtures(), 'frame-index.mp4')]);
  const a = clipOf(m, { id: 'a', start: 0, in: 0, out: 1, transform: { scale: 1 } });
  const b = clipOf(m, { id: 'b', start: 1, in: 1, out: 2, speed: 0.5, reverse: true, transform: { scale: 1 } });
  const p = wipeProject(m, a, b, 0.6);
  expect(frameOf(b, 0.9)).toBeGreaterThan(60); // before the start the reversed clip is beyond `out` (footage 2 s = frame 60)
  await check(page, p, a, b, [0.9, 1.0, 1.1, 1.25]);
});

test('a ramp ending at the cut: the handle after the cut follows the ramp', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(ensureFixtures(), 'frame-index.mp4')]);
  let p = project(FMT, [m], [clipOf(m, { id: 'a', start: 0, in: 0, out: 2, transform: { scale: 1 } })]);
  const keys = [{ t: 0, v: 1, ease: { kind: 'linear' as const } }, { t: 2, v: 2, ease: { kind: 'linear' as const } }];
  p = setRamp(p, 'a', keys);
  const a = p.tracks[0].clips[0];
  const b = clipOf(m, { id: 'b', start: clipEnd(a), in: 1, out: 3, transform: { scale: 1 } });
  p = { ...p, tracks: [{ ...p.tracks[0], clips: [a, b] }, ...p.tracks.slice(1)] };
  p = addTransition(p, p.tracks[0].id, 'a', 'b', { type: 'wipe', duration: 0.6, direction: 'right', softness: 0, ease: { kind: 'linear' } });
  const c = clipEnd(a);
  expect(sourceTimeAt(a, c + 0.2)).toBeGreaterThan(2); // beyond the ramp's end: the handle plays on
  await check(page, p, a, b, [c - 0.1, c + 0.1, c + 0.2, c + 0.28]);
});

test('audio null test with speed: a constant-gain crossfade across a split of a 2x clip equals the unsplit clip', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [audioFixtures().noisy]);
  const clip = clipOf(m, { id: 'a', start: 0, in: 0, out: 4, speed: 2, preservePitch: false }); // 2 s
  let whole = project({ width: 64, height: 36, fps: 30 }, [m], []);
  whole = { ...whole, tracks: whole.tracks.map((t) => (t.kind === 'audio' ? { ...t, id: 'au', clips: [clip] } : t)) };
  let split = splitClip(whole, 'a', 1);
  const [l, r] = [...split.tracks.find((t) => t.id === 'au')!.clips].sort((x, y) => x.start - y.start);
  split = addTransition(split, 'au', l.id, r.id, { type: 'audio', duration: 0.4, audio: 'gain', ease: { kind: 'linear' } });
  const res = await page.evaluate(({ p, q, sr }) => window.cf.mixdownDiff(p, q, sr, 0, 2), { p: split, q: whole, sr: SR });
  console.log(`2x null test: max diff ${res!.diff.toExponential(2)} of peak ${res!.peak.toFixed(3)}`);
  expect(res!.peak).toBeGreaterThan(0.1);
  expect(res!.diff).toBeLessThan(2e-3);
});
