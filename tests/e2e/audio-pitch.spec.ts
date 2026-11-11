// Pitch shift and noise reduction (Plan 3 Task 7): measured pitch of the real export mix, noise drop, window-seam
// equality (D7), live = export, an export checked with ffprobe, and the effects / presets offered in the Inspector.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { addToTimeline, clipEl, clipStates, importFiles, open, playerState } from './helpers';
import { defaultParams } from '../../src/audio/effects/params';
import { defaultClipAudio } from '../../src/core/model';
import type { AudioEffect, AudioEffectType, Clip, MediaRef, Project } from '../../src/core/model';

test.setTimeout(120_000);

const SR = 48000;
const FPS = 10;
const fx = audioFixtures();
const db = (r: number): number => 20 * Math.log10(r);

let seq = 0;
const effect = (type: AudioEffectType, params: Record<string, number> = {}): AudioEffect => ({
  id: `fx-${++seq}`,
  type,
  enabled: true,
  params: { ...defaultParams(type), ...params },
});

function withEffects(m: MediaRef, effects: AudioEffect[], over: Partial<Clip> = {}): Project {
  const clip = clipOf(m, { ...over, audio: { ...defaultClipAudio(), effects } });
  const p = project({ width: 64, height: 36, fps: FPS }, [m], []);
  return { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips: [clip] } : t)) };
}

const dominant = (page: Page, p: Project, from: number, to: number) =>
  page.evaluate(({ p, sr, from, to }) => window.cf.mixdownDominantFrequency(p, sr, from, to, 100, 1500), { p, sr: SR, from, to });

test('pitch +12 / -12 / 0 semitones move a 440 Hz tone to 880 / 220 / 440 Hz; the duration is unchanged', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone440]);
  for (const [st, f] of [[12, 880], [-12, 220], [0, 440], [6, 440 * 2 ** 0.5], [-4, 440 * 2 ** (-4 / 12)]]) {
    const r = await dominant(page, withEffects(m, [effect('pitch', { semitones: st })]), 0.5, 2.5);
    console.log(`pitch ${st} st: ${r?.freq.toFixed(2)} Hz (want ${f.toFixed(2)})`);
    expect(r).not.toBeNull();
    // Octaves land exactly; other shifts land on the strongest sideband of the 10 Hz crossfade (1 / PITCH_WINDOW).
    if (Math.abs(st) % 12 === 0) expect(Math.abs(r!.freq / f - 1)).toBeLessThan(0.02);
    else expect(Math.abs(r!.freq - f)).toBeLessThanOrEqual(10);
    expect(r!.length).toBe(3 * SR);
  }
});

test('the shifted output stays time-aligned (latency compensated): a click keeps its place', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.click]);
  // Energy centroid of the output over [0, 0.4) s, in 2 ms steps; the click is at 0.1 s. Uncompensated, the
  // shifter's mean delay (50 ms at +12, 25 ms at -12) would move it later by that much.
  const W = Array.from({ length: 200 }, (_, i) => [i * 0.002, (i + 1) * 0.002] as [number, number]);
  for (const st of [12, -12, 6]) {
    const p = withEffects(m, [effect('pitch', { semitones: st })]);
    const r = await page.evaluate(({ p, sr, W }) => window.cf.mixdownChannelRms(p, sr, W), { p, sr: SR, W });
    const e = r!.rms.map(([l]) => l * l);
    const total = e.reduce((a, b) => a + b, 0);
    const centroid = e.reduce((a, v, i) => a + v * (i + 0.5) * 0.002, 0) / total;
    console.log(`click centroid at ${st} st: ${centroid.toFixed(4)} s`);
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(centroid - 0.1)).toBeLessThan(0.01);
  }
});

test('noise reduction (strength 0.8) lowers noise-only audio by >= 6 dB and keeps the tone within 1.5 dB', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.hiss]);
  const W: [number, number][] = [[0.3, 1.2], [1.8, 2.7]];
  const level = async (p: Project) =>
    (await page.evaluate(({ p, sr, W }) => window.cf.mixdownChannelRms(p, sr, W), { p, sr: SR, W }))!.rms.map(([l]) => l);
  const [n0, t0] = await level(withEffects(m, []));
  const [n1, t1] = await level(withEffects(m, [effect('denoise', { strength: 0.8 })]));
  console.log(`denoise: noise ${db(n1 / n0).toFixed(2)} dB, tone+noise ${db(t1 / t0).toFixed(2)} dB`);
  expect(db(n1 / n0)).toBeLessThanOrEqual(-6);
  expect(Math.abs(db(t1 / t0))).toBeLessThan(1.5);
});

// Noise reduction estimates its noise floor per decoded piece (D4: the quietest 10 % of the piece's frames), so
// its seams hold for stationary noise (`steady`); see the Task 7 report for non-stationary measurements.
const SEAM_CASES: [string, 'noisy' | 'steady', AudioEffect[]][] = [
  ['pitch +12', 'noisy', [effect('pitch', { semitones: 12 })]],
  ['pitch -12', 'noisy', [effect('pitch', { semitones: -12 })]],
  ['pitch +5 after EQ', 'noisy', [effect('eq', { high: 6 }), effect('pitch', { semitones: 5 })]],
  ['denoise 0.5', 'steady', [effect('denoise', { strength: 0.5 })]],
  ['denoise 0.5 + pitch -4', 'steady', [effect('denoise', { strength: 0.5 }), effect('pitch', { semitones: -4 })]],
];

