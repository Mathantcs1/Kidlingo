// Plan 5D Task 8: audio of retimed clips in both engines (export mixdown and live mixer): the resampler's pitch and length,
// reverse, window seams and live == export. Pitch-preserving stretch: Task 9.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { SR, withEffects } from './effect-helpers';
import { importPaths, openHarness } from './harness-helpers';
import type { Clip, Project } from '../../src/core/model';

test.setTimeout(180_000);

const fx = audioFixtures();
const retimed = (m: Parameters<typeof withEffects>[0], over: Partial<Clip>): Project => withEffects(m, [], over);
const dominant = (page: Page, p: Project, from: number, to: number) =>
  page.evaluate(({ p, sr, from, to }) => window.cf.mixdownDominantFrequency(p, sr, from, to, 100, 3000), { p, sr: SR, from, to });

test('preservePitch off: 440 Hz at 2x sounds at 880 Hz and the mix is half as long; at 0.5x 220 Hz and twice as long', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone440]); // 3 s
  const fast = await dominant(page, retimed(m, { speed: 2, preservePitch: false }), 0.2, 1.2);
  expect(Math.abs(fast!.freq / 880 - 1)).toBeLessThan(0.02);
  expect(fast!.length).toBe(Math.round(1.5 * SR));
  const slow = await dominant(page, retimed(m, { speed: 0.5, preservePitch: false }), 0.5, 4.5);
  expect(Math.abs(slow!.freq / 220 - 1)).toBeLessThan(0.02);
  expect(slow!.length).toBe(6 * SR);
});

test('reverse plays the footage backwards: the loud second half of the bursts fixture comes first', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.bursts]); // 0.05 amplitude for 2 s, then 0.8 for 2 s
  const r = await page.evaluate(
    ({ p, sr }) => window.cf.mixdownChannelRms(p, sr, [[0.2, 1.8], [2.2, 3.8]]),
    { p: retimed(m, { reverse: true }), sr: SR },
  );
  const [first, second] = r!.rms.map(([l]) => l);
  expect(first).toBeGreaterThan(0.4);
  expect(second).toBeLessThan(0.05);
});

for (const [name, over] of [['2x', { speed: 2, preservePitch: false }], ['0.5x', { speed: 0.5, preservePitch: false }], ['reverse', { reverse: true }], ['reverse 1.5x', { reverse: true, speed: 1.5, preservePitch: false }]] as [string, Partial<Clip>][]) {
  test(`window seams: ${name} in 1 s windows equals one pass`, async ({ page }) => {
    await openHarness(page);
    const [m] = await importPaths(page, [fx.noisy]);
    const r = await page.evaluate(({ p, sr }) => window.cf.mixdownSeam(p, sr, 1), { p: retimed(m, over), sr: SR });
    console.log(`${name}: seam rms ${r!.rmsDiff} max ${r!.maxDiff} peak ${r!.peak}`);
    expect(r!.lengths[0]).toBe(r!.lengths[1]);
    expect(r!.peak).toBeGreaterThan(0.1);
    expect(r!.maxDiff).toBeLessThan(1e-5);
  });
}

test('live mixer equals the export mix for a 2x clip and a reversed clip', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.noisy]);
  for (const over of [{ speed: 2, preservePitch: false }, { reverse: true }] as Partial<Clip>[]) {
    const r = await page.evaluate(({ p, sr }) => window.cf.liveVersusMixdown(p, 1.5, 1, sr), { p: retimed(m, over), sr: SR });
    expect(r!.covered).toBe(true);
    expect(r!.peak).toBeGreaterThan(0.1);
    expect(r!.maxDiff).toBeLessThan(1e-3);
  }
});

// A/V sync (D11): the flash and the burst of av-sync.mp4 (every footage second) must land at the same timeline time
// within two frames after retiming, in both directions and at both speeds.
import { join } from 'node:path';
import { ensureFixtures } from './fixtures';
import { clipOf, project, render } from './harness-helpers';

const sync = join(ensureFixtures(), 'av-sync.mp4');
const AV_FMT = { width: 64, height: 36, fps: 30 };

for (const [name, over, onset] of [
  ['2x', { speed: 2, preservePitch: false }, 0.5],
  ['0.5x', { speed: 0.5, preservePitch: false }, 2],
  ['reverse', { reverse: true }, 2.9],
] as [string, Partial<Clip>, number][]) {
  test(`A/V markers of av-sync.mp4 stay together under ${name} (flash and burst within 2 frames of ${onset} s)`, async ({ page }) => {
    await openHarness(page);
    const [m] = await importPaths(page, [sync]);
    const clip = clipOf(m, { ...over, out: 4 });
    const p = project(AV_FMT, [m], [clip]);
    // Video: the first bright frame at or after onset - 0.2 s.
    const times = Array.from({ length: 30 }, (_, i) => onset - 0.2 + i / 30);
    const frames = await render(page, p, times);
    const bright = frames.findIndex((f) => f.data[0] > 128);
    expect(bright).toBeGreaterThanOrEqual(0);
    const videoAt = times[bright];
    // Audio: first 5 ms window louder than a third of the burst level.
    const windows = Array.from({ length: 80 }, (_, i) => [onset - 0.2 + i * 0.005, onset - 0.2 + (i + 1) * 0.005] as [number, number]);
    const r = await page.evaluate(({ p, sr, windows }) => window.cf.mixdownChannelRms(p, sr, windows), { p, sr: SR, windows });
    const loud = r!.rms.findIndex(([l]) => l > 0.1);
    expect(loud).toBeGreaterThanOrEqual(0);
    const audioAt = windows[loud][0];
    console.log(`${name}: video ${videoAt.toFixed(3)} s, audio ${audioAt.toFixed(3)} s, expected ${onset}`);
    expect(Math.abs(videoAt - audioAt)).toBeLessThanOrEqual(2 / 30);
    expect(Math.abs(videoAt - onset)).toBeLessThanOrEqual(2 / 30);
  });
}
