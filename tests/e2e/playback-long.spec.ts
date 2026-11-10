import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { addToTimeline, importFiles, open, playerState, setPlayhead, trackErrors } from './helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(90_000);

const longTone = join(ensureFixtures(), 'long-tone.m4a');
/** Must match LIVE_WINDOW_SECONDS in src/audio/mixer.ts. */
const LIVE_WINDOW = 20;

function audioStats(page: Page) {
  return page.evaluate(() => window.__clipforge!.audioStats());
}

async function setupLong(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [longTone], 1);
  await addToTimeline(page, 'long-tone.m4a', 1);
}

test('Play on a 10-minute clip starts moving the playhead within 1.5 s and decodes one window at a time', async ({ page }) => {
  const errors = trackErrors(page);
  await setupLong(page);
  await setPlayhead(page, 1);
  await page.evaluate(() => window.__clipforge!.resetAudioStats());
  const before = (await playerState(page)).playhead;

  const t0 = Date.now();
  await page.getByTestId('btn-play').click();
  await expect
    .poll(async () => (await playerState(page)).playhead, { timeout: 1500, intervals: [25] })
    .toBeGreaterThan(before + 0.02);
  const firstAdvance = Date.now() - t0;
  expect(firstAdvance).toBeLessThan(1500);

  // The next window is decoded in the background while the first one plays.
  await expect.poll(async () => (await audioStats(page)).windows, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  const stats = await audioStats(page);
  // A whole-clip decode would be 600 s x 8 kHz; two windows plus margins stay far below a tenth of that.
  expect(stats.largestBuffer).toBeGreaterThan(0);
  expect(stats.largestBuffer).toBeLessThanOrEqual((LIVE_WINDOW + 1) * 8000);
  await page.getByTestId('btn-play').click();
  expect(errors).toEqual([]);
});

test('seek, play, pause and rapid toggles never leave orphan audio nodes', async ({ page }) => {
  const errors = trackErrors(page);
  await setupLong(page);
  const play = page.getByTestId('btn-play');
  await setPlayhead(page, 2);
  await play.click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeGreaterThan(2.2);
  expect((await audioStats(page)).liveNodes).toBeGreaterThan(0);
  await play.click();
  expect((await audioStats(page)).liveNodes).toBe(0);

  // Seek and toggle three times quickly: superseded starts must not schedule anything later.
  await setPlayhead(page, 7);
  await play.click();
  await play.click();
  await play.click();
  await expect.poll(async () => (await playerState(page)).playhead).toBeGreaterThan(7.2);
  const playing = await audioStats(page);
  expect(playing.liveNodes).toBeGreaterThan(0);
  // One clip: at most the current window and the next one are scheduled.
  expect(playing.liveNodes).toBeLessThanOrEqual(2);
  await play.click();
  expect((await playerState(page)).playing).toBe(false);
  expect((await audioStats(page)).liveNodes).toBe(0);
  // Nothing pending wakes up and schedules audio after the pause.
  await page.waitForTimeout(1500);
  expect((await audioStats(page)).liveNodes).toBe(0);
  expect(errors).toEqual([]);
});

test('live playback runs across window boundaries without stalling or gaps', async ({ page }) => {
  await openHarness(page);
  // A click gives the page user activation so its AudioContext may run.
  await page.mouse.click(5, 5);
  const [tone] = await importPaths(page, [longTone]);
  const p: Project = project({ width: 64, height: 36, fps: 10 }, [tone], []);
  p.tracks[1].clips = [clipOf(tone, { start: 0.25, in: 3, out: 63 }), clipOf(tone, { kind: 'audio', start: 2, in: 0, out: 1.4 })];
  p.tracks[1].clips.sort((a, b) => a.start - b.start);

  const r = await page.evaluate((p) => window.cf.liveMixerRun(p, 0.4, { windowSeconds: 1, ms: 3500 }), p);
  expect(r.state).toBe('running');
  // The clock advances steadily through ~3 window boundaries.
  for (let i = 1; i < r.samples.length; i++) expect(r.samples[i]).toBeGreaterThanOrEqual(r.samples[i - 1]);
  expect(r.samples[r.samples.length - 1] - r.samples[0]).toBeGreaterThan(2.5);
  expect(r.during.windows).toBeGreaterThanOrEqual(4);
  // Finished windows are dropped: only a few nodes alive at once.
  expect(r.during.liveNodesPeak).toBeLessThanOrEqual(4);
  expect(r.after.liveNodes).toBe(0);

  // The long clip's pieces follow each other exactly: each starts (source and clock) where the previous ended.
  const long = r.schedule.filter((s) => s.clipId === p.tracks[1].clips[0].id);
  expect(long.length).toBeGreaterThanOrEqual(4);
  for (let i = 1; i < long.length; i++) {
    expect(long[i].srcFrom).toBe(long[i - 1].srcTo);
    expect(Math.abs(long[i].start - long[i - 1].end)).toBeLessThan(1e-6);
  }
  // The short clip plays whole, once, at its place on the timeline.
  const short = r.schedule.filter((s) => s.clipId === p.tracks[1].clips[1].id);
  expect(short).toHaveLength(2);
  expect(short[0].srcFrom).toBe(0);
  expect(short[1].srcFrom).toBe(short[0].srcTo);
  expect(short[1].srcTo).toBe(1.4);
  expect(Math.abs(short[0].start - (r.ctxStart + (2 - 0.4)))).toBeLessThan(1e-6);
  // Every piece was scheduled ahead of its time: nothing was cut short because a decode came late.
  expect(r.schedule.every((s) => s.late === 0)).toBe(true);
});
