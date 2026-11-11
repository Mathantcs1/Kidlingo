// Voice-over recording with Chromium's fake microphone (a periodic beep; see the launch args in playwright.config.ts).
import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipStates, importFiles, mediaItem, noAudio, open, playerState, setPlayhead, toast, trackErrors } from './helpers';

test.setTimeout(150_000);

const DENIED = "Microphone access was blocked. Allow it for this site in the browser's address bar, then try again.";
const NO_DEVICE = "No microphone was found. Connect one (or choose an input in your computer's sound settings), then try again.";

/** Overall RMS level (dB) of the file's first audio stream, from ffmpeg's astats (printed on stderr). */
function rmsDb(path: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-map', '0:a:0', '-af', 'astats', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const overall = r.stderr.slice(r.stderr.lastIndexOf('Overall'));
  const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(overall);
  if (!m) throw new Error(`no astats output: ${r.stderr.slice(-500)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

const snapshot = (page: Page) =>
  page.evaluate(() => {
    const s = window.__clipforge!.getState();
    return { present: JSON.stringify(s.history.present), depth: s.history.past.length };
  });

const mediaList = (page: Page) =>
  page.evaluate(() => Object.values(window.__clipforge!.getState().history.present.media).map((m) => ({ ...m })));

const audioTracks = (page: Page) =>
  page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks
      .filter((t) => t.kind === 'audio')
      .map((t) => ({ id: t.id, clips: t.clips.map((c) => ({ mediaId: c.mediaId, start: c.start, in: c.in, out: c.out })) })),
  );

/** Starts recording and waits until the microphone is live (the timer shows mm:ss). */
async function startRecording(page: Page): Promise<void> {
  await page.getByTestId('record-button').click();
  await expect(page.getByTestId('record-timer')).toHaveText(/^\d\d:\d\d$/);
  await expect(page.getByTestId('record-button')).toHaveAttribute('aria-label', 'Stop recording');
  await expect(page.getByTestId('record-button')).toHaveAttribute('aria-pressed', 'true');
}

async function idle(page: Page): Promise<void> {
  await expect(page.getByTestId('record-button')).toHaveAttribute('aria-label', 'Record voice-over');
  await expect(page.getByTestId('record-timer')).toHaveCount(0);
}

async function recordFor(page: Page, ms: number): Promise<void> {
  await startRecording(page);
  await page.waitForTimeout(ms);
  await expect(page.getByTestId('record-timer')).toHaveText(/^00:0[1-9]$/);
  await page.getByTestId('record-button').click();
  await idle(page);
}

test('records 2 s from the fake microphone at the playhead: one undo step, audible export, survives reload', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  // A silent video clip so Play along has something to play and the export's sound can only be the voice-over.
  await importFiles(page, [noAudio], 1);
  await mediaItem(page, 'no-audio.mp4').getByTestId('btn-add-to-timeline').click();
  await setPlayhead(page, 1);
  const { playhead } = await playerState(page);
  expect(playhead).toBeCloseTo(1, 1);
  await expect(page.getByTestId('record-playalong')).toBeChecked();
  const before = await snapshot(page);
  const audioId = (await audioTracks(page))[0].id;

  await startRecording(page);
  await expect.poll(async () => (await playerState(page)).playing).toBe(true);
  await page.waitForTimeout(2000);
  await page.getByTestId('record-button').click();
  await idle(page);
  await expect.poll(async () => (await snapshot(page)).depth).toBe(before.depth + 1);
  expect((await playerState(page)).playing).toBe(false);

  const tracks = await audioTracks(page);
  expect(tracks).toHaveLength(1);
  expect(tracks[0].id).toBe(audioId);
  const [clip] = tracks[0].clips;
  const vo = (await mediaList(page)).find((m) => m.id === clip.mediaId);
  expect(vo).toMatchObject({ name: 'Voice-over 1', kind: 'audio' });
  expect(clip.start).toBe(playhead);
  expect(clip.in).toBe(0);
  const seconds = clip.out - clip.in;
  console.log(`recorded take: ${seconds.toFixed(3)} s`);
  expect(Math.abs(seconds - 2)).toBeLessThanOrEqual(0.3);
  await expect(mediaItem(page, 'Voice-over 1')).toHaveCount(1);

  // ONE undo removes the clip and its media from the project.
  await page.getByTestId('btn-undo').click();
  expect(await snapshot(page)).toEqual(before);
  await expect(mediaItem(page, 'Voice-over 1')).toHaveCount(0);
  await page.getByTestId('btn-redo').click();
  await expect(mediaItem(page, 'Voice-over 1')).toHaveCount(1);

  // The fake microphone's beep is in the exported AAC.
  await page.getByTestId('btn-export').click();
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const rms = rmsDb(await download.path());
  console.log(`export RMS: ${rms.toFixed(1)} dB`);
  expect(rms).toBeGreaterThan(-60);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);

  // Reload: the clip and its media (stored in OPFS) come back and the waveform draws.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  const after = await audioTracks(page);
  expect(after[0].clips).toEqual([clip]);
  expect(await page.evaluate(() => window.__clipforge!.listMediaIds())).toContain(clip.mediaId);
  await expect(mediaItem(page, 'Voice-over 1')).toHaveCount(1);
  await expect(async () => {
    const inked = await page.getByTestId('clip-waveform').evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
      return n;
    });
    expect(inked).toBeGreaterThan(0);
  }).toPass();
  expect(errors).toEqual([]);
});

test('Cancel and Escape discard the take: no media, no undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const before = await snapshot(page);
  await startRecording(page);
  await page.waitForTimeout(500);
  await page.getByTestId('record-cancel').click();
  await idle(page);
  await startRecording(page);
  await page.keyboard.press('Escape');
  await idle(page);
  await page.waitForTimeout(300);
  expect(await snapshot(page)).toEqual(before);
  expect(await clipStates(page)).toEqual([]);
  await expect(page.getByTestId('media-item')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a refused or missing microphone shows a plain-English toast and changes nothing', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { gumError: string };
    w.gumError = 'NotAllowedError';
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('stubbed', w.gumError));
  });
  await open(page);
  const before = await snapshot(page);
  await page.getByTestId('record-button').click();
  await expect(toast(page).locator('span')).toHaveText(DENIED);
  await idle(page);
  await page.locator('.toast-close').click();
  await page.evaluate(() => ((window as unknown as { gumError: string }).gumError = 'NotFoundError'));
  await page.getByTestId('record-button').click();
  await expect(toast(page).locator('span')).toHaveText(NO_DEVICE);
  await idle(page);
  expect(await snapshot(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('with the active audio track locked the take goes on a new audio track', async ({ page }) => {
  await open(page);
  const header = page.locator('[data-testid="track-header"][data-track-kind="audio"]').first();
  await header.click({ position: { x: 4, y: 4 } });
  await expect(header).toHaveAttribute('data-active', 'true');
  await header.getByTestId('track-btn-lock').click();
  await page.getByTestId('record-playalong').uncheck();
  await recordFor(page, 1200);
  const tracks = await audioTracks(page);
  expect(tracks).toHaveLength(2);
  expect(tracks[0].clips).toEqual([]);
  expect(tracks[1].clips).toHaveLength(1);
  expect(tracks[1].clips[0].start).toBe(0);
});
