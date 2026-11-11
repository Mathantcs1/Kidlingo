// Audio editing UI: Detach audio, fade/pan fields in the inspector, and the track-header volume slider.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, playerState, trackErrors, withAudio, noAudio } from './helpers';
import type { Clip, Track } from '../../src/core/model';

test.setTimeout(60_000);

function png(): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'still.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', out], { stdio: 'pipe' });
  return out;
}

const tracks = (page: Page): Promise<Track[]> => page.evaluate(() => window.__clipforge!.getState().history.present.tracks);
const clipById = (page: Page, id: string): Promise<Clip> =>
  page.evaluate((id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!, id);
const depth = async (page: Page): Promise<number> => (await playerState(page)).undoDepth;
const f = (page: Page, id: string): Locator => page.getByTestId(id);

async function enter(page: Page, id: string, value: string): Promise<void> {
  await f(page, id).fill(value);
  await f(page, id).press('Enter');
}

/** Imports the given files, adds the first to the timeline and selects its clip. */
async function setup(page: Page, files: string[], name: string): Promise<string> {
  await open(page);
  await importFiles(page, files, files.length);
  await addToTimeline(page, name, 1);
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  return c.id;
}

test('Detach audio adds an audio clip and a badge; one undo restores both', async ({ page }) => {
  const errors = trackErrors(page);
  const id = await setup(page, [withAudio], 'with-audio.mp4');
  await expect(f(page, 'audio-detach')).toBeEnabled();
  await expect(f(page, 'clip-detached-badge')).toHaveCount(0);
  const before = await depth(page);
  await f(page, 'audio-detach').click();
  expect(await depth(page)).toBe(before + 1);
  const states = await clipStates(page);
  expect(states.filter((c) => c.trackKind === 'audio')).toHaveLength(1);
  expect((await clipById(page, id)).audio.silent).toBe(true);
  await expect(clipEl(page, id).getByTestId('clip-detached-badge')).toBeVisible();
  await expect(f(page, 'audio-detach')).toBeDisabled();

  await page.keyboard.press('ControlOrMeta+z');
  expect(await depth(page)).toBe(before);
  expect((await clipStates(page)).filter((c) => c.trackKind === 'audio')).toHaveLength(0);
  expect((await clipById(page, id)).audio.silent).toBe(false);
  await expect(f(page, 'clip-detached-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Attach back removes the detached twin in one step', async ({ page }) => {
  const id = await setup(page, [withAudio], 'with-audio.mp4');
  await f(page, 'audio-detach').click();
  await expect(f(page, 'audio-attach')).toBeVisible();
  const before = await depth(page);
  await f(page, 'audio-attach').click();
  expect(await depth(page)).toBe(before + 1);
  expect((await clipStates(page)).filter((c) => c.trackKind === 'audio')).toHaveLength(0);
  expect((await clipById(page, id)).audio.silent).toBe(false);
  await expect(f(page, 'audio-attach')).toHaveCount(0);
});

test('Detach is disabled, with the reason as its hint, in every unavailable case', async ({ page }) => {
  await open(page);
  await importFiles(page, [png(), noAudio, withAudio], 3);
  await addToTimeline(page, 'still.png', 1);
  await addToTimeline(page, 'no-audio.mp4', 2);
  await addToTimeline(page, 'with-audio.mp4', 3);
  const [img, silentVideo, video] = await clipStates(page);
  const detach = f(page, 'audio-detach');
  const expectReason = async (title: string): Promise<void> => {
    await expect(detach).toBeDisabled();
    await expect(detach).toHaveAttribute('title', title);
    await expect(detach).toHaveAttribute('aria-description', title);
  };
  const select = async (id: string): Promise<void> => {
    await clipEl(page, id).click();
    await expect(clipEl(page, id)).toHaveAttribute('data-selected', 'true');
  };
  await select(img.id);
  await expectReason('Images have no sound');
  await select(silentVideo.id);
  await expectReason('This clip has no audio');
  await clipEl(page, video.id).click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-testid="timeline-clip"][data-selected="true"]')).toHaveCount(2);
  await expectReason('Select a single clip');
  await select(video.id);
  await expect(detach).toBeEnabled();
  await detach.click();
  await expectReason('Audio is already detached');
  await page.getByTestId('btn-undo').click();
  const header = page.locator(`[data-testid="track-header"][data-track-id="${video.trackId}"]`);
  await header.getByTestId('track-btn-lock').click();
  await select(video.id);
  await expectReason('Track is locked');
});

test('keyboard Detach and Attach keep focus on a useful control', async ({ page }) => {
  await setup(page, [withAudio], 'with-audio.mp4');
  await f(page, 'audio-detach').focus();
  await page.keyboard.press('Enter');
  await expect(f(page, 'audio-attach')).toBeFocused();
  await expect(f(page, 'audio-attach')).toHaveAttribute('title', /Deletes the detached audio clip/);
  await page.keyboard.press('Enter');
  await expect(f(page, 'audio-detach')).toBeFocused();
});

test('Attach back is not offered for an edited twin', async ({ page }) => {
  await setup(page, [withAudio], 'with-audio.mp4');
  await f(page, 'audio-detach').click();
  const twin = (await clipStates(page)).find((c) => c.trackKind === 'audio')!;
  const video = (await clipStates(page)).find((c) => c.trackKind === 'video')!;
  await clipEl(page, twin.id).click();
  await enter(page, 'audio-pan', '30');
  await clipEl(page, video.id).click();
  await expect(f(page, 'audio-attach')).toHaveCount(0);
});

test('Delete on the focused track-volume slider does not delete the selected clip', async ({ page }) => {
  await setup(page, [withAudio], 'with-audio.mp4');
  const audioTrack = (await tracks(page)).find((t) => t.kind === 'audio')!;
  await f(page, `track-volume-${audioTrack.id}`).focus();
  const before = await depth(page);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect(await depth(page)).toBe(before);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
});

test('fade and pan fields each commit one undo step', async ({ page }) => {
  const id = await setup(page, [withAudio], 'with-audio.mp4');
  await expect(f(page, 'audio-fade-in')).toHaveValue('0');
  await expect(f(page, 'audio-pan')).toHaveValue('0');
  let d = await depth(page);
  await enter(page, 'audio-fade-in', '0.5');
  await enter(page, 'audio-fade-out', '1');
  await enter(page, 'audio-pan', '-50');
  expect(await depth(page)).toBe(d + 3);
  const a = (await clipById(page, id)).audio;
  expect([a.fadeIn, a.fadeOut, a.pan]).toEqual([0.5, 1, -0.5]);
  await expect(f(page, 'audio-pan-label')).toHaveText('Pan L50');
  // No change, Escape and blur add nothing.
  d = await depth(page);
  await f(page, 'audio-fade-in').press('Enter');
  await f(page, 'audio-fade-in').fill('3');
  await f(page, 'audio-fade-in').press('Escape');
  await expect(f(page, 'audio-fade-in')).toHaveValue('0.5');
  expect(await depth(page)).toBe(d);
  await page.getByTestId('btn-undo').click(); // the focused text field would take Ctrl+Z natively
  expect((await clipById(page, id)).audio.pan).toBe(0);
  await expect(f(page, 'audio-pan')).toHaveValue('0');
});

test('the track volume slider commits once on release, and works on a locked track', async ({ page }) => {
  await setup(page, [withAudio], 'with-audio.mp4');
  const audioTrack = (await tracks(page)).find((t) => t.kind === 'audio')!;
  const slider = f(page, `track-volume-${audioTrack.id}`);
  const d = await depth(page);
  // Several input events (a drag) change nothing in the project; the single change event commits.
  await slider.evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (const v of ['120', '150', '80']) {
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(await depth(page)).toBe(d);
  await slider.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  expect(await depth(page)).toBe(d + 1);
  expect((await tracks(page)).find((t) => t.id === audioTrack.id)!.volume).toBe(0.8);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await tracks(page)).find((t) => t.id === audioTrack.id)!.volume).toBe(1);

  // Locked track: clip fields disabled, track volume still commits.
  await f(page, 'audio-detach').click();
  const audioClip = (await clipStates(page)).find((c) => c.trackKind === 'audio')!;
  const header = page.locator(`[data-testid="track-header"][data-track-id="${audioTrack.id}"]`);
  await header.getByTestId('track-btn-lock').click();
  await expect(header).toHaveClass(/is-locked/);
  await clipEl(page, audioClip.id).click();
  await expect(f(page, 'audio-fade-in')).toBeDisabled();
  await expect(f(page, 'audio-fade-out')).toBeDisabled();
  await expect(f(page, 'audio-pan')).toBeDisabled();
  const d2 = await depth(page);
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  expect(await depth(page)).toBe(d2 + 1);
  expect((await tracks(page)).find((t) => t.id === audioTrack.id)!.volume).toBeCloseTo(0.99);
});
