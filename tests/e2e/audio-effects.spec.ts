// Audio effects (Plan 3 Task 6): measurable signal changes per effect, window-seam equality (D7) and the
// Inspector effect list (one undo step per action; enabling/disabling changes the exported audio).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { audioFixtures } from './audio-fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { addToTimeline, clipEl, clipStates, importFiles, open, playerState, withAudio } from './helpers';
import { defaultParams } from '../../src/audio/effects/params';
import { defaultClipAudio } from '../../src/core/model';
import type { AudioEffect, AudioEffectType, Clip, MediaRef, Project } from '../../src/core/model';

test.setTimeout(120_000);

const SR = 48000;
const fx = audioFixtures();
const db = (r: number): number => 20 * Math.log10(r);

let seq = 0;
const effect = (type: AudioEffectType, params: Record<string, number> = {}, enabled = true): AudioEffect => ({
  id: `fx-${++seq}`,
  type,
  enabled,
  params: { ...defaultParams(type), ...params },
});

function withEffects(m: MediaRef, effects: AudioEffect[], over: Partial<Clip> = {}): Project {
  const clip = clipOf(m, { ...over, audio: { ...defaultClipAudio(), effects } });
  const p = project({ width: 64, height: 36, fps: 10 }, [m], []);
  return { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips: [clip] } : t)) };
}

/** Left-channel RMS of the export mixdown over each [from, to) window. */
async function rms(page: Page, p: Project, windows: [number, number][]): Promise<number[]> {
  const r = await page.evaluate(({ p, sr, windows }) => window.cf.mixdownChannelRms(p, sr, windows), { p, sr: SR, windows });
  expect(r).not.toBeNull();
  return r!.rms.map(([l]) => l);
}

const STEADY: [number, number][] = [[0.8, 2.2]];

test('low-pass and high-pass: the stop band falls by > 20 dB, the pass band stays within 1 dB', async ({ page }) => {
  await openHarness(page);
  const [lo, hi] = await importPaths(page, [fx.tone100, fx.tone4k]);
  const level = async (m: MediaRef, e: AudioEffect[]) => (await rms(page, withEffects(m, e), STEADY))[0];
  const [lo0, hi0] = [await level(lo, []), await level(hi, [])];
  expect(lo0).toBeGreaterThan(0.1);
  // The low-pass range starts at 1 kHz (the brief's 500 Hz is outside it): 4 kHz is two octaves up, ~24 dB.
  const lp = [effect('lowpass', { freq: 1000 })];
  expect(db((await level(hi, lp)) / hi0)).toBeLessThan(-20);
  expect(Math.abs(db((await level(lo, lp)) / lo0))).toBeLessThan(1);
  const hp = [effect('highpass', { freq: 1000 })];
  expect(db((await level(lo, hp)) / lo0)).toBeLessThan(-20);
  expect(Math.abs(db((await level(hi, hp)) / hi0))).toBeLessThan(1);
});

test('EQ high +12 dB raises an 8 kHz tone by about 12 dB', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone8k]);
  const [flat] = await rms(page, withEffects(m, []), STEADY);
  const [boosted] = await rms(page, withEffects(m, [effect('eq', { high: 12 })]), STEADY);
  expect(Math.abs(db(boosted / flat) - 12)).toBeLessThan(1.5);
});

test('compressor: a loud burst gains less than a quiet one (the ratio of their levels drops)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.bursts]);
  const W: [number, number][] = [[1, 1.9], [3, 3.9]];
  const [q0, l0] = await rms(page, withEffects(m, []), W);
  const [q1, l1] = await rms(page, withEffects(m, [effect('compressor', { threshold: -24, ratio: 4 })]), W);
  expect(l0 / q0).toBeGreaterThan(15);
  expect(l1 / q1).toBeLessThan(0.5 * (l0 / q0));
});

test('echo repeats a click `delay` s later; reverb leaves energy beyond 0.3 s', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.click]);
  const W: [number, number][] = [[0.095, 0.11], [0.2, 0.35], [0.395, 0.41], [0.45, 0.65]];
  const [click, gap0, at0, late0] = await rms(page, withEffects(m, []), W);
  expect(click).toBeGreaterThan(0.05);
  expect(Math.max(gap0, at0, late0)).toBeLessThan(1e-4);
  const [, gap, echo] = await rms(page, withEffects(m, [effect('echo', { delay: 0.3, feedback: 0.4, mix: 0.4 })]), W);
  expect(echo).toBeGreaterThan(0.3 * click);
  expect(gap).toBeLessThan(1e-4);
  const [, , , tail] = await rms(page, withEffects(m, [effect('reverb', { seconds: 1.5, mix: 0.5 })]), W);
  expect(tail).toBeGreaterThan(1e-3);
});

test('gain +6 dB doubles the amplitude', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone4k]);
  const [a] = await rms(page, withEffects(m, []), STEADY);
  const [b] = await rms(page, withEffects(m, [effect('gain', { gainDb: 6 })]), STEADY);
  expect(Math.abs(b / a / 1.9953 - 1)).toBeLessThan(0.03);
});

