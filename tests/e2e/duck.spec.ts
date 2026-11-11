// Auto-ducking (D5): a music track dips under the audible clips of a voice track, in export and live, and its UI.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import { clearToasts, expectOnlyToast, open, playerState, toast, trackErrors } from './helpers';
import { defaultClipAudio, newTrack } from '../../src/core/model';
import type { MediaRef, Project, Track } from '../../src/core/model';

test.setTimeout(120_000);

const dir = ensureFixtures();
/** Stereo 1 kHz, 6 s (the "voice"). */
const tone1k = join(dir, 'tone-1k.wav');
/** Mono 220 Hz, 600 s (the "music"). */
const longTone = join(dir, 'long-tone.m4a');
const SR = 48000;
const DUCK = { amountDb: -12, attack: 0.2, release: 0.5 };

/**
 * Music (0..8 s, centre) ducks under a voice clip at 3.1..5.1 s panned hard LEFT, so the RIGHT channel carries the
 * music alone. The 1 s window cut at 3.0 s falls inside the attack ramp (2.9..3.1 s).
 */
function duckProject(voice: MediaRef, music: MediaRef, voiceTrack: Partial<Track> = {}, span = { start: 3.1, dur: 2, music: 8 }): Project {
  const p = project({ width: 64, height: 36, fps: 10 }, [voice, music], []);
  const v = clipOf(voice, { kind: 'audio', start: span.start, out: span.dur, audio: { ...defaultClipAudio(), pan: -1 } });
  const m = clipOf(music, { kind: 'audio', start: 0, out: span.music });
  const tracks: Track[] = [
    p.tracks[0],
    { ...newTrack('audio'), id: 'voice', clips: [v], ...voiceTrack },
    { ...newTrack('audio'), id: 'music', clips: [m], duck: { sourceTrackId: 'voice', ...DUCK } },
  ];
  return { ...p, tracks };
}

async function rightRms(page: Page, p: Project, windows: [number, number][]): Promise<number[]> {
  const r = await page.evaluate(({ p, sr, windows }) => window.cf.mixdownChannelRms(p, sr, windows), { p, sr: SR, windows });
  expect(r).not.toBeNull();
  return (r!.rms as [number, number][]).map(([, right]) => right);
}

const db = (a: number, b: number): number => 20 * Math.log10(a / b);

test('export: music dips 12 dB under the voice clip and returns after the release', async ({ page }) => {
  await openHarness(page);
  const [voice, music] = await importPaths(page, [tone1k, longTone]);
  const windows: [number, number][] = [[0.5, 2.5], [3.3, 5.0], [5.8, 7.5]];
  const [before, during, after] = await rightRms(page, duckProject(voice, music), windows);
  console.log(`duck: before ${before.toFixed(4)} during ${during.toFixed(4)} (${db(during, before).toFixed(2)} dB) after ${after.toFixed(4)}`);
  expect(before).toBeGreaterThan(0.05);
  expect(Math.abs(db(during, before) + 12)).toBeLessThan(1.5);
  expect(Math.abs(db(after, before))).toBeLessThan(0.2);

  // Muting the voice track removes the ducking (mute wins: a muted trigger is not audible).
  const [mb, md] = await rightRms(page, duckProject(voice, music, { muted: true }), windows.slice(0, 2));
  console.log(`duck muted voice: before ${mb.toFixed(4)} during ${md.toFixed(4)} (${db(md, mb).toFixed(2)} dB)`);
  expect(Math.abs(db(md, mb))).toBeLessThan(0.2);
});

test('export: 1 s windows equal one pass with a cut inside the attack ramp', async ({ page }) => {
  await openHarness(page);
  const [voice, music] = await importPaths(page, [tone1k, longTone]);
  const r = await page.evaluate(({ p, sr }) => window.cf.mixdownSeam(p, sr, 1), { p: duckProject(voice, music), sr: SR });
  expect(r).not.toBeNull();
  console.log(`duck seam: rmsDiff ${r!.rmsDiff.toExponential(2)} maxDiff ${r!.maxDiff.toExponential(2)} rms ${r!.rms.toFixed(3)}`);
  expect(r!.lengths[0]).toBe(r!.lengths[1]);
  expect(r!.rmsDiff).toBeLessThan(1e-3);
  expect(r!.maxDiff).toBeLessThan(1e-3);
});

