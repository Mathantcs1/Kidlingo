// Plan 4 effects journey through the real UI: a video, the Teal & Orange look, a colour tweak, a LUT, chroma key on a
// green-screen image layer, a lower third, the undo chain (one step per gesture), reload (project JSON exact) and a
// 1080p export whose duration and frame match the preview. Only reads use the dev hook.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';
import { depth, f } from './effects-ui-helpers';
import { exportFile, fileBlocks, greenScreenPng, maxDiff, settledBlocks, warmCube } from './effects-journey-helpers';
import { previewPixel } from './overlay-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(420_000);

const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
const T = 1.5; // preview/export comparison time: inside every clip, after the lower third's 0.4 s slide-in

test('effects journey: look, colour, LUT, chroma key, lower third, undo chain, reload, 1080p export', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, greenScreenPng()], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [video] = await clipStates(page);
  // The green-screen image goes on its own layer above the video.
  await page.getByTestId('btn-add-video-layer').click();
  await addToTimeline(page, 'screen.png', 2);
  const screen = (await clipStates(page)).find((c) => c.id !== video.id)!;
  // The LUT file is imported first (importing media is not part of the edit chain being counted).
  await page.getByTestId('file-input').setInputFiles({ name: 'warm.cube', mimeType: 'text/plain', buffer: warmCube() });
  await expect.poll(async () => Object.values((await present(page)).media).filter((m) => m.kind === 'lut').length).toBe(1);
  const lutId = Object.values((await present(page)).media).find((m) => m.kind === 'lut')!.id;

  const plain = await settledBlocks(page, T);
  // Unkeyed, the image covers the video in green.
  const g = await previewPixel(page, 0.1, 0.1);
  expect(g[1]).toBeGreaterThan(200);
  expect(g[0] + g[2]).toBeLessThan(60);

  const startJson = JSON.stringify(await present(page));
  const startDepth = await depth(page);
  let steps = 0;
  const gesture = async (name: string, run: () => Promise<void>): Promise<void> => {
    const before = await depth(page);
    await run();
    expect(await depth(page), name).toBe(before + 1);
    steps++;
  };
  const clipOf = async (id: string) => (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;

  // 1-3. Teal & Orange, a colour tweak, the LUT: on the video clip.
  await clipEl(page, video.id).click();
  await gesture('look', () => f(page, 'fx-look-tealOrange').click());
  const colour = (await clipOf(video.id)).effects.find((e) => e.type === 'colour')!;
  await gesture('colour', async () => {
    await f(page, `fx-${colour.id}-saturation`).fill('0.3');
    await f(page, `fx-${colour.id}-saturation`).press('Enter');
  });
  await gesture('lut', () => f(page, `fx-lut-select-${lutId}`).click());
  expect((await clipOf(video.id)).effects.map((e) => e.type)).toEqual(['colour', 'splitTone', 'lut']);
  expect((await clipOf(video.id)).effects.find((e) => e.id === colour.id)!.params.saturation).toBeCloseTo(0.3, 5);

  // 4. Chroma key on the green-screen image layer (an image layer: effects are refused on overlay clips).
  await clipEl(page, screen.id).click();
  await gesture('chroma key', async () => {
    await f(page, 'fx-add').selectOption('chromaKey');
    await f(page, 'fx-add-button').click();
  });
  await expect.poll(async () => (await clipOf(screen.id)).effects.map((e) => e.type)).toEqual(['chromaKey']);
  // 5. A lower third at the playhead, on a new layer.
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0));
  await gesture('lower third', async () => {
    await f(page, 'overlay-add').click();
    await f(page, 'overlay-add-lowerThird').click();
  });
  await expect.poll(async () => (await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'overlay').length).toBe(1);
  expect(steps).toBe(5);

  // The picture changed, the green is keyed out (red box stays), and the video shows through the keyed area.
  const done = await present(page);
  const doneJson = JSON.stringify(done);
  const styled = await settledBlocks(page, T);
  expect(maxDiff(plain, styled), 'the stack changes the picture').toBeGreaterThan(25);
  const corner = await previewPixel(page, 0.1, 0.1);
  expect(corner[1] < 200 || corner[0] + corner[2] >= 60, `keyed corner ${corner}`).toBe(true);
  const box = await previewPixel(page, 0.5, 0.45);
  expect(box[0]).toBeGreaterThan(150);
  expect(box[1] + box[2]).toBeLessThan(80);

  // Undo chain: one step per gesture back to the start, then forward again.
  for (let i = 0; i < steps; i++) await page.getByTestId('btn-undo').click();
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
  const preview = await settledBlocks(page, T);
  expect(maxDiff(styled, preview), 'the reloaded preview equals the one before').toBeLessThan(3);

  // Export at 1080p: the duration is within one frame of the timeline and the frame matches the preview.
  const file = await exportFile(page);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString()) as {
    format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[];
  };
  expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080 });
  const end = Math.max(...done.tracks.flatMap((t) => t.clips).map((c) => c.start + (c.out - c.in)));
  expect(Math.abs(Number(probe.format.duration) - end)).toBeLessThanOrEqual(1 / done.format.fps + 1e-3);
  const exported = fileBlocks(file, Math.round(T * done.format.fps));
  const drift = maxDiff(preview, exported);
  console.log(`journey: preview vs export max block drift ${drift.toFixed(1)}/255, stack vs plain ${maxDiff(plain, styled).toFixed(1)}`);
  expect(drift, 'export frame matches the preview').toBeLessThan(14);
  // Top row of the grid: the keyed-out area where the video shows through; the look, colour and LUT must change it.
  const topShift = maxDiff(fileBlocks(withAudio, Math.round(T * done.format.fps)).slice(0, 8), exported.slice(0, 8));
  console.log(`journey: top-row shift of the export against the unstyled source ${topShift.toFixed(1)}`);
  expect(topShift, 'the export carries the video effects').toBeGreaterThan(30);
  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});
