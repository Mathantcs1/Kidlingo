// Plan 4 acceptance journey: effects, looks, a LUT, chroma key and overlays on a real timeline; reload; export;
// the exported frames match the compositor frames; merge-all bakes everything; undo walks back one step per gesture.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { addToTimeline, clipEl, clipStates, importFiles, open, setPlayhead, trackErrors, withAudio } from './helpers';
import { openHarness, render } from './harness-helpers';
import { pixelAt, undoDepth } from './pip-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(420_000);

const f = (page: Page, id: string): Locator => page.getByTestId(id);
const BOX = 8;
const state = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present);

async function setRange(loc: Locator, value: number): Promise<void> {
  await loc.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function addFx(page: Page, type: string): Promise<void> {
  await f(page, 'fx-add').selectOption(type);
  await f(page, 'fx-add-button').click();
}
const lastRow = (page: Page): Locator => f(page, 'fx-inspector').locator('li[data-type]').last();
async function lastRowId(page: Page): Promise<string> {
  return ((await lastRow(page).getAttribute('data-testid')) ?? '').slice(3);
}

function fixtures(): { split: string; cube: string } {
  const dir = test.info().outputPath('journey');
  mkdirSync(dir, { recursive: true });
  const split = join(dir, 'split.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x00ff00:s=64x64', '-f', 'lavfi', '-i', 'color=c=0xdc1e1e:s=64x64', '-filter_complex', 'hstack', '-frames:v', '1', split], { stdio: 'pipe' });
  const rows: string[] = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rows.push(`${Math.min(1, r * 1.1)} ${g} ${b * 0.9}`);
  const cube = join(dir, 'warm.cube');
  writeFileSync(cube, `TITLE "Warm"\nLUT_3D_SIZE 2\n${rows.join('\n')}\n`);
  return { split, cube };
}

function boxed(rgb: Buffer, width: number, height: number): { width: number; height: number; data: number[] } {
  const w = Math.floor(width / BOX);
  const h = Math.floor(height / BOX);
  const data: number[] = new Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let dy = 0; dy < BOX; dy++) for (let dx = 0; dx < BOX; dx++) s += rgb[((y * BOX + dy) * width + x * BOX + dx) * 3 + k];
        data[(y * w + x) * 3 + k] = s / (BOX * BOX);
      }
    }
  }
  return { width: w, height: h, data };
}

