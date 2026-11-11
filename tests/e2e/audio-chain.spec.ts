import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { defaultClipAudio } from '../../src/core/model';
import type { Clip, ClipAudio, MediaRef, Project } from '../../src/core/model';

test.setTimeout(120_000);

const dir = ensureFixtures();
/** Stereo 1 kHz, 6 s, 48 kHz, amplitude 1/8 (RMS ~0.088). */
const tone1k = join(dir, 'tone-1k.wav');
/** Mono 220 Hz, 600 s, 8 kHz AAC. */
const longTone = join(dir, 'long-tone.m4a');
const SR = 48000;
/** Must match EXPORT_WINDOW_SECONDS in src/audio/mixdown.ts. */
const WINDOW = 30;

const audioOf = (over: Partial<ClipAudio>): ClipAudio => ({ ...defaultClipAudio(), ...over });

/** A project whose audio track holds `clips` at track volume `trackVolume`. */
function audioProject(media: MediaRef[], clips: Clip[], trackVolume = 1): Project {
  const p = project({ width: 64, height: 36, fps: 10 }, media, []);
  return { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips, volume: trackVolume } : t)) };
}

async function channelRms(page: Page, p: Project, windows: [number, number][]): Promise<[number, number][]> {
  const r = await page.evaluate(({ p, sr, windows }) => window.cf.mixdownChannelRms(p, sr, windows), { p, sr: SR, windows });
  expect(r).not.toBeNull();
  return r!.rms as [number, number][];
}

test('a 1 s fade-in starts silent and reaches full level', async ({ page }) => {
  await openHarness(page);
  const [tone] = await importPaths(page, [tone1k]);
  const p = audioProject([tone], [clipOf(tone, { out: 4, audio: audioOf({ fadeIn: 1 }) })]);
  const [head, , full] = await channelRms(page, p, [[0, 0.2], [0.45, 0.55], [2, 3]]);
  expect(full[0]).toBeGreaterThan(0.05);
  expect(head[0]).toBeLessThan(0.25 * full[0]);
  // Linear ramp: around 0.5 s the level is about half.
  const mid = (await channelRms(page, p, [[0.49, 0.51]]))[0];
  expect(Math.abs(mid[0] / full[0] - 0.5)).toBeLessThan(0.05);
});

test('pan -1 sends a stereo and a mono source to the left only', async ({ page }) => {
  await openHarness(page);
  const [tone, mono] = await importPaths(page, [tone1k, longTone]);
  for (const m of [tone, mono]) {
    const p = audioProject([m], [clipOf(m, { out: 3, audio: audioOf({ pan: -1 }) })]);
    const [[left, right]] = await channelRms(page, p, [[0.5, 2.5]]);
    expect(left, m.name).toBeGreaterThan(0.1);
    expect(right, m.name).toBeLessThan(0.01 * left);
  }
  // Pan 0 keeps both channels equal at the source level (mono is up-mixed, not attenuated).
  const centre = audioProject([mono], [clipOf(mono, { out: 3 })]);
  const [[l, r]] = await channelRms(page, centre, [[0.5, 2.5]]);
  expect(Math.abs(l / r - 1)).toBeLessThan(0.001);
});

test('track volume 0.5 halves the amplitude', async ({ page }) => {
  await openHarness(page);
  const [tone] = await importPaths(page, [tone1k]);
  const clips = [clipOf(tone, { out: 3 })];
  const [[full]] = await channelRms(page, audioProject([tone], clips, 1), [[0.5, 2.5]]);
  const [[half]] = await channelRms(page, audioProject([tone], clips, 0.5), [[0.5, 2.5]]);
  expect(full).toBeGreaterThan(0.05);
  expect(Math.abs(half / full - 0.5)).toBeLessThan(0.01); // ±2 % of 0.5
});

test('a silent clip contributes nothing', async ({ page }) => {
  await openHarness(page);
  const [tone] = await importPaths(page, [tone1k]);
  const mk = (silent: boolean) =>
    audioProject([tone], [clipOf(tone, { out: 2 }), clipOf(tone, { start: 2, in: 2, out: 4, audio: audioOf({ silent }) })]);
  const [[a], [b]] = await channelRms(page, mk(false), [[0.5, 1.5], [2.5, 3.5]]);
  expect(a).toBeGreaterThan(0.05);
  expect(b).toBeGreaterThan(0.05);
  const [[c], [d]] = await channelRms(page, mk(true), [[0.5, 1.5], [2.5, 3.5]]);
  expect(Math.abs(c - a)).toBeLessThan(1e-6);
  expect(d).toBe(0);
});

test('fades, pan and track volume join seamlessly across export window cuts', async ({ page }) => {
  await openHarness(page);
  const [tone] = await importPaths(page, [longTone]);
  // The fade-in (20..35 s) and fade-out (55..65 s) straddle the 30 s and 60 s window cuts.
  const p = audioProject([tone], [clipOf(tone, { start: 20, in: 3, out: 48, audio: audioOf({ fadeIn: 15, fadeOut: 10, pan: 0.5 }) })], 0.7);
  const r = await page.evaluate(({ p, sr, w }) => window.cf.mixdownCompare(p, sr, w), { p, sr: SR, w: WINDOW });
  expect(r).not.toBeNull();
  if (!r) return;
  expect(r.single.peak).toBeGreaterThan(0.1);
  expect(r.boundaryDiff).toBeLessThan(5e-5);
  expect(r.maxDiff).toBeLessThan(1e-3);
});

test('live playback goes through the same chain: identical to export and seamless across live windows', async ({ page }) => {
  await openHarness(page);
  const [tone] = await importPaths(page, [tone1k]);
  // A 2 s fade-in crossing the 1 s live window cut, pan, clip and track volume. The offline clock never moves,
  // so the mixer schedules exactly its first two live windows ([0, 1) and [1, 2)).
  const clip = clipOf(tone, { out: 4, volume: 0.9, audio: audioOf({ fadeIn: 2, fadeOut: 0.5, pan: 0.3 }) });
  const p = audioProject([tone], [clip], 0.8);
  const r = await page.evaluate(({ p, sr }) => window.cf.liveVersusMixdown(p, 2, 1, sr), { p, sr: SR });
  expect(r).not.toBeNull();
  if (!r) return;
  expect(r.covered).toBe(true);
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.maxDiff).toBeLessThan(1e-4);
  // Pieces still tile sample-exactly.
  const pieces = r.schedule.filter((s) => s.clipId === clip.id);
  expect(pieces.length).toBe(2);
  for (let i = 1; i < pieces.length; i++) {
    expect(pieces[i].srcFrom).toBe(pieces[i - 1].srcTo);
    expect(Math.abs(pieces[i].start - pieces[i - 1].end)).toBeLessThan(1e-6);
  }
});
