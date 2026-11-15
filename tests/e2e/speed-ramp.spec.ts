// Plan 5D Task 10: a speed ramp (Bullet time) end to end: the picture follows the map and the picture and sound markers stay together.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { SR } from './effect-helpers';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, px, render } from './harness-helpers';
import { clipDuration, sourceAtOffset, timelineTimeAt } from '../../src/core/clipTime';
import { speedPresetKeys } from '../../src/core/speedPresets';

test.setTimeout(120_000);

const dir = ensureFixtures();
const FMT = { width: 128, height: 72, fps: 30 };

function frameNo(f: { width: number; height: number; data: ArrayLike<number> }): number {
  const level = (rgb: number[]): number => Math.round((rgb[0] * 219) / 255 / 6);
  return level(px(f, Math.floor(f.width / 4), Math.floor(f.height / 2))) + 32 * level(px(f, Math.floor((3 * f.width) / 4), Math.floor(f.height / 2)));
}

test('Bullet time: output frame n shows the source frame the time map names (12 frames across the slow part)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'frame-index.mp4')]);
  const base = clipOf(m, { in: 0, out: 4, transform: { scale: 1 } });
  const clip = { ...base, speedKeys: speedPresetKeys('bullet', base) };
  const total = Math.floor(clipDuration(clip) * 30);
  const n = Array.from({ length: 12 }, (_, i) => Math.floor((i * (total - 1)) / 11));
  const frames = await render(page, project(FMT, [m], [clip]), n.map((i) => i / 30));
  const want = n.map((i) => Math.floor(sourceAtOffset(clip, i / 30) * 30 + 1e-6));
  const got = frames.map(frameNo);
  // The decoder's "frame at or before the time" can differ from floor by one frame at an exact boundary.
  got.forEach((g, i) => expect(Math.abs(g - want[i]), `frame ${n[i]}: got ${g}, map says ${want[i]}`).toBeLessThanOrEqual(1));
});

test('Bullet time: the flash and the burst of av-sync.mp4 at footage 2 s land together on the timeline', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(dir, 'av-sync.mp4')]);
  const base = clipOf(m, { in: 0, out: 4 });
  const clip = { ...base, speedKeys: speedPresetKeys('bullet', base) };
  const onset = timelineTimeAt(clip, 2);
  const p = project({ width: 64, height: 36, fps: 30 }, [m], [clip]); // the flash fills the whole picture
  const times = Array.from({ length: 45 }, (_, i) => onset - 0.2 + i / 30);
  const frames = await render(page, p, times);
  const bright = frames.findIndex((f) => f.data[0] > 128);
  expect(bright).toBeGreaterThanOrEqual(0);
  const windows = Array.from({ length: 160 }, (_, i) => [onset - 0.2 + i * 0.005, onset - 0.2 + (i + 1) * 0.005] as [number, number]);
  const r = await page.evaluate(({ p, sr, windows }) => window.cf.mixdownChannelRms(p, sr, windows), { p, sr: SR, windows });
  const loud = r!.rms.findIndex(([l]) => l > 0.1);
  expect(loud).toBeGreaterThanOrEqual(0);
  console.log(`bullet: onset ${onset.toFixed(3)} video ${times[bright].toFixed(3)} audio ${windows[loud][0].toFixed(3)}`);
  expect(Math.abs(times[bright] - onset)).toBeLessThanOrEqual(2 / 30);
  expect(Math.abs(times[bright] - windows[loud][0])).toBeLessThanOrEqual(4 / 30); // WSOLA smears onsets in the slow part
});
