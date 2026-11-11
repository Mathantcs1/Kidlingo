// Noise reduction through the real engines (Plan 3 Task 7, review round 1): noise drop with the tone kept, steady
// material spared by the stationarity guard, and live Play of a denoised clip without long main-thread tasks.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { SR, db, effect, withEffects } from './effect-helpers';
import { importPaths, openHarness } from './harness-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(120_000);

const fx = audioFixtures();

const levels = async (page: Page, p: Project, W: [number, number][]): Promise<number[]> =>
  (await page.evaluate(({ p, sr, W }) => window.cf.mixdownChannelRms(p, sr, W), { p, sr: SR, W }))!.rms.map(([l]) => l);

test('noise reduction (strength 0.8) lowers noise-only audio by >= 6 dB and keeps the tone within 1.5 dB', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.hiss]);
  const W: [number, number][] = [[0.3, 1.2], [1.8, 2.7]];
  const [n0, t0] = await levels(page, withEffects(m, []), W);
  const [n1, t1] = await levels(page, withEffects(m, [effect('denoise', { strength: 0.8 })]), W);
  console.log(`denoise: noise ${db(n1 / n0).toFixed(2)} dB, tone+noise ${db(t1 / t0).toFixed(2)} dB`);
  expect(db(n1 / n0)).toBeLessThanOrEqual(-6);
  expect(Math.abs(db(t1 / t0))).toBeLessThan(1.5);
});

test('a sustained tone under noise (no pauses) stays within 1.5 dB at strength 0.8 and 1', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.toneHiss]);
  const W: [number, number][] = [[0.5, 2.5]];
  const [a] = await levels(page, withEffects(m, []), W);
  for (const strength of [0.8, 1]) {
    const [b] = await levels(page, withEffects(m, [effect('denoise', { strength })]), W);
    console.log(`sustained tone at strength ${strength}: ${db(b / a).toFixed(2)} dB`);
    expect(Math.abs(db(b / a))).toBeLessThan(1.5);
  }
});

test('live Play of a denoised clip makes sound with no main-thread task over 100 ms', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.longBursts]);
  const run = (p: Project) =>
    page.evaluate(({ p, sr }) => window.cf.liveLongTasks(p, 25, 20, sr), { p, sr: SR });
  const dry = await run(withEffects(m, []));
  const wet = await run(withEffects(m, [effect('denoise', { strength: 0.8 })]));
  const max = (l: number[]) => Math.max(0, ...l);
  console.log(
    `long tasks: dry ${dry.long.length} (max ${max(dry.long).toFixed(0)} ms), denoised ${wet.long.length} ` +
      `(max ${max(wet.long).toFixed(0)} ms); scheduling took ${dry.ms.toFixed(0)} / ${wet.ms.toFixed(0)} ms`,
  );
  expect(wet.covered).toBe(true);
  expect(wet.peak).toBeGreaterThan(0.1);
  expect(max(wet.long)).toBeLessThan(100);
});