test('live playback ducks like the export (1 s live windows, a cut inside the attack)', async ({ page }) => {
  await openHarness(page);
  const [voice, music] = await importPaths(page, [tone1k, longTone]);
  // The offline harness clock does not run, so only the first 2 s are scheduled: voice 1.1..1.7 s, attack 0.9..1.1 s.
  const p = duckProject(voice, music, {}, { start: 1.1, dur: 0.6, music: 3 });
  const r = await page.evaluate(({ p, sr }) => window.cf.liveVersusMixdown(p, 2, 1, sr), { p, sr: SR });
  expect(r).not.toBeNull();
  console.log(`duck live vs export: maxDiff ${r!.maxDiff.toExponential(2)} peak ${r!.peak.toFixed(3)}`);
  expect(r!.covered).toBe(true);
  expect(r!.peak).toBeGreaterThan(0.05);
  expect(r!.maxDiff).toBeLessThan(1e-3);
});

// ---- UI ----

const tracksOf = (page: Page): Promise<Track[]> => page.evaluate(() => window.__clipforge!.getState().history.present.tracks);
const depth = async (page: Page): Promise<number> => (await playerState(page)).undoDepth;
const f = (page: Page, id: string): Locator => page.getByTestId(id);
const duckOf = async (page: Page, id: string) => (await tracksOf(page)).find((t) => t.id === id)!.duck;

async function enter(page: Page, id: string, value: string): Promise<void> {
  await f(page, id).fill(value);
  await f(page, id).press('Enter');
}

test('UI: choose a source, edit the shape, refuse a cycle, turn off; one undo step each', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await f(page, 'btn-add-audio-track').click();
  const [a, b] = (await tracksOf(page)).filter((t) => t.kind === 'audio');
  const header = page.locator(`[data-testid="track-header"][data-track-id="${b.id}"]`);
  const height = (await header.boundingBox())!.height;
  await header.getByTestId('track-btn-lock').click(); // a locked track still takes ducking (track setting)

  await f(page, `duck-toggle-${b.id}`).click();
  await expect(f(page, `duck-panel-${b.id}`)).toBeVisible();
  expect((await header.boundingBox())!.height).toBe(height);
  await expect(f(page, `duck-source-${b.id}`).locator('option')).toHaveText(['Off', 'Video 1', 'Audio 1']);
  await expect(f(page, `duck-amount-${b.id}`)).toBeDisabled();

  let d = await depth(page);
  await f(page, `duck-source-${b.id}`).selectOption(a.id);
  expect(await depth(page)).toBe(d + 1);
  expect(await duckOf(page, b.id)).toEqual({ sourceTrackId: a.id, amountDb: -12, attack: 0.2, release: 0.5 });
  for (const [id, value, key, want] of [
    ['amount', '-20', 'amountDb', -20],
    ['attack', '0.1', 'attack', 0.1],
    ['release', '1', 'release', 1],
  ] as const) {
    d = await depth(page);
    await enter(page, `duck-${id}-${b.id}`, value);
    expect(await depth(page), id).toBe(d + 1);
    expect((await duckOf(page, b.id))![key]).toBe(want);
  }
  await expect(f(page, `duck-toggle-${b.id}`)).toHaveAttribute('aria-pressed', 'true');

  // Escape closes the popover and returns focus to the toggle.
  await f(page, `duck-amount-${b.id}`).focus();
  await page.keyboard.press('Escape');
  await expect(f(page, `duck-panel-${b.id}`)).toHaveCount(0);
  await expect(f(page, `duck-toggle-${b.id}`)).toBeFocused();

  // A under B while B ducks under A is a cycle: refused with a toast, nothing changes.
  await f(page, `duck-toggle-${a.id}`).click();
  d = await depth(page);
  await f(page, `duck-source-${a.id}`).selectOption(b.id);
  await expectOnlyToast(page, 'Ducking cannot form a cycle');
  // The toast stays visible and stacks above the open popover (both are fixed layers of the body).
  await expect(f(page, `duck-panel-${a.id}`)).toBeVisible();
  await expect(toast(page)).toBeVisible();
  const z = await page.evaluate(
    (id) => [document.querySelector(`[data-testid="${id}"]`)!, document.querySelector('.toasts')!].map((el) => Number(getComputedStyle(el).zIndex)),
    `duck-panel-${a.id}`,
  );
  expect(z[0]).toBeLessThan(z[1]);
  expect(await depth(page)).toBe(d);
  expect(await duckOf(page, a.id)).toBeNull();
  await expect(f(page, `duck-source-${a.id}`)).toHaveValue('');
  await page.keyboard.press('Escape');

  await f(page, `duck-toggle-${b.id}`).click();
  d = await depth(page);
  await f(page, `duck-off-${b.id}`).click();
  expect(await depth(page)).toBe(d + 1);
  expect(await duckOf(page, b.id)).toBeNull();
  await page.getByTestId('btn-undo').click();
  expect((await duckOf(page, b.id))!.release).toBe(1);
  expect(errors).toEqual([]);
});

