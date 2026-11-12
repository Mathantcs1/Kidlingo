// Overlay clips in the app (Plan 4 Task 12; the overlay menu and inspector are Task 13): the inspector offers no fit,
// blend mode or effects for them, the preview draws them, media GC leaves real media alone, a project with overlays
// survives reload (saved at the current data version; a v4 save opens and is re-saved at it), and Merge all keeps them in the picture.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { addToTimeline, clipEl, importFiles, open, trackErrors } from './helpers';
import { solidPng } from './lut-helpers';
import { hex, near, previewPixel, savedProject, writeSaved } from './overlay-helpers';
import { newTrack } from '../../src/core/model';
import type { Clip, Project, Track } from '../../src/core/model';
import { newOverlayClip, overlayBaseSize, overlayDefaultTransform } from '../../src/core/overlays';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(240_000);

const HD = { width: 1920, height: 1080 };
const sub: Clip = { ...newOverlayClip('subscribe', 0, 1, HD), id: 'ov-sub' };
const sticker: Clip = { ...newOverlayClip('sticker', 0, 1, HD), id: 'ov-sticker' };

/** A red full-frame image clip (0..1 s) under the subscribe button and a sticker, each on its own layer. */
async function setup(page: Page): Promise<string> {
  await open(page);
  await importFiles(page, [solidPng('red.png', '0xC81E1E')], 1);
  await addToTimeline(page, 'red.png', 1);
  const overlayTrack = (id: string, c: Clip): Track => ({ ...newTrack('video'), id, clips: [c] });
  const tracks = [overlayTrack('t-sub', sub), overlayTrack('t-sticker', sticker)];
  await page.evaluate((tracks) => {
    window.__clipforge!.getState().apply((p) => {
      const [v, ...rest] = p.tracks;
      return { ...p, tracks: [{ ...v, clips: v.clips.map((c) => ({ ...c, out: 1 })) }, ...tracks, ...rest] };
    });
  }, tracks);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  return page.evaluate(() => window.__clipforge!.getState().history.present.tracks[0].clips[0].id);
}

const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);

test('the inspector offers no fit, blend mode or effects for an overlay; the preview draws it; GC keeps real media', async ({ page }) => {
  const errors = trackErrors(page);
  const imageId = await setup(page);
  await clipEl(page, 'ov-sticker').click();
  await expect(page.locator('.inspector-clip')).toHaveText('Sticker: Heart');
  await expect(page.getByTestId('inspector-transform')).toBeVisible();
  for (const id of ['inspector-fit', 'blend-mode-select', 'fx-panel', 'fx-add', 'inspector-volume']) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(clipEl(page, 'ov-sticker')).toContainText('Sticker: Heart');
  await clipEl(page, imageId).click();
  for (const id of ['inspector-fit', 'blend-mode-select', 'fx-panel']) await expect(page.getByTestId(id)).toBeVisible();

  // The preview at 0.5 s: the sticker's fill at the centre, the subscribe button bottom-right, red elsewhere.
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0.5));
  const sb = overlayDefaultTransform('subscribe', HD);
  const sbSize = overlayBaseSize('subscribe', HD);
  const subRight = { x: (HD.width / 2 + sb.x + sbSize.width / 2 - 20) / HD.width, y: (HD.height / 2 + sb.y - sbSize.height / 2 + 15) / HD.height };
  await expect.poll(() => previewPixel(page, 0.5, 0.5).then((p) => near(p, hex(sticker.overlay!.colour), 6)), { timeout: 15_000 }).toBe(true);
  expect(near(await previewPixel(page, subRight.x, subRight.y), hex(sub.overlay!.colour), 6)).toBe(true);
  expect(near(await previewPixel(page, 0.1, 0.1), [200, 30, 30], 6)).toBe(true);

  const stored = await page.evaluate(() => window.__clipforge!.listMediaIds());
  expect(await page.evaluate(() => window.__clipforge!.gcMedia())).toEqual([]);
  expect(await page.evaluate(() => window.__clipforge!.listMediaIds())).toEqual(stored);
  expect(errors).toEqual([]);
});

test('a project with overlays reloads exactly and is saved at the current version; a v4 save opens and is re-saved at the current version', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const before = await present(page);
  const saved = await savedProject(page);
  expect(saved?.version).toBe(CURRENT_VERSION);
  expect(saved?.tracks).toEqual(before.tracks);
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  expect((await present(page)).tracks).toEqual(before.tracks);

  // A v4 save (Part A, no overlays) opens with no notice and is saved back at the current version after an edit.
  const v4 = { ...saved!, version: 4, tracks: saved!.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.kind !== 'overlay') })) };
  await writeSaved(page, v4);
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  expect((await present(page)).tracks).toEqual(v4.tracks);
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  expect((await savedProject(page))?.version).toBe(CURRENT_VERSION);
  expect(errors).toEqual([]);
});

/** Copies a stored media file out of the browser's private storage into the test output folder. */
async function mediaFile(page: Page, id: string, name: string): Promise<string> {
  const b64 = await page.evaluate(async (id) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipforge-media');
    const bytes = new Uint8Array(await (await (await dir.getFileHandle(id)).getFile()).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, id);
  const dir = test.info().outputPath('merged');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), Buffer.from(b64, 'base64'));
  return join(dir, name);
}

test('Merge all keeps the overlays in the merged picture', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await page.getByTestId('btn-merge-all').click();
  await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 200_000 });
  const clips = (await present(page)).tracks.flatMap((t) => t.clips);
  expect(clips.map((c) => c.kind)).toEqual(['video']);
  const f = ffmpegFrame(await mediaFile(page, clips[0].mediaId, 'merged.mp4'), 15);
  expect([f.width, f.height]).toEqual([1920, 1080]);
  const rgb = (x: number, y: number): [number, number, number] => {
    const i = (Math.round(y) * f.width + Math.round(x)) * 3;
    return [f.rgb[i], f.rgb[i + 1], f.rgb[i + 2]];
  };
  const sb = overlayDefaultTransform('subscribe', HD);
  const sbSize = overlayBaseSize('subscribe', HD);
  expect(near(rgb(HD.width / 2, HD.height / 2), hex(sticker.overlay!.colour), 12), 'sticker').toBe(true);
  expect(near(rgb(HD.width / 2 + sb.x + sbSize.width / 2 - 20, HD.height / 2 + sb.y - sbSize.height / 2 + 15), hex(sub.overlay!.colour), 12), 'subscribe').toBe(true);
  expect(near(rgb(100, 100), [200, 30, 30], 12), 'background').toBe(true);
  expect(errors).toEqual([]);
});