test('effects, looks, LUT, chroma key and overlays: edit, reload, export, merge, undo', async ({ page }) => {
  const errors = trackErrors(page);
  const { split, cube } = fixtures();
  await open(page);
  await importFiles(page, [withAudio, split], 2);

  // The video: colour, a Cinematic look at 80 %, a little grain, and a warm LUT.
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [video] = await clipStates(page);
  await clipEl(page, video.id).click();
  await addFx(page, 'color');
  await setRange(f(page, `fx-${await lastRowId(page)}-brightness`), 0.1);
  await f(page, 'look-cinematic').click();
  await setRange(f(page, 'look-intensity'), 0.8);
  await addFx(page, 'grain');
  await setRange(f(page, `fx-${await lastRowId(page)}-amount`), 0.15);
  await addFx(page, 'lut');
  await f(page, 'lut-import').setInputFiles(cube);
  await expect(f(page, 'lut-select')).not.toHaveValue('');

  // A green-screen layer above it, keyed.
  await f(page, 'btn-add-video-layer').click();
  await addToTimeline(page, 'split.png', 2);
  const png = (await clipStates(page)).find((c) => c.id !== video.id)!;
  await clipEl(page, png.id).click();
  await addFx(page, 'chroma');

  // Overlays: a lower third with a title, and a progress bar.
  await f(page, 'overlay-add-lowerThird').click();
  await f(page, 'overlay-text').fill('Journey');
  await f(page, 'overlay-text').press('Enter');
  await f(page, 'overlay-add-progress').click();

  // Hiding the keyed layer and showing it again are two undo steps and leave the project as it was.
  const keyed = await state(page);
  const pngTrack = keyed.tracks.find((t) => t.clips.some((c) => c.id === png.id))!;
  const header = page.locator(`[data-testid="track-header"][data-track-id="${pngTrack.id}"]`);
  await header.getByTestId('track-btn-hide').click();
  expect((await state(page)).tracks.find((t) => t.id === pngTrack.id)!.hidden).toBe(true);
  await header.getByTestId('track-btn-hide').click();
  expect(await state(page)).toEqual(keyed);

  // Keep the export short: every clip 0.6 s long (one more undo step).
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, out: c.in + 0.6 })) })) })));
  expect((await state(page)).tracks.flatMap((t) => t.clips).filter((c) => c.fx.length > 0)).toHaveLength(2);

  // Undo walks back one step per gesture (every step changes the project, down to no clips), redo walks forward again.
  const before = await state(page);
  let steps = 0;
  let prev = JSON.stringify(before);
  while ((await undoDepth(page)) > 0 && steps < 80) {
    await f(page, 'btn-undo').click();
    const next = JSON.stringify(await state(page));
    expect(next, `undo step ${steps + 1} changed the project`).not.toBe(prev);
    prev = next;
    steps++;
  }
  expect(steps).toBeGreaterThanOrEqual(15);
  expect((await state(page)).tracks.flatMap((t) => t.clips)).toHaveLength(0);
  for (let i = 0; i < steps; i++) await f(page, 'btn-redo').click();
  expect(await state(page)).toEqual(before);

  // Reload: everything comes back exactly.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  expect(await state(page)).toEqual(before);

  // Export (with "Effects off" ON in the preview: the export must still contain the effects).
  await page.keyboard.press('\\');
  await expect(f(page, 'fx-bypass-tag')).toBeVisible();
  await f(page, 'btn-export').click();
  await f(page, 'btn-export-start').click();
  const link = f(page, 'export-download');
  await expect(link).toBeVisible({ timeout: 240_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const mp4 = await download.path();
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mp4]).toString()) as { format: { duration: string }; streams: { codec_type: string; codec_name: string }[] };
  expect(probe.streams.find((s) => s.codec_type === 'video')?.codec_name).toBe('h264');
  expect(probe.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
  const fps = before.format.fps;
  expect(Math.abs(Number(probe.format.duration) - 0.6)).toBeLessThanOrEqual(1 / fps + 0.02);

  // The exported frames match what the compositor draws for the same project (block-averaged so grain averages out).
  const harness = await page.context().newPage();
  await openHarness(harness);
  const indices = [0, 3, 9];
  const frames = await render(harness, before as Project, indices.map((i) => i / fps), { box: BOX });
  for (const [k, idx] of indices.entries()) {
    const exp = ffmpegFrame(mp4, idx);
    const a = boxed(exp.rgb, exp.width, exp.height);
    const b = frames[k];
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < a.width * a.height; i++) for (let c = 0; c < 3; c++, n++) sum += Math.abs(a.data[i * 3 + c] - b.data[i * 4 + c]);
    expect(sum / n, `exported frame ${idx} vs compositor`).toBeLessThanOrEqual(6);
  }
  // ...and clearly differ from the same frame drawn WITHOUT effects: the export has them although "Effects off" was on.
  const [plain] = await render(harness, before as Project, [3 / fps], { box: BOX, bypassFx: true });
  const exp3 = ffmpegFrame(mp4, 3);
  const e3 = boxed(exp3.rgb, exp3.width, exp3.height);
  let diff = 0;
  let count = 0;
  for (let i = 0; i < e3.width * e3.height; i++) for (let c = 0; c < 3; c++, count++) diff += Math.abs(e3.data[i * 3 + c] - plain.data[i * 4 + c]);
  expect(diff / count, 'export vs a no-effects render').toBeGreaterThan(10);
  await harness.close();
  await page.keyboard.press('Escape');
  await page.keyboard.press('\\');

  // Merge all bakes the stack: one clip, no effects, the same picture (within a re-encode).
  await setPlayhead(page, 0.3);
  const spots: [number, number][] = [[240, 200], [960, 540], [1600, 900], [300, 900], [1500, 200], [960, 1000]];
  const picture = async (): Promise<number[][]> => Promise.all(spots.map(([x, y]) => pixelAt(page, x, y)));
  await expect.poll(async () => (await picture())[1].some((v) => v > 0)).toBe(true);
  const pre = await picture();
  await f(page, 'btn-merge-all').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 240_000 });
  const merged = (await state(page)).tracks.flatMap((t) => t.clips);
  expect(merged[0].fx).toEqual([]);
  await expect
    .poll(async () => {
      const post = await picture();
      return Math.max(...post.flatMap((p, i) => p.map((v, k) => Math.abs(v - pre[i][k]))));
    }, { timeout: 30_000 })
    .toBeLessThanOrEqual(40);

  // Merge-all is ONE undo step: it brings back all four clips with their effects.
  expect(await undoDepth(page)).toBe(1);
  await f(page, 'btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  expect((await state(page)).tracks.flatMap((t) => t.clips).filter((c) => c.fx.length > 0)).toHaveLength(2);
  expect(errors).toEqual([]);
});
