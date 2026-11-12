import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { joinClips } from '../../src/core/merge';
import { moveClip, splitClip } from '../../src/core/timeline';
import { defaultClipAudio, newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../../src/core/model';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(120_000);

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const noAudio = join(dir, 'no-audio.mp4');

async function openHarness(page: Page): Promise<void> {
  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
}

async function importFixtures(page: Page): Promise<{ a: MediaRef; b: MediaRef }> {
  await page.setInputFiles('#harness-file', [withAudio, noAudio]);
  const a = await page.evaluate(() => window.cf.importInputFile(0));
  const b = await page.evaluate(() => window.cf.importInputFile(1));
  return { a, b };
}

function imageMedia(page: Page, width: number, height: number): Promise<MediaRef> {
  return page.evaluate(({ width, height }) => window.cf.putImageMedia(width, height, [200, 40, 40]), { width, height });
}

let seq = 0;
function clipOf(m: MediaRef, over: Partial<Clip> = {}): Clip {
  return {
    id: `clip-${++seq}`,
    mediaId: m.id,
    kind: m.kind as Clip['kind'],
    start: 0,
    in: 0,
    out: m.duration,
    volume: 1,
    audio: defaultClipAudio(), effects: [], blend: 'normal',
    fit: 'fit',
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...over,
  };
}

function project(
  format: Project['format'],
  media: MediaRef[],
  video: Clip[],
  audio: Clip[] = [],
): Project {
  const tracks: Track[] = [
    { ...newTrack('video'), id: 'video', clips: video },
    { ...newTrack('audio'), id: 'audio', clips: audio },
  ];
  return { version: CURRENT_VERSION, format, tracks, media: Object.fromEntries(media.map((m) => [m.id, m])) };
}

interface RunOpts {
  maxLongSide?: number;
  abortAt?: number;
}

function runExport(page: Page, p: Project, opts: RunOpts) {
  return page.evaluate(({ p, opts }) => window.cf.runExport(p, opts), { p, opts });
}

function expectMonotonicToOne(progress: number[]): void {
  expect(progress.length).toBeGreaterThan(1);
  for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
  for (const f of progress) {
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  }
  expect(progress[progress.length - 1]).toBe(1);
}

test('exports a split, gapped and rejoined clip as H.264 + AAC MP4', async ({ page }) => {
  await openHarness(page);
  const { a } = await importFixtures(page);
  const whole = clipOf(a, { id: 'whole', out: 3 });
  let p = project({ width: 160, height: 90, fps: 10 }, [a], [whole]);
  p = splitClip(p, 'whole', 1.5);
  const [left, right] = p.tracks[0].clips;
  p = moveClip(p, right.id, 3.0);
  expect(p.tracks[0].clips[1].start).toBe(3.0);
  p = joinClips(p, [left.id, right.id]);

  const r = await runExport(page, p, { maxLongSide: 320 });
  expect(r.error).toBeNull();
  expectMonotonicToOne(r.progress);
  const info = r.info;
  expect(info).not.toBeNull();
  if (!info) return;
  expect(info.format).toBe('MP4');
  expect(info.videoCodec).toBe('avc');
  expect(info.audioCodec).toBe('aac');
  expect(Math.abs(info.duration - 3.0)).toBeLessThanOrEqual(0.25);
  expect(info.width).toBe(320);
  expect(info.height).toBe(180);
  // The exported audio decodes and is not silent.
  expect(info.audioPeak).toBeGreaterThan(0.05);
  // The result is backed by a temp file in OPFS until cleanupExportTemp() runs.
  expect(r.tempEntries).toBe(1);
});

test('abort rejects with AbortError, cleans OPFS, and a later export works', async ({ page }) => {
  await openHarness(page);
  const { a } = await importFixtures(page);
  const p = project({ width: 160, height: 90, fps: 10 }, [a], [clipOf(a, { out: 3 })]);

  const aborted = await runExport(page, p, { maxLongSide: 160, abortAt: 0.3 });
  expect(aborted.info).toBeNull();
  expect(aborted.error).toEqual({ name: 'AbortError', isDomException: true, message: 'Aborted' });
  expect(Math.max(...aborted.progress)).toBeGreaterThanOrEqual(0.3);
  expect(aborted.progress).not.toContain(1);
  expect(await page.evaluate(() => window.cf.listExportTemp())).toEqual([]);

  const again = await runExport(page, p, { maxLongSide: 160 });
  expect(again.error).toBeNull();
  expect(again.info?.videoCodec).toBe('avc');
  expect(Math.abs((again.info?.duration ?? 0) - 3.0)).toBeLessThanOrEqual(0.25);

  await page.evaluate(() => window.cf.cleanupExportTemp());
  expect(await page.evaluate(() => window.cf.listExportTemp())).toEqual([]);
});

test('an image-only project exports a video-only MP4', async ({ page }) => {
  await openHarness(page);
  const img = await imageMedia(page, 64, 36);
  const p = project({ width: 160, height: 90, fps: 10 }, [img], [clipOf(img, { out: 1.5 })]);
  const r = await runExport(page, p, { maxLongSide: 160 });
  expect(r.error).toBeNull();
  expectMonotonicToOne(r.progress);
  expect(r.info?.videoCodec).toBe('avc');
  expect(r.info?.audioCodec).toBeNull();
  expect(Math.abs((r.info?.duration ?? 0) - 1.5)).toBeLessThanOrEqual(0.25);
});

test('odd project dimensions export with even video dimensions', async ({ page }) => {
  await openHarness(page);
  const img = await imageMedia(page, 64, 36);
  const p = project({ width: 101, height: 57, fps: 5 }, [img], [clipOf(img, { out: 1 })]);
  const r = await runExport(page, p, { maxLongSide: 101 });
  expect(r.error).toBeNull();
  expect(r.info?.width).toBe(100);
  expect(r.info?.height).toBe(56);
  expect((r.info?.width ?? 1) % 2).toBe(0);
  expect((r.info?.height ?? 1) % 2).toBe(0);
});

test('renderMixdown places, trims, scales and sums audible clips', async ({ page }) => {
  await openHarness(page);
  const { a, b } = await importFixtures(page);
  const img = await imageMedia(page, 64, 36);
  const fmt = { width: 160, height: 90, fps: 10 };
  const sr = 48000;

  const mix = (p: Project, windows: [number, number][]) =>
    page.evaluate(({ p, sr, windows }) => window.cf.mixdownStats(p, sr, windows), { p, sr, windows });

  const delayed = project(fmt, [a], [clipOf(a, { start: 1, out: 3 })]);
  const full = await mix(delayed, [[0, 1], [1, 4]]);
  expect(full).not.toBeNull();
  if (!full) return;
  expect(full.sampleRate).toBe(sr);
  expect(full.channels).toBe(2);
  expect(Math.abs(full.length - 4 * sr)).toBeLessThanOrEqual(sr * 0.01);
  expect(full.peaks[0]).toBeLessThan(0.001);
  expect(full.peaks[1]).toBeGreaterThan(0.05);

  const half = await mix(project(fmt, [a], [clipOf(a, { start: 1, out: 3, volume: 0.5 })]), [[1, 4]]);
  const ratio = (half?.peaks[0] ?? 0) / full.peaks[1];
  expect(ratio).toBeGreaterThan(0.5 * 0.85);
  expect(ratio).toBeLessThan(0.5 * 1.15);

  // The same sine on a video clip and an audio clip at the same time adds up to twice the amplitude.
  const single = await mix(project(fmt, [a], [clipOf(a, { out: 2, volume: 0.5 })]), [[0.2, 1.8]]);
  const summed = await mix(
    project(fmt, [a], [clipOf(a, { out: 2, volume: 0.5 })], [clipOf(a, { kind: 'audio', out: 2, volume: 0.5 })]),
    [[0.2, 1.8]],
  );
  const sumRatio = (summed?.peaks[0] ?? 0) / (single?.peaks[0] ?? 1);
  expect(sumRatio).toBeGreaterThan(2 * 0.85);
  expect(sumRatio).toBeLessThan(2 * 1.15);

  // Muted clip contributes nothing.
  const muted = await mix(project(fmt, [a], [clipOf(a, { out: 2, volume: 0 })]), [[0, 2]]);
  expect(muted?.peaks[0] ?? 0).toBeLessThan(0.001);

  // No audible clips → null: images, media without audio, hasAudio:false refs.
  expect(await mix(project(fmt, [img], [clipOf(img, { out: 1 })]), [])).toBeNull();
  expect(await mix(project(fmt, [b], [clipOf(b, { out: 1 })]), [])).toBeNull();
  const silentRef = { ...a, hasAudio: false };
  expect(await mix(project(fmt, [silentRef], [clipOf(silentRef, { out: 1 })]), [])).toBeNull();
  expect(await mix(project(fmt, [a], []), [])).toBeNull();
});

test('live mixer plays and stops idempotently', async ({ page }) => {
  await openHarness(page);
  const { a } = await importFixtures(page);
  const p = project({ width: 160, height: 90, fps: 10 }, [a], [clipOf(a, { start: 0.5, out: 3 })]);
  const r = await page.evaluate((p) => window.cf.liveMixerSmoke(p), p);
  expect(r.before).toBe(0);
  expect(r.played).toBe(true);
  expect(r.during).toBeGreaterThanOrEqual(0.9);
  expect(r.stoppedTwice).toBe(true);
});