const SEAM_CASES: [string, AudioEffect[]][] = [
  ['eq', [effect('eq', { low: 6, mid: -6, high: 9 })]],
  ['highpass', [effect('highpass', { freq: 500 })]],
  ['lowpass', [effect('lowpass', { freq: 1500 })]],
  ['compressor', [effect('compressor')]],
  ['reverb', [effect('reverb', { seconds: 1.5, mix: 0.5 })]],
  ['echo', [effect('echo')]],
  ['gain', [effect('gain', { gainDb: 6 })]],
  ['podcast chain', [effect('highpass', { freq: 80 }), effect('eq', { high: 3 }), effect('compressor', { makeup: 4 }), effect('echo', { feedback: 0.2 })]],
];

for (const [name, effects] of SEAM_CASES) {
  test(`seams: ${name} renders the same in 1 s windows as in one pass`, async ({ page }) => {
    await openHarness(page);
    const [m] = await importPaths(page, [fx.noisy]);
    // The clip starts at 0.3 s, so the 1 s cuts fall at 0.7, 1.7, ... s into it, with effect state to carry.
    const p = withEffects(m, effects, { start: 0.3 });
    const r = await page.evaluate(({ p, sr }) => window.cf.mixdownSeam(p, sr, 1), { p, sr: SR });
    expect(r).not.toBeNull();
    if (!r) return;
    console.log(`seam ${name}: rmsDiff ${r.rmsDiff.toExponential(2)} maxDiff ${r.maxDiff.toExponential(2)} rms ${r.rms.toFixed(3)}`);
    expect(r.lengths[0]).toBe(r.lengths[1]);
    expect(r.rms).toBeGreaterThan(0.05);
    expect(r.rmsDiff).toBeLessThan(1e-3);
  });
}

test('compressor seams hold after a long recovery (threshold -60, ratio 20, release 1 s)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.loudThenQuiet]);
  // Loud until 2 s, then quiet: the cuts at 3, 4, 5 s fall 1-3 s into the gain recovery (Chromium: about 1.25 s;
  // the specified 10 dB per release time would be about 6 s).
  const p = withEffects(m, [effect('compressor', { threshold: -60, ratio: 20, release: 1 })]);
  const r = await page.evaluate(({ p, sr }) => window.cf.mixdownSeam(p, sr, 1), { p, sr: SR });
  expect(r).not.toBeNull();
  if (!r) return;
  console.log(`seam compressor recovery: rmsDiff ${r.rmsDiff.toExponential(2)} maxDiff ${r.maxDiff.toExponential(2)} rms ${r.rms.toFixed(3)}`);
  expect(r.rmsDiff).toBeLessThan(1e-3);
  // The recovery is short next to 8 s of audio, so the RMS dilutes a seam jump; the largest difference does not
  // (a 0.5 s pre-roll gives maxDiff 8e-3 here).
  expect(r.maxDiff).toBeLessThan(1e-4);
});

test('a reverb tail is ramped out at the clip end (no click), identically in windows and in one pass', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.tone100]);
  // The clip ends at 1.0025 s, a peak of the 100 Hz tone, with the reverb ringing; a later clip extends the mix.
  const clip = clipOf(m, { out: 1.0025, audio: { ...defaultClipAudio(), effects: [effect('reverb', { seconds: 1, mix: 0.5 })] } });
  const later = clipOf(m, { start: 2, out: 0.5 });
  const base = project({ width: 64, height: 36, fps: 10 }, [m], []);
  const p = { ...base, tracks: base.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips: [clip, later] } : t)) };
  const step = await page.evaluate(({ p, sr }) => window.cf.mixdownMaxStep(p, sr, 1.0025 - 0.02, 1.0025 + 0.005), { p, sr: SR });
  const body = await page.evaluate(({ p, sr }) => window.cf.mixdownMaxStep(p, sr, 0.5, 0.9), { p, sr: SR });
  console.log(`clip-end step ${step} (steady-state step ${body})`);
  expect(step).not.toBeNull();
  expect(step!).toBeLessThan(0.02);
  // The 1 s cut falls inside the 8 ms ramp (0.9945..1.0025 s): both renders follow the same line.
  const r = await page.evaluate(({ p, sr }) => window.cf.mixdownSeam(p, sr, 1), { p, sr: SR });
  console.log(`seam clip-end ramp: rmsDiff ${r!.rmsDiff.toExponential(2)} maxDiff ${r!.maxDiff.toExponential(2)}`);
  expect(r!.rmsDiff).toBeLessThan(1e-3);
});

test('live playback with effects matches the export and joins its live windows', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.noisy]);
  // Pre-roll 0.5 + 0.5 s fits before the second 1 s live window, so it is played warm, not late.
  const p = withEffects(m, [effect('lowpass', { freq: 2000 }), effect('reverb', { seconds: 0.5, mix: 0.4 })]);
  const r = await page.evaluate(({ p, sr }) => window.cf.liveVersusMixdown(p, 2, 1, sr), { p, sr: SR });
  expect(r).not.toBeNull();
  if (!r) return;
  expect(r.covered).toBe(true);
  expect(r.peak).toBeGreaterThan(0.1);
  expect(r.maxDiff).toBeLessThan(1e-3);
  expect(r.schedule.every((s) => s.late === 0)).toBe(true);
});

