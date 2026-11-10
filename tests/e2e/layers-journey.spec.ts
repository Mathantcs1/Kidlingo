// Whole-feature acceptance for the multi-layer timeline, through the real UI: a video and a PNG on two layers, the
// PNG shrunk and placed top-right with the inspector, hide/unhide and mute/unmute, a format round trip, a 1080p
// export checked with ffprobe and ffmpeg pixels, undo/redo, and a reload that restores layers, flags and transforms.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ffmpegFrame, ensureFixtures } from './fixtures';
import {
  PPS, addToTimeline, center, clipEl, clipStates, drag, importFiles, mediaItem, open, setPlayhead, withAudio,
} from './helpers';
import { expectPixel, isBlue, isRed, pixelAt } from './pip-helpers';
import type { Project, Transform } from '../../src/core/model';

test.setTimeout(240_000);

/** console.error messages that are expected during the journey. Empty: any console error fails the test. */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

const journeyPng = join(ensureFixtures(), 'journey.png');
/** journey.png is 160×80: left half red, right half blue. */
const PNG_W = 160;

interface Probe {
  format: { format_name: string; duration: string };
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
}

function ffprobe(path: string): Probe {
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path];
  return JSON.parse(execFileSync('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()) as Probe;
}

const project = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);

const header = (page: Page, id: string): Locator => page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);

