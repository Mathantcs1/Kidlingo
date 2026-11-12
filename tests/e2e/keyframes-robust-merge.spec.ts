// Plan 5 Task 11: Merge all bakes the animation of every layer (keyed image, keyed sticker overlay, keyed adjustment
// layer with a keyed invert) into the merged clip: its frames (ffmpeg) equal the animated preview compositor's frames
// N at 1080p, frame N and not its neighbour; one Undo brings every clip and every key back exactly.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { trackErrors } from './helpers';
import { openHarness } from './harness-helpers';
import { FPS, animatedStack, depth, load, openWithImages, present, presentJson } from './robust-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(300_000);

/** Copies a stored media file out of the browser's private storage. */
async function mediaFile(page: Page, id: string): Promise<string> {
  const b64 = await page.evaluate(async (id) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('clipforge-media');
    const bytes = new Uint8Array(await (await (await dir.getFileHandle(id)).getFile()).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, id);
  const dir = test.info().outputPath('merged');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${id}.mp4`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  return out;
}

/** The preview compositor's frames of `p` at 1080p (a harness page in the same origin: it reads the same media). */
async function previewRgb(page: Page, p: Project, times: number[]): Promise<Uint8Array[]> {
  const h = await page.context().newPage();
  try {
    await openHarness(h);
    const r = await h.evaluate(({ p, times }) => window.cf.renderRgb(p, times), { p, times });
    return r.frames.map((f) => new Uint8Array(Buffer.from(f, 'base64')));
  } finally {
    await h.close();
  }
}

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** Pixels (RGB triplets) where any of `others` differs from `base` by more than 24 in a channel. */
function moving(base: Uint8Array, others: Uint8Array[]): { px: Uint8Array; count: number } {
  const px = new Uint8Array(base.length / 3);
  let count = 0;
  for (let i = 0; i < px.length; i++) {
    for (const o of others) {
      if (Math.abs(o[3 * i] - base[3 * i]) > 24 || Math.abs(o[3 * i + 1] - base[3 * i + 1]) > 24 || Math.abs(o[3 * i + 2] - base[3 * i + 2]) > 24) px[i] = 1;
    }
    count += px[i];
  }
  return { px, count };
}

function maskedDiff(a: Uint8Array, b: Uint8Array, mask: { px: Uint8Array; count: number }): number {
  let s = 0;
  for (let i = 0; i < mask.px.length; i++) {
    if (mask.px[i]) s += Math.abs(a[3 * i] - b[3 * i]) + Math.abs(a[3 * i + 1] - b[3 * i + 1]) + Math.abs(a[3 * i + 2] - b[3 * i + 2]);
  }
  return s / (3 * mask.count);
}

test('merge all of an animated stack equals the animated preview frame for frame; Undo restores every key', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, animatedStack(await openWithImages(page), { start: 0, len: 1, bgLen: 1 }));
  const p = await present(page);
  const json = await presentJson(page);
  const d = await depth(page);

  await page.getByTestId('btn-merge-all').click();
  await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 240_000 });
  const merged = await present(page);
  const clips = merged.tracks.flatMap((t) => t.clips);
  expect(clips).toHaveLength(1);
  expect(clips[0].keys).toBeUndefined(); // baked into the pixels
  expect(await depth(page)).toBe(d + 1);
  const file = await mediaFile(page, clips[0].mediaId);

  // Each checked frame N is compared with the preview at N - 1, N and N + 1. Whole frame: mean error < 3/255 (H.264).
  // Timing: on the pixels the animation changes between those previews, the merged frame is clearly closest to N.
  const checked = [1, 8, 15, 22, 28];
  const previews = await previewRgb(page, p, checked.flatMap((f) => [f - 1, f, f + 1]).map((f) => f / FPS));
  for (const [i, frame] of checked.entries()) {
    const [prev, same, next] = previews.slice(3 * i, 3 * i + 3);
    const got = ffmpegFrame(file, frame);
    expect([got.width, got.height]).toEqual([1920, 1080]);
    const rgb = new Uint8Array(got.rgb);
    const whole = meanAbsDiff(same, rgb);
    const mask = moving(same, [prev, next]);
    const [eSame, ePrev, eNext] = [same, prev, next].map((q) => maskedDiff(q, rgb, mask));
    console.log(`merge all frame ${frame}: ${whole.toFixed(3)}/255 whole frame; on ${mask.count} moving px: N ${eSame.toFixed(2)}, N-1 ${ePrev.toFixed(2)}, N+1 ${eNext.toFixed(2)}`);
    expect(whole, `merged frame ${frame} vs the animated preview`).toBeLessThan(3);
    expect(mask.count, 'the animation moves pixels between neighbouring frames').toBeGreaterThan(2000);
    expect(eSame, `frame ${frame} is the preview's frame N, not N - 1`).toBeLessThan(0.6 * ePrev);
    expect(eSame, `frame ${frame} is the preview's frame N, not N + 1`).toBeLessThan(0.6 * eNext);
  }

  await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(json);
  expect(errors).toEqual([]);
});