test('UI: removing the source track turns the dependent duck off in one undo step, without a toast', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await f(page, 'btn-add-audio-track').click();
  const [a, b] = (await tracksOf(page)).filter((t) => t.kind === 'audio');
  await f(page, `duck-toggle-${b.id}`).click();
  await f(page, `duck-source-${b.id}`).selectOption(a.id);
  await page.keyboard.press('Escape');
  await expect(f(page, `duck-toggle-${b.id}`)).toHaveAttribute('aria-pressed', 'true');
  await clearToasts(page);

  const d = await depth(page);
  await page.locator(`[data-testid="track-header"][data-track-id="${a.id}"]`).getByTestId('track-btn-remove').click();
  await expect(page.locator(`[data-testid="track-header"][data-track-id="${a.id}"]`)).toHaveCount(0);
  expect(await depth(page)).toBe(d + 1);
  expect(await duckOf(page, b.id)).toBeNull();
  await expect(f(page, `duck-toggle-${b.id}`)).toHaveAttribute('aria-pressed', 'false');
  await expect(toast(page)).toHaveCount(0);

  await page.getByTestId('btn-undo').click();
  expect((await duckOf(page, b.id))!.sourceTrackId).toBe(a.id);
  await expect(f(page, `duck-toggle-${b.id}`)).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('UI: the popover closes when the timeline scrolls or the window resizes', async ({ page }) => {
  await open(page);
  const [a] = (await tracksOf(page)).filter((t) => t.kind === 'audio');
  await f(page, `duck-toggle-${a.id}`).click();
  await expect(f(page, `duck-panel-${a.id}`)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(f(page, `duck-panel-${a.id}`)).toHaveCount(0);
  // A short timeline that scrolls vertically: a scroll that moves the toggle closes the popover.
  await f(page, 'btn-add-audio-track').click();
  await f(page, 'btn-add-audio-track').click();
  await f(page, 'timeline-scroll').evaluate((el) => {
    el.style.height = '140px';
    el.style.flex = 'none';
    el.scrollTop = 0;
  });
  await f(page, `duck-toggle-${a.id}`).click();
  await expect(f(page, `duck-panel-${a.id}`)).toBeVisible();
  const moved = await f(page, 'timeline-scroll').evaluate((el) => {
    el.scrollTop += 30;
    return el.scrollTop;
  });
  expect(moved).toBeGreaterThan(0);
  await expect(f(page, `duck-panel-${a.id}`)).toHaveCount(0);
});
