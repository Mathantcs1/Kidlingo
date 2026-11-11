// Pitch shift and noise reduction (Plan 3 Task 7): measured pitch of the real export mix, window-seam equality (D7),
// live = export, an export checked with ffprobe, and the effects / presets offered in the Inspector. Noise reduction
// on its own: audio-denoise.spec.ts.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { FPS, SR, effect, withEffects } from './effect-helpers';
import { importPaths, openHarness } from './harness-helpers';
import { addToTimeline, clipEl, clipStates, importFiles, open, playerState } from './helpers';
import { defaultParams } from '../../src/audio/effects/params';
import type { AudioEffect, Project } from '../../src/core/model';

test.setTimeout(120_000);

const fx = audioFixtures();

const dominant = (page: Page, p: Project, from: number, to: number) =>
  page.evaluate(({ p, sr, from, to }) => window.cf.mixdownDominantFrequency(p, sr, from, to, 100, 1500), { p, sr: SR, from, to });

test('pitch +12 / -12 / 0 semitones move a 440 Hz tone to 880 / 220 / 440 Hz; the duration is unchanged', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone440]);
  for (const [st, f] of [[12, 880], [-12, 220], [0, 440], [6, 440 * 2 ** 0.5], [-4, 440 * 2 ** (-4 / 12)]]) {
    const r = await dominant(page, withEffects(m, [effect('pitch', { semitones: st })]), 0.5, 2.5);
    console.log(`pitch ${st} st: ${r?.freq.toFixed(2)} Hz (want ${f.toFixed(2)})`);
    expect(r).not.toBeNull();
    // Octaves land exactly; other shifts land on one of the two 10 Hz crossfade lines (1 / PITCH_WINDOW) around f.
    if (Math.abs(st) % 12 === 0) expect(Math.abs(r!.freq / f - 1)).toBeLessThan(0.02);
    else expect(Math.min(...[Math.floor(f / 10), Math.ceil(f / 10)].map((l) => Math.abs(r!.freq - 10 * l)))).toBeLessThan(1);
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

// Noise reduction uses ONE profile per clip (denoiseSource.clipNoiseProfile), so its seams hold on the
// non-stationary `noisy` fixture too. Two +12 shifters are compensated by 100 ms, so they read up to 0.1 s past each
// segment: more than the 0.05 s cut margin, so that case needs the effects' `post` margin (it fails with post 0).
// The optional 4th entry bounds the largest sample difference too (an RMS hides a few short bursts).
const SEAM_CASES: [string, 'noisy' | 'steady', AudioEffect[], number?][] = [
  ['pitch +12', 'noisy', [effect('pitch', { semitones: 12 })]],
  ['pitch -12', 'noisy', [effect('pitch', { semitones: -12 })]],
  ['pitch +5 after EQ', 'noisy', [effect('eq', { high: 6 }), effect('pitch', { semitones: 5 })]],
  ['denoise 0.5', 'noisy', [effect('denoise', { strength: 0.5 })], 1e-3],
  ['denoise 0.5 (speech-like)', 'steady', [effect('denoise', { strength: 0.5 })]],
  ['denoise 1 + pitch -4', 'noisy', [effect('denoise', { strength: 1 }), effect('pitch', { semitones: -4 })], 1e-3],
  ['pitch +12 + denoise 1', 'noisy', [effect('pitch', { semitones: 12 }), effect('denoise', { strength: 1 })], 1e-3],
  ['two pitch +12 (post margin)', 'noisy', [effect('pitch', { semitones: 12 }), effect('pitch', { semitones: 12 })], 1e-3],
];

for (const [name, fixture, effects, maxTol] of SEAM_CASES) {
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
    if (maxTol !== undefined) expect(r.maxDiff).toBeLessThan(maxTol);
  });
}

// Pitch is sample-exact live and in export; noise reduction uses the clip's one profile in both engines.
for (const [name, fixture, effects, tol] of [
  ['pitch +6', 'noisy', [effect('pitch', { semitones: 6 })], 2e-3],
  ['noise reduction 0.5 + pitch -4', 'noisy', [effect('denoise', { strength: 0.5 }), effect('pitch', { semitones: -4 })], 2e-3],
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
    // Noise reduction runs before the graph whatever its place: the row says so.
    if (type === 'denoise') await expect(page.getByTestId(`effect-${added.id}`)).toHaveAttribute('title', /always runs first/);
  }

  for (const [key, st] of [['deep', -4], ['chipmunk', 6]] as const) {
    const d = await depth();
    await page.getByTestId('audio-preset').selectOption(key);
    expect(await depth()).toBe(d + 1);
    expect((await effects()).map((e) => [e.type, e.params.semitones])).toEqual([['pitch', st]]);
  }
});