for (const [name, fixture, effects] of SEAM_CASES) {
  test(`seams: ${name} renders the same in 1 s windows as in one pass`, async ({ page }) => {
    await openHarness(page);
    const [m] = await importPaths(page, [fx[fixture]]);
    // The clip starts at 0.3 s, so the 1 s cuts fall at 0.7, 1.7, ... s into it.
    const p = withEffects(m, effects, { start: 0.3 });
    const r = await page.evaluate(({ p, sr }) => window.cf.mixdownSeam(p, sr, 1), { p, sr: SR });
    expect(r).not.toBeNull();
    if (!r) return;
    console.log(`seam ${name}: rmsDiff ${r.rmsDiff.toExponential(2)} maxDiff ${r.maxDiff.toExponential(2)} rms ${r.rms.toFixed(3)}`);
    expect(r.lengths[0]).toBe(r.lengths[1]);
    expect(r.rms).toBeGreaterThan(0.05);
    expect(r.rmsDiff).toBeLessThan(2e-3);
  });
}

// Pitch is sample-exact live and in export. Noise reduction estimates its floor per decoded piece, and live pieces
// (1 s windows here) are not the export's: the same per-piece variation as its seams (maxDiff ~8e-3 there).
for (const [name, fixture, effects, tol] of [
  ['pitch +6', 'noisy', [effect('pitch', { semitones: 6 })], 2e-3],
  ['noise reduction 0.5 + pitch -4', 'steady', [effect('denoise', { strength: 0.5 }), effect('pitch', { semitones: -4 })], 1e-2],
] as const) {
  test(`live playback with ${name} matches the export`, async ({ page }) => {
    await openHarness(page);
    const [m] = await importPaths(page, [fx[fixture]]);
    const p = withEffects(m, [...effects]);
    const r = await page.evaluate(({ p, sr }) => window.cf.liveVersusMixdown(p, 2, 1, sr), { p, sr: SR });
    expect(r).not.toBeNull();
    if (!r) return;
    console.log(`live vs export ${name}: maxDiff ${r.maxDiff.toExponential(2)} peak ${r.peak.toFixed(3)}`);
    expect(r.covered).toBe(true);
    expect(r.peak).toBeGreaterThan(0.1);
    expect(r.maxDiff).toBeLessThan(tol);
    expect(r.schedule.every((s) => s.late === 0)).toBe(true);
  });
}

test('an export with pitch and noise reduction lasts the timeline (ffprobe, within one frame)', async ({ page }, info) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.hiss]);
  const p = withEffects(m, [effect('denoise', { strength: 0.7 }), effect('pitch', { semitones: -4 })]);
  const b64 = await page.evaluate((p) => window.cf.exportBase64(p, 32), p);
  const file = info.outputPath('pitch-denoise.mp4');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString(),
  ) as { format: { duration: string }; streams: { codec_type: string; duration: string }[] };
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  console.log(`ffprobe: format ${probe.format.duration} s, audio ${audio?.duration} s`);
  expect(audio).toBeDefined();
  expect(Math.abs(Number(probe.format.duration) - 3)).toBeLessThanOrEqual(1 / FPS);
  expect(Math.abs(Number(audio!.duration) - 3)).toBeLessThanOrEqual(1 / FPS);
});

test('Inspector: pitch and noise reduction can be added; Deep voice and Chipmunk apply in one step', async ({ page }) => {
  await open(page);
  await importFiles(page, [fx.tone440], 1);
  await addToTimeline(page, 'fx-tone-440.wav', 1);
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  const present = (): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
  const effects = async () => (await present()).tracks.flatMap((t) => t.clips).find((x) => x.id === c.id)!.audio.effects;
  const depth = async () => (await playerState(page)).undoDepth;

  const addable = await page.getByTestId('effect-add').locator('option').allTextContents();
  expect(addable).toEqual(expect.arrayContaining(['Pitch', 'Noise reduction']));
  const presets = await page.getByTestId('audio-preset').locator('option').allTextContents();
  expect(presets).toEqual(expect.arrayContaining(['Deep voice', 'Chipmunk']));

  for (const [type, key] of [['pitch', 'semitones'], ['denoise', 'strength']] as const) {
    const d = await depth();
    await page.getByTestId('effect-add').selectOption(type);
    await page.getByTestId('effect-add-button').click();
    expect(await depth()).toBe(d + 1);
    const added = (await effects()).at(-1)!;
    expect(added).toMatchObject({ type, enabled: true, params: defaultParams(type) });
    await expect(page.getByTestId(`effect-${added.id}-${key}`)).toBeVisible();
  }

  for (const [key, st] of [['deep', -4], ['chipmunk', 6]] as const) {
    const d = await depth();
    await page.getByTestId('audio-preset').selectOption(key);
    expect(await depth()).toBe(d + 1);
    expect((await effects()).map((e) => [e.type, e.params.semitones])).toEqual([['pitch', st]]);
  }
});
