import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import type { MediaRef, Project } from '../../src/core/model';

test.setTimeout(120_000);

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const longTone = join(dir, 'long-tone.m4a');
const SR = 48000;
/** Must match EXPORT_WINDOW_SECONDS in src/audio/mixdown.ts. */
const WINDOW = 30;

/** Adds an audio clip on the project's audio track. */
function withAudioClips(p: Project, clips: ReturnType<typeof clipOf>[]): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips } : t)) };
}

async function longToneProject(page: Page, seconds: number, fps: number): Promise<{ p: Project; tone: MediaRef }> {
  const [tone] = await importPaths(page, [longTone]);
  expect(tone.kind).toBe('audio');
  expect(Math.abs(tone.duration - 600)).toBeLessThan(0.1);
  const p = withAudioClips(project({ width: 64, height: 36, fps }, [tone], []), [
    clipOf(tone, { start: 0, in: 12.5, out: 12.5 + seconds }),
  ]);
  return { p, tone };
}

function runExport(page: Page, p: Project, opts: { maxLongSide?: number; abortAt?: number; abortAfterMs?: number }) {
  return page.evaluate(({ p, opts }) => window.cf.runExport(p, opts), { p, opts });
}

test('a windowed mixdown equals the single-pass mix, seamlessly across window boundaries', async ({ page }) => {
  await openHarness(page);
  const [a, tone] = await importPaths(page, [withAudio, longTone]);
  // 23 looped 3 s clips from 0.5 s (several straddle 30 s and 60 s), plus a resampled 8 kHz tone over both cuts.
  const video = Array.from({ length: 23 }, (_, k) => clipOf(a, { start: 0.5 + 3 * k, in: k % 2 ? 0.2 : 0, volume: 0.5 }));
  const music = clipOf(tone, { start: 2, in: 100.3, out: 168.3, volume: 0.7 });
  const p = withAudioClips(project({ width: 64, height: 36, fps: 10 }, [a, tone], video), [music]);

  const r = await page.evaluate(({ p, sr, w }) => window.cf.mixdownCompare(p, sr, w), { p, sr: SR, w: WINDOW });
  expect(r).not.toBeNull();
  if (!r) return;
  expect(r.lengths[0]).toBe(r.lengths[1]);
  expect(Math.abs(r.lengths[0] - 70 * SR)).toBeLessThanOrEqual(1);
  expect(r.single.peak).toBeGreaterThan(0.1);
  expect(Math.abs(r.windowed.peak / r.single.peak - 1)).toBeLessThan(0.01);
  expect(Math.abs(r.windowed.rms / r.single.rms - 1)).toBeLessThan(0.01);
  // Sample by sample, including around the cuts: no click, gap or doubled sample.
  // Measured: ~4e-6 at the cuts (3.7e-4 without the cut margins), ~2e-4 elsewhere (sub-sample clip starts).
  expect(r.boundaryDiff).toBeLessThan(5e-5);
  expect(r.maxDiff).toBeLessThan(1e-3);
});

test('aborting between mixdown windows rejects with AbortError at once', async ({ page }) => {
  await openHarness(page);
  const { p } = await longToneProject(page, 120, 1);
  const r = await page.evaluate((p) => window.cf.mixdownAbortAfterFirstWindow(p), p);
  expect(r.first).toBe(WINDOW * SR);
  expect(r.error).toBe('AbortError');
  expect(r.ms).toBeLessThan(2000);
});

test('aborting a long export while it renders audio rejects quickly and leaves OPFS clean', async ({ page }) => {
  await openHarness(page);
  const { p } = await longToneProject(page, 600, 1);
  for (const abortAfterMs of [150, 600]) {
    const r = await runExport(page, p, { maxLongSide: 32, abortAfterMs });
    expect(r.error?.name).toBe('AbortError');
    expect(r.error?.isDomException).toBe(true);
    expect(r.abortLatency).not.toBeNull();
    expect(r.abortLatency ?? Infinity).toBeLessThan(2000);
    expect(r.tempEntries).toBe(0);
  }
});

test('progress counts the audio work, not only the frames', async ({ page }) => {
  await openHarness(page);
  const { p } = await longToneProject(page, 90, 1);
  const r = await runExport(page, p, { maxLongSide: 32 });
  expect(r.error).toBeNull();
  // Frames alone would make the first non-zero step exactly one frame's share (0.95 / 90); the first audio window
  // (a third of the audio) must already count before the first frame is done.
  const first = r.progress.find((f) => f > 0) ?? 0;
  expect(first).toBeGreaterThan((0.95 / 90) * 1.5);
  for (let i = 1; i < r.progress.length; i++) expect(r.progress[i]).toBeGreaterThanOrEqual(r.progress[i - 1]);
  expect(r.progress[r.progress.length - 1]).toBe(1);
});

test('an unreadable audio source fails the export with an ExportError naming the media', async ({ page }) => {
  await openHarness(page);
  const broken = await page.evaluate(async () => {
    const id = `broken-${Date.now()}`;
    await window.cf.putMedia(id, new Blob([new Uint8Array(4096).fill(7)], { type: 'audio/mp4' }));
    return { id, name: 'broken.m4a', kind: 'audio', duration: 2, width: 0, height: 0, hasAudio: true } as MediaRef;
  });
  const p = withAudioClips(project({ width: 64, height: 36, fps: 5 }, [broken], []), [clipOf(broken, { out: 1 })]);
  const r = await runExport(page, p, { maxLongSide: 32 });
  expect(r.error?.name).toBe('ExportError');
  expect(r.error?.message).toMatch(/^Could not read the audio of "broken\.m4a": .+/);
  expect(r.tempEntries).toBe(0);
});

test('exporting five minutes of audio never allocates a whole-length audio buffer', async ({ page }) => {
  await openHarness(page);
  const { p } = await longToneProject(page, 300, 1);
  await page.evaluate(() => window.cf.resetAudioStats());
  const r = await runExport(page, p, { maxLongSide: 32 });
  expect(r.error).toBeNull();
  expect(r.info?.audioCodec).toBe('aac');
  expect(Math.abs((r.info?.duration ?? 0) - 300)).toBeLessThan(0.2);
  expect(r.info?.audioPeak ?? 0).toBeGreaterThan(0.1);
  const stats = await page.evaluate(() => window.cf.audioStats());
  expect(stats.windows).toBe(10);
  expect(stats.largestBuffer).toBeGreaterThan(0);
  expect(stats.largestBuffer).toBeLessThanOrEqual(WINDOW * SR * 2);
});
