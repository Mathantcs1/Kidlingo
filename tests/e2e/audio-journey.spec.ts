// Plan 3 audio journey: detach the voice from a video, fade the music, EQ + compress the voice, duck the music under
// the voice, reload (project restored exactly), export 1080p and measure the file with ffprobe/ffmpeg, then walk the
// undo chain back one step per gesture. Every edit goes through the real UI controls; only reads use the dev hook.
import { execFileSync, spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';
import { join } from 'node:path';
import { ensureFixtures } from './fixtures';
import type { Project } from '../../src/core/model';

test.setTimeout(240_000);

/** Voice: with-audio.mp4 (3 s, 440 Hz). Music: tone-1k.wav (6 s, 1 kHz), so the two sit in different bands. */
const music = join(ensureFixtures(), 'tone-1k.wav');

const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const f = (page: Page, id: string) => page.getByTestId(id);

/** Mean level (dB) of the 1 kHz band (the music) of [from, from + len) of the file's audio. */
function musicBandDb(file: string, from: number, len: number): number {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-ss', String(from), '-t', String(len), '-i', file, '-vn',
    '-af', 'bandpass=f=1000:width_type=h:w=100,bandpass=f=1000:width_type=h:w=100,bandpass=f=1000:width_type=h:w=100,volumedetect', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) throw new Error(`no volumedetect output: ${r.stderr.slice(-400)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

test('audio journey: detach, fade, effects, duck, reload, export and the undo chain', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, music], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'tone-1k.wav', 2);
  const startJson = JSON.stringify(await present(page));
  const startDepth = await depth(page);

  const clips = await clipStates(page);
  const video = clips.find((c) => c.trackKind === 'video')!;
  const musicClip = clips.find((c) => c.trackKind === 'audio')!;
  const musicTrack = musicClip.trackId;
  let steps = 0;
  /** Runs one gesture and asserts it created exactly one undo step. */
  const gesture = async (name: string, run: () => Promise<void>): Promise<void> => {
    const before = await depth(page);
    await run();
    expect(await depth(page), name).toBe(before + 1);
    steps++;
  };

  // 1. Detach the video's audio: the voice becomes an audio clip on a new track.
  await clipEl(page, video.id).click();
  await gesture('detach', () => f(page, 'audio-detach').click());
  const voiceClip = (await clipStates(page)).find((c) => c.trackKind === 'audio' && c.id !== musicClip.id)!;
  const voiceTrack = voiceClip.trackId;
  expect(voiceTrack).not.toBe(musicTrack);

  // 2. Fade the music in and out (1 s each).
  await clipEl(page, musicClip.id).click();
  for (const id of ['audio-fade-in', 'audio-fade-out']) {
    await gesture(id, async () => {
      await f(page, id).fill('1');
      await f(page, id).press('Enter');
    });
  }

  // 3. EQ and compressor on the voice clip.
  await clipEl(page, voiceClip.id).click();
  for (const type of ['eq', 'compressor']) {
    await f(page, 'effect-add').selectOption(type);
    await gesture(type, () => f(page, 'effect-add-button').click());
  }

  // 4. Duck the music under the voice track.
  await f(page, `duck-toggle-${musicTrack}`).click();
  await gesture('duck source', async () => {
    await f(page, `duck-source-${musicTrack}`).selectOption(voiceTrack);
  });
  await page.keyboard.press('Escape');
  expect(steps).toBe(6);

  const done = await present(page);
  const mc = done.tracks.flatMap((t) => t.clips).find((c) => c.id === musicClip.id)!;
  expect(mc.audio).toMatchObject({ fadeIn: 1, fadeOut: 1 });
  const vc = done.tracks.flatMap((t) => t.clips).find((c) => c.id === voiceClip.id)!;
  expect(vc.audio.effects.map((e) => e.type)).toEqual(['eq', 'compressor']);
  expect(done.tracks.find((t) => t.id === musicTrack)!.duck).toMatchObject({ sourceTrackId: voiceTrack });
  const doneJson = JSON.stringify(done);

  // Undo chain (history is per session, so it is walked before the reload): one step per gesture, back to the
  // starting project, then forward again.
  const undo = page.getByTestId('btn-undo');
  for (let i = 0; i < steps; i++) await undo.click();
  expect(await depth(page)).toBe(startDepth);
  expect(JSON.stringify(await present(page))).toBe(startJson);
  for (let i = 0; i < steps; i++) await page.getByTestId('btn-redo').click();
  expect(JSON.stringify(await present(page))).toBe(doneJson);
  // Reload: the project comes back exactly.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  expect(JSON.stringify(await present(page))).toBe(doneJson);

  // Export at 1080p.
  await f(page, 'btn-export').click();
  await expect(f(page, 'export-dialog')).toBeVisible();
  await f(page, 'export-quality').selectOption('1080p');
  await f(page, 'btn-export-start').click();
  const link = f(page, 'export-download');
  await expect(link).toBeVisible({ timeout: 250_000 });
  await expect(f(page, 'export-error')).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const file = (await download.path())!;

  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString(),
  ) as { format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[] };
  expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080 });
  expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
  const timelineEnd = Math.max(...done.tracks.flatMap((t) => t.clips).map((c) => c.start + (c.out - c.in)));
  expect(timelineEnd).toBeCloseTo(6, 1);
  expect(Math.abs(Number(probe.format.duration) - timelineEnd)).toBeLessThanOrEqual(1 / done.format.fps + 1e-3);

  // The 1 kHz music: faded in (quiet at the very start), ducked while the voice (0..3 s) plays, back at full level after.
  const start = musicBandDb(file, 0, 0.1);
  const ducked = musicBandDb(file, 1.2, 1.5);
  const full = musicBandDb(file, 3.8, 1.0);
  console.log(`journey: fade-in start ${start.toFixed(1)} dB, ducked ${ducked.toFixed(1)} dB, full ${full.toFixed(1)} dB`);
  expect(full).toBeGreaterThan(-30);
  expect(full - ducked).toBeGreaterThanOrEqual(9);
  expect(full - start).toBeGreaterThanOrEqual(9);

  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});
