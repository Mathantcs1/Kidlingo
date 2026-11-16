// Plan 5C Task 6: audio crossfades on a transitioned cut through the real export mixdown and the live mixer: the null test
// (identical material crossfades into itself), the sqrt(2) bump of equal power, flat level for uncorrelated material, window
// seams and live == export. Clips sit on the audio track with `audio` transitions (the same code path as a video cut's sound).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { SR, effect } from './effect-helpers';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { addTransition } from '../../src/core/transitionEdits';
import type { Clip, MediaRef, Project } from '../../src/core/model';
import type { CrossfadeLaw } from '../../src/core/transitionTypes';

test.setTimeout(180_000);
const fx = audioFixtures();

/** Audio track with clip a (timeline 0..1) and clip b (1..2); with a transition of `d` s when given. */
function cut(a: MediaRef, aIn: number, b: MediaRef, bIn: number, tr?: { d: number; law?: CrossfadeLaw }, over: Partial<Clip> = {}): Project {
  const ca = clipOf(a, { id: 'a', start: 0, in: aIn, out: aIn + 1, ...over });
  const cb = clipOf(b, { id: 'b', start: 1, in: bIn, out: bIn + 1, ...over });
  let p = project({ width: 64, height: 36, fps: 30 }, [a, b].filter((m, i, l) => l.indexOf(m) === i), []);
  p = { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, id: 'au', clips: [ca, cb] } : t)) };
  return tr ? addTransition(p, 'au', 'a', 'b', { type: 'audio', duration: tr.d, audio: tr.law, ease: { kind: 'linear' } }) : p;
}

const diff = (page: Page, p: Project, q: Project, from: number, to: number) =>
  page.evaluate(({ p, q, sr, from, to }) => window.cf.mixdownDiff(p, q, sr, from, to), { p, q, sr: SR, from, to });
const rms = (page: Page, p: Project, windows: [number, number][]) =>
  page.evaluate(({ p, sr, windows }) => window.cf.mixdownChannelRms(p, sr, windows), { p, sr: SR, windows });

test('null test: constant gain crossfades continuous material into itself (the mix equals the uncut clip)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.noisy]);
  // a plays footage 0.5..1.5, b 1.5..2.5: the handles of both hold the same footage, so the crossfade of the sum is the signal.
  const xf = cut(m, 0.5, m, 1.5, { d: 0.5, law: 'gain' });
  const plain = cut(m, 0.5, m, 1.5);
  const r = await diff(page, xf, plain, 0, 2);
  console.log(`null test: max diff ${r!.diff.toExponential(2)} of peak ${r!.peak.toFixed(3)}`);
  expect(r!.peak).toBeGreaterThan(0.1);
  expect(r!.diff).toBeLessThan(2e-3);
});

test('equal power on identical material bumps the level by sqrt(2) at the centre; constant gain does not', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone440]);
  const centre: [number, number][] = [[0.95, 1.05]];
  const plain = (await rms(page, cut(m, 0.5, m, 1.5), centre))!.rms[0][0];
  const power = (await rms(page, cut(m, 0.5, m, 1.5, { d: 0.5, law: 'power' }), centre))!.rms[0][0];
  const gain = (await rms(page, cut(m, 0.5, m, 1.5, { d: 0.5, law: 'gain' }), centre))!.rms[0][0];
  console.log(`centre rms: plain ${plain.toFixed(4)} power ${power.toFixed(4)} gain ${gain.toFixed(4)}`);
  expect(power / plain).toBeGreaterThan(Math.SQRT2 * 0.97);
  expect(power / plain).toBeLessThan(Math.SQRT2 * 1.03);
  expect(Math.abs(gain / plain - 1)).toBeLessThan(0.03);
});

test('uncorrelated material with equal power keeps a flat level through the crossfade (within 1 dB)', async ({ page }) => {
  await openHarness(page);
  const [a, b] = await importPaths(page, [fx.tone440, fx.tone4k]);
  const p = cut(a, 0.5, b, 0.5, { d: 0.6, law: 'power' });
  const windows = Array.from({ length: 12 }, (_, i) => [0.5 + i * 0.1, 0.6 + i * 0.1] as [number, number]);
  const levels = (await rms(page, p, windows))!.rms.map(([l]) => l);
  const db = levels.map((l) => 20 * Math.log10(l / levels[0]));
  console.log(`flatness dB: ${db.map((v) => v.toFixed(2)).join(' ')}`);
  for (const v of db) expect(Math.abs(v)).toBeLessThan(1);
});

test('windows of 1 s and the whole mix are identical across the crossfade, no click at a cut inside the window', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.noisy]);
  for (const w of [0.7, 1]) {
    const p = cut(m, 0.5, m, 2.5, { d: 0.5, law: 'power' });
    const r = await page.evaluate(({ p, sr, w }) => window.cf.mixdownSeam(p, sr, w), { p, sr: SR, w });
    expect(r!.lengths[0]).toBe(r!.lengths[1]);
    expect(r!.maxDiff).toBeLessThan(1e-5);
  }
});

test('with a tail effect the gate follows the audible end: the outgoing clip still sounds in its handle', async ({ page }) => {
  await openHarness(page);
  const [a, b] = await importPaths(page, [fx.tone440, fx.tone4k]);
  const echo = [effect('echo')]; // a tail effect: its gate ramps closed at the audible end
  const p = cut(a, 0.5, b, 0.5, { d: 0.6, law: 'power' }, { audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: echo } });
  // The incoming clip is nearly silent, so the level over 1.02-1.12 s is the outgoing clip's handle (it would be 0 with the gate at the clip end).
  p.tracks = p.tracks.map((t) => (t.id === 'au' ? { ...t, clips: t.clips.map((c) => (c.id === 'b' ? { ...c, volume: 0.001 } : c)) } : t));
  const tail = (await rms(page, p, [[1.02, 1.12]]))!.rms[0][0];
  console.log(`handle level ${tail.toFixed(4)}`);
  expect(tail).toBeGreaterThan(0.05);
});

test('live mixer equals the export mix over a crossfade', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.noisy]);
  const p = cut(m, 0.5, m, 2.5, { d: 0.5, law: 'power' });
  const r = await page.evaluate(({ p, sr }) => window.cf.liveVersusMixdown(p, 2, 1, sr), { p, sr: SR });
  expect(r!.covered).toBe(true);
  expect(r!.peak).toBeGreaterThan(0.1);
  expect(r!.maxDiff).toBeLessThan(1e-3);
});

test('a speed-2 outgoing clip crossfades too (virtual time past D)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone440]);
  const ca = clipOf(m, { id: 'a', start: 0, in: 0.2, out: 2.2, speed: 2, preservePitch: false });
  const cb = clipOf(m, { id: 'b', start: 1, in: 1, out: 2 });
  let p = project({ width: 64, height: 36, fps: 30 }, [m], []);
  p = { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, id: 'au', clips: [ca, cb] } : t)) };
  p = addTransition(p, 'au', 'a', 'b', { type: 'audio', duration: 0.5, ease: { kind: 'linear' } });
  expect(p.tracks.find((t) => t.id === 'au')!.transitions).toHaveLength(1);
  // a sounds at 880 Hz (2x, no pitch preservation) into 1.0-1.25; b at 440 Hz from 0.75.
  const levels = (await rms(page, p, [[1.05, 1.15], [1.6, 1.7]]))!.rms.map(([l]) => l);
  expect(levels[0]).toBeGreaterThan(0.05);
  expect(levels[1]).toBeGreaterThan(0.05);
});