test('live Play mid-clip decodes the first window without pre-roll (it would be in the past)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fx.noisy]);
  // Echo 1 s × 0.9 wants 30 s of pre-roll (clamped to the clip's in point: 4 s of history before the play point).
  const p = withEffects(m, [effect('echo', { delay: 1, feedback: 0.9 })]);
  const r = await page.evaluate(({ p }) => window.cf.liveMixerRun(p, 4, { windowSeconds: 1, ms: 0 }), { p });
  // Cold: [3.95, 5] s decoded, about 1.05 s; warm would have been the whole 5 s.
  expect(r.during.largestBuffer).toBeLessThan(48000 * 1.2 * 2);
  expect(r.schedule.length).toBe(1);
});

const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = async (page: Page): Promise<number> => (await playerState(page)).undoDepth;

test('effect list: add EQ and change a parameter (one undo step each); disabling changes the export', async ({ page, context }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();

  let d = await depth(page);
  await expect(page.getByTestId('effect-add-button')).toBeDisabled();
  await page.getByTestId('effect-add').selectOption('eq');
  // Choosing a type only stages it (a <select> changes per arrow key); the button adds it.
  expect(await depth(page)).toBe(d);
  await page.getByTestId('effect-add-button').click();
  expect(await depth(page)).toBe(d + 1);
  await expect(page.getByTestId('effect-add-button')).toBeDisabled();
  const clipOfP = (p: Project) => p.tracks.flatMap((t) => t.clips).find((x) => x.id === c.id)!;
  const [eq] = clipOfP(await present(page)).audio.effects;
  expect(eq).toMatchObject({ type: 'eq', enabled: true, params: { low: 0, mid: 0, high: 0 } });

  d = await depth(page);
  // fill() sets the value and fires input + change, like a released drag.
  await page.getByTestId(`effect-${eq.id}-mid`).fill('-12');
  expect(await depth(page)).toBe(d + 1);
  expect(clipOfP(await present(page)).audio.effects[0].params.mid).toBe(-12);
  const on = await present(page);

  d = await depth(page);
  await page.getByTestId(`effect-${eq.id}-toggle`).uncheck();
  expect(await depth(page)).toBe(d + 1);
  const off = await present(page);
  expect(clipOfP(off).audio.effects[0].enabled).toBe(false);
  await expect(page.getByTestId(`effect-${eq.id}-mid`)).toBeDisabled();

  await page.keyboard.press('ControlOrMeta+z');
  expect(clipOfP(await present(page)).audio.effects[0].enabled).toBe(true);
  await page.keyboard.press('ControlOrMeta+z');
  expect(clipOfP(await present(page)).audio.effects[0].params.mid).toBe(0);

  // Only available presets are offered (pitch presets arrive with the pitch effect).
  const presets = await page.getByTestId('audio-preset').locator('option').allTextContents();
  expect(presets.slice(1)).toEqual(['Podcast voice', 'Radio', 'Telephone']);
  const addable = await page.getByTestId('effect-add').locator('option').allTextContents();
  expect(addable).not.toContain('Pitch');

  // Same origin: the harness reads the media the app imported. The 440 Hz tone with mid −12 dB is quieter.
  const h = await context.newPage();
  await openHarness(h);
  const level = async (p: Project) =>
    (await h.evaluate(({ p, sr }) => window.cf.mixdownChannelRms(p, sr, [[0.5, 2.5]]), { p, sr: SR }))!.rms[0][0];
  const [a, b] = [await level(on), await level(off)];
  expect(b).toBeGreaterThan(0.01);
  expect(db(a / b)).toBeLessThan(-3);
});

test('presets replace the chain in one step; Normalise sets a gain effect in one step', async ({ page }) => {
  await open(page);
  await importFiles(page, [join(audioFixtures().tone4k)], 1);
  await addToTimeline(page, 'fx-tone-4k.wav', 1);
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  const clipOfP = (p: Project) => p.tracks.flatMap((t) => t.clips).find((x) => x.id === c.id)!;

  let d = await depth(page);
  await page.getByTestId('audio-preset').selectOption('telephone');
  expect(await depth(page)).toBe(d + 1);
  expect(clipOfP(await present(page)).audio.effects.map((e) => e.type)).toEqual(['highpass', 'lowpass', 'eq']);

  d = await depth(page);
  await page.getByTestId('audio-normalise').click();
  await expect.poll(() => depth(page)).toBe(d + 1);
  const gain = clipOfP(await present(page)).audio.effects.find((e) => e.type === 'gain')!;
  // A 0.25 peak to -1 dBFS: +11.04 dB (8-bit peaks: within 0.15 dB).
  expect(Math.abs(gain.params.gainDb - 20 * Math.log10(0.8913 / 0.25))).toBeLessThan(0.15);
});
