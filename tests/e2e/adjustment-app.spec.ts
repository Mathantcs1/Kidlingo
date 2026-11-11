// Adjustment layers in the app and the exporter (Plan 4 Task 13a): the menu adds one in ONE undo step with its own
// clip look and inspector (effects, blend mode and opacity; no fit, position or sound); its effect shows in the
// preview, the export matches the preview, Merge all keeps the effect, and a failed effect reaches the export notice.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { addToTimeline, clipEl, importFiles, open, trackErrors } from './helpers';
import { clipOf, openHarness } from './harness-helpers';
import { solidPng } from './lut-helpers';
import { previewPixel } from './overlay-helpers';
import { defaultClipAudio, defaultTransform, newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import { defaultParams } from '../../src/core/videoEffects';
import { exportSkipNotice } from '../../src/render/effects/unavailable';

test.setTimeout(240_000);

let n = 0;
const fx = (type: VideoEffectType, params: Record<string, number> = {}): VideoEffect =>
  ({ id: `aafx-${++n}`, type, enabled: true, params: { ...defaultParams(type), ...params } });
const f = (page: Page, id: string) => page.getByTestId(id);
const clips = (page: Page): Promise<Clip[]> =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips));
const undoDepth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const grey = (c: number[], tol: number): boolean => Math.max(...c) - Math.min(...c) <= tol;

/** A red full-frame image clip 0..1 s, playhead at 0.5 s. */
async function setup(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [solidPng('red.png', '0xC81E1E')], 1);
  await addToTimeline(page, 'red.png', 1);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, out: c.in + 1 })) })) }));
    s.setPlayhead(0.5);
  });
}

test('Add overlay > Adjustment layer: one step, its own look and inspector, a B&W effect greys the preview', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await expect.poll(() => previewPixel(page, 0.5, 0.5).then((c) => c[0] > 150 && !grey(c, 50)), { timeout: 15_000 }).toBe(true);
  const depth = await undoDepth(page);
  await f(page, 'overlay-add').click();
  await f(page, 'overlay-add-adjustment').click();
  await expect.poll(async () => (await clips(page)).filter((c) => c.kind === 'adjustment').length).toBe(1);
  expect(await undoDepth(page)).toBe(depth + 1);
  const adj = (await clips(page)).find((c) => c.kind === 'adjustment')!;
  expect(adj).toMatchObject({ mediaId: '', start: 0.5, effects: [] });
  await expect(clipEl(page, adj.id)).toHaveClass(/clip-adjustment/);
  await expect(clipEl(page, adj.id)).toContainText('Adjustment layer');
  await expect(clipEl(page, adj.id)).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.inspector-clip')).toHaveText('Adjustment layer');
  for (const id of ['blend-mode-select', 'fx-panel', 'inspector-opacity']) await expect(f(page, id)).toBeVisible();
  for (const id of ['inspector-fit', 'inspector-volume', 'inspector-x', 'inspector-scale', 'inspector-transform-reset', 'overlay-text']) {
    await expect(f(page, id)).toHaveCount(0);
  }
  await f(page, 'fx-add').selectOption('bw');
  await f(page, 'fx-add-button').click();
  await expect.poll(() => previewPixel(page, 0.5, 0.5).then((c) => grey(c, 3)), { timeout: 15_000 }).toBe(true);
  expect(await undoDepth(page)).toBe(depth + 2);
  // Before the adjustment starts the picture is still red.
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0.2));
  await expect.poll(() => previewPixel(page, 0.5, 0.5).then((c) => !grey(c, 50)), { timeout: 15_000 }).toBe(true);
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

const adjustment = (effects: VideoEffect[], over: Partial<Clip> = {}): Clip => ({
  id: 'adj', mediaId: '', kind: 'adjustment', start: 0, in: 0, out: 1, transform: defaultTransform(), volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects, blend: 'normal', ...over,
});