function transformOf(page: Page, id: string): Promise<Transform> {
  return page.evaluate(
    (id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.transform,
    id,
  );
}

/** Format-px sample points in the middle of the PNG's red and blue halves, from its transform (rotation 0). */
function halves(f: { width: number; height: number }, t: Transform): { red: [number, number]; blue: [number, number] } {
  const cx = f.width / 2 + t.x;
  const cy = f.height / 2 + t.y;
  const q = (PNG_W / 4) * t.scale;
  return { red: [Math.round(cx - q), Math.round(cy)], blue: [Math.round(cx + q), Math.round(cy)] };
}

const near = (a: number[], b: number[], tol: number): boolean => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function enter(page: Page, name: string, value: string): Promise<void> {
  const field = page.getByTestId(`inspector-${name}`);
  await field.fill(value);
  await field.press('Enter');
}

/** Drags a clip's end handle so it lasts `seconds`. */
async function trimTo(page: Page, id: string, seconds: number): Promise<void> {
  const [c] = (await clipStates(page)).filter((x) => x.id === id);
  await drag(page, await center(clipEl(page, id).getByTestId('trim-end')), -(c.out - c.in - seconds) * PPS);
  const [after] = (await clipStates(page)).filter((x) => x.id === id);
  expect(Math.abs(after.out - after.in - seconds)).toBeLessThanOrEqual(0.05);
}

test('two layers: place a PNG top-right, hide/mute, format round trip, export, undo/redo and reload', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' || ALLOWED_CONSOLE_ERRORS.some((re) => re.test(m.text()))) return;
    consoleErrors.push(`${m.text()} @ ${m.location().url}`);
  });

  await open(page);
  await importFiles(page, [withAudio, journeyPng], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [video] = await clipStates(page);
  const videoTrack = video.trackId;

  // Layer 2, active on creation: the PNG lands on it.
  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header').and(page.locator('[data-track-kind="video"]'))).toHaveCount(2);
  const pngTrack = await page.evaluate(() => window.__clipforge!.getState().activeTrackId);
  expect(pngTrack).not.toBeNull();
  expect(pngTrack).not.toBe(videoTrack);
  await expect(header(page, pngTrack!)).toHaveAttribute('data-active', 'true');

  // The video alone at 0.5 s: the reference for "only the video" at the PNG's later location.
  await setPlayhead(page, 0.5);
  const fmt = (await project(page)).format;
  expect(fmt).toMatchObject({ width: 1920, height: 1080 });
  // The PNG's target placement: 25% of the frame width (scale 3 → 480×240), top-right, 40 px below the top edge,
  // centred at x 1440 so its red half covers the video's green bar and its blue half the video's red bar.
  const target: Transform = { x: 480, y: -1080 / 2 + 40 + 120, scale: 3, rotation: 0, opacity: 1 };
  const spots = halves(fmt, target);
  await expect.poll(async () => (await pixelAt(page, ...spots.red)).some((v) => v > 0)).toBe(true);
  const videoAt = { red: await pixelAt(page, ...spots.red), blue: await pixelAt(page, ...spots.blue) };
  // The video there is neither the PNG's red nor its blue, so "only the video" is distinguishable from the PNG.
  expect(isRed(videoAt.red) || isBlue(videoAt.blue), `video at the PNG spots: ${videoAt.red} / ${videoAt.blue}`).toBe(false);

  await mediaItem(page, 'journey.png').getByTestId('btn-add-to-timeline').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  const png = (await clipStates(page)).find((c) => c.trackId === pngTrack)!;
  expect(png).toMatchObject({ start: 0, in: 0 });
  expect((await clipStates(page)).find((c) => c.id === video.id)!.trackId).toBe(videoTrack);

  // Shrink and place it with the inspector fields (one undo step each).
  await clipEl(page, png.id).click();
  await expect(page.getByTestId('inspector-scale')).toBeEnabled();
  await enter(page, 'scale', '300');
  await enter(page, 'x', String(target.x));
  await enter(page, 'y', String(target.y));
  expect(await transformOf(page, png.id)).toEqual(target);
  await expectPixel(page, ...spots.red, isRed, 'PNG red half');
  await expectPixel(page, ...spots.blue, isBlue, 'PNG blue half');

  // Hide the PNG layer: only the video shows where the PNG was; unhide brings it back.
  await header(page, pngTrack!).getByTestId('track-btn-hide').click();
  await expect(header(page, pngTrack!).getByTestId('track-btn-hide')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => near(await pixelAt(page, ...spots.red), videoAt.red, 12)).toBe(true);
  await expect.poll(async () => near(await pixelAt(page, ...spots.blue), videoAt.blue, 12)).toBe(true);
  await header(page, pngTrack!).getByTestId('track-btn-hide').click();
  await expect(header(page, pngTrack!).getByTestId('track-btn-hide')).toHaveAttribute('aria-pressed', 'false');
  await expectPixel(page, ...spots.red, isRed, 'PNG red half after unhide');
  await expectPixel(page, ...spots.blue, isBlue, 'PNG blue half after unhide');

  // Mute and unmute the video layer (its embedded audio).
  const mute = header(page, videoTrack).getByTestId('track-btn-mute');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(header(page, videoTrack)).toHaveClass(/is-muted/);
  expect((await project(page)).tracks.find((t) => t.id === videoTrack)!.muted).toBe(true);
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  expect((await project(page)).tracks.find((t) => t.id === videoTrack)!.muted).toBe(false);

  // Vertical keeps the PNG's relative placement (Rulings G/J): x, y scale per axis, scale by √(area ratio).
  await page.getByTestId('format-select').selectOption('vertical');
  await expect(page.getByTestId('format-select')).toHaveValue('vertical');
  const vf = { width: 1080, height: 1920 };
  const vt = await transformOf(page, png.id);
  const rx = 1080 / 1920;
  const ry = 1920 / 1080;
  expect(vt.x).toBeCloseTo(target.x * rx, 6);
  expect(vt.y).toBeCloseTo(target.y * ry, 6);
  expect(vt.scale).toBeCloseTo(target.scale * Math.sqrt(rx * ry), 6);
  const vs = halves(vf, vt);
  expect(vs.red[0]).toBeGreaterThan(vf.width / 2);
  expect(vs.red[1]).toBeLessThan(vf.height / 2);
  await expectPixel(page, ...vs.red, isRed, 'PNG red half (vertical)');
  await expectPixel(page, ...vs.blue, isBlue, 'PNG blue half (vertical)');

  // Back to YouTube: the round trip restores the ORIGINAL transform exactly (Ruling J).
  await page.getByTestId('format-select').selectOption('youtube');
  await expect(page.getByTestId('format-select')).toHaveValue('youtube');
  const yt = await transformOf(page, png.id);
  for (const k of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) expect(Math.abs(yt[k] - target[k]), k).toBeLessThanOrEqual(1e-9);
  const ys = halves(fmt, yt);
  await expectPixel(page, ...ys.red, isRed, 'PNG red half (back to YouTube)');
  await expectPixel(page, ...ys.blue, isBlue, 'PNG blue half (back to YouTube)');

  // About one second of both layers keeps the export short.
  await trimTo(page, video.id, 1);
  await trimTo(page, png.id, 1);

  await page.getByTestId('btn-export').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('export-quality').selectOption('1080p');
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 200_000 });
  await expect(page.getByTestId('export-error')).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const file = await download.path();
  const info = ffprobe(file);
  expect(info.format.format_name).toContain('mp4');
  const vstream = info.streams.find((s) => s.codec_type === 'video');
  expect(vstream).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080 });
  expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
  expect(Math.abs(Number(info.format.duration) - 1)).toBeLessThanOrEqual(0.3);
  await page.getByTestId('btn-export-close').click();
  await expect(dialog).toHaveCount(0);

  // First exported frame: the PNG's halves top-right, the video (frame 0 of the source, fitted ×3) elsewhere.
  const out = ffmpegFrame(file, 0);
  const rgbAt = (x: number, y: number): number[] => [...out.rgb.subarray((y * out.width + x) * 3, (y * out.width + x) * 3 + 3)];
  expect(isRed(rgbAt(...ys.red)), `red at ${ys.red}: ${rgbAt(...ys.red)}`).toBe(true);
  expect(isBlue(rgbAt(...ys.blue)), `blue at ${ys.blue}: ${rgbAt(...ys.blue)}`).toBe(true);
  const src = ffmpegFrame(withAudio, 0);
  const srcAt = (x: number, y: number): number[] => {
    const [sx, sy] = [Math.floor(x / 3), Math.floor(y / 3)];
    return [...src.rgb.subarray((sy * src.width + sx) * 3, (sy * src.width + sx) * 3 + 3)];
  };
  const elsewhere: [number, number][] = [[200, 700], [500, 900], [960, 800], [300, 300], [1500, 950]];
  const matching = elsewhere.filter(([x, y]) => near(rgbAt(x, y), srcAt(x, y), 48));
  expect(matching.length, `video pixels ${elsewhere.map(([x, y]) => `${rgbAt(x, y)} vs ${srcAt(x, y)}`).join('; ')}`)
    .toBeGreaterThanOrEqual(4);

  // Undo/redo chain sanity: back through the trims, the format switches and the mute, then forward again.
  const beforeUndo = await project(page);
  const undo = page.getByTestId('btn-undo');
  for (let i = 0; i < 6; i++) await undo.click();
  expect(await project(page)).not.toEqual(beforeUndo);
  const redo = page.getByTestId('btn-redo');
  for (let i = 0; i < 6; i++) await redo.click();
  await expect(redo).toBeDisabled();
  expect(await project(page)).toEqual(beforeUndo);

  // Reload: both layers, names, flags and transforms come back exactly.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  expect(await project(page)).toEqual(beforeUndo);
  await expect(page.getByTestId('track-header')).toHaveCount(3);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