test('Merge all keeps the adjustment layer\'s effect in the merged picture', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const adj = adjustment([fx('bw')]);
  await page.evaluate((adj) => window.__clipforge!.getState().apply((p) => {
    const [v, ...rest] = p.tracks;
    return { ...p, tracks: [v, { ...v, id: 'adj-track', name: '', clips: [adj] }, ...rest] };
  }), adj);
  await f(page, 'btn-merge-all').click();
  await expect(f(page, 'export-dialog')).toHaveCount(0, { timeout: 200_000 });
  const merged = await clips(page);
  expect(merged.map((c) => c.kind)).toEqual(['video']);
  const frame = ffmpegFrame(await mediaFile(page, merged[0].mediaId, 'merged.mp4'), 15);
  const i = (Math.round(frame.height / 2) * frame.width + Math.round(frame.width / 2)) * 3;
  const c = [frame.rgb[i], frame.rgb[i + 1], frame.rgb[i + 2]];
  expect(grey(c, 6), `merged centre ${c}`).toBe(true);
  expect(c[0]).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

/** Quadrant backdrop, a smaller layer, an adjustment (colour + vignette + mirror, Screen at 0.7), a layer above. */
function exportProject(back: MediaRef, mid: MediaRef, top: MediaRef, effects: VideoEffect[] | null): Project {
  const track = (id: string, c: Clip[]) => ({ ...newTrack('video'), id, clips: c });
  return {
    version: 5,
    format: { width: 320, height: 180, fps: 25 },
    tracks: [
      track('back', [clipOf(back, { out: 0.4 })]),
      track('mid', [clipOf(mid, { out: 0.4, transform: { x: 30, y: 10, rotation: 15 } })]),
      track('adj', effects ? [adjustment(effects, { out: 0.4, blend: 'screen', transform: { ...defaultTransform(), opacity: 0.7 } })] : []),
      track('top', [clipOf(top, { out: 0.4, transform: { x: -100, y: -50 } })]),
      { ...newTrack('audio'), id: 'audio' },
    ],
    media: { [back.id]: back, [mid.id]: mid, [top.id]: top },
  };
}

const meanAbs = (a: Uint8Array, b: Uint8Array): number => {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

async function preview(page: Page, p: Project, t: number): Promise<Uint8Array> {
  const r = await page.evaluate(({ p, t }) => window.cf.renderRgb(p, [t]), { p, t });
  return new Uint8Array(Buffer.from(r.frames[0], 'base64'));
}

test('an adjustment layer exports like the preview; a failed effect on it reaches the export notice', async ({ page }) => {
  await openHarness(page);
  const [back, mid, top] = await page.evaluate(() => Promise.all([
    window.cf.putImageMedia(320, 180, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] }),
    window.cf.putImageMedia(120, 80, [120, 200, 90], { right: [250, 120, 160] }),
    window.cf.putImageMedia(60, 40, [90, 60, 220]),
  ]));
  const effects = [fx('colour', { contrast: 0.4, saturation: -0.5 }), fx('vignette'), fx('mirror', { mode: 2 })];
  const p = exportProject(back, mid, top, effects);
  const { b64, skips } = await page.evaluate((p) => window.cf.exportWithSkips(p, 320), p);
  expect(skips).toBeNull();
  const file = test.info().outputPath('adjustment.mp4');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  const plain = await preview(page, exportProject(back, mid, top, null), 0);
  for (const frame of [0, 2]) {
    const want = await preview(page, p, frame / 25);
    const got = ffmpegFrame(file, frame);
    expect([got.width, got.height]).toEqual([320, 180]);
    const diff = meanAbs(want, new Uint8Array(got.rgb));
    console.log(`adjustment export frame ${frame}: ${diff.toFixed(3)}/255 per pixel vs preview`);
    expect(diff).toBeLessThan(3);
    expect(meanAbs(want, plain)).toBeGreaterThan(15);
  }

  await page.evaluate(() => window.cf.registerTestEffect('glow', 'broken'));
  const broken = await page.evaluate((p) => window.cf.exportWithSkips(p, 320), exportProject(back, mid, top, [fx('glow'), fx('bw')]));
  expect(broken.skips).toEqual({ effects: ['glow'], luts: [] });
  expect(exportSkipNotice(broken.skips!)).toBe('Exported without these effects (this device cannot run them): Glow.');
});
