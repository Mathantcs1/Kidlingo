// Plan 5B Task 10: Merge all bakes presets, loops and curved paths into the merged clip: its frames (ffmpeg) equal the
// preview compositor's frames N at 1080p, frame N and not its neighbour, inside the entrance, the middle and the exit
// of a 1 s stack; one Undo brings every clip, preset and key back exactly (project JSON).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { trackErrors } from './helpers';
import { openHarness } from './harness-helpers';
import { presetStack } from './preset-robust-helpers';
import { FPS, depth, load, openWithImages, present, presentJson } from './robust-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(300_000);

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

/** Pixels where any of `others` differs from `base` by more than 24 in a channel, and the mean error of `q` on them. */
function moving(base: Uint8Array, others: Uint8Array[]): Uint8Array {
  const px = new Uint8Array(base.length / 3);
  for (let i = 0; i < px.length; i++) {
    for (const o of others) {
      if (Math.abs(o[3 * i] - base[3 * i]) > 24 || Math.abs(o[3 * i + 1] - base[3 * i + 1]) > 24 || Math.abs(o[3 * i + 2] - base[3 * i + 2]) > 24) px[i] = 1;
    }
  }
  return px;
}
function maskedDiff(a: Uint8Array, b: Uint8Array, mask: Uint8Array): { err: number; count: number } {
  let s = 0;
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    count++;
    s += Math.abs(a[3 * i] - b[3 * i]) + Math.abs(a[3 * i + 1] - b[3 * i + 1]) + Math.abs(a[3 * i + 2] - b[3 * i + 2]);
  }
  return { err: s / (3 * Math.max(1, count)), count };
}

test('merge all of a preset stack equals the preview frame for frame (entrance, middle, exit); Undo restores every preset and key', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, presetStack(await openWithImages(page), { start: 0, len: 1, bgLen: 1 }));
  const p = await present(page);
  const json = await presentJson(page);
  const d = await depth(page);
  await page.getByTestId('btn-merge-all').click();
  await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 240_000 });
  const clips = (await present(page)).tracks.flatMap((t) => t.clips);
  expect(clips).toHaveLength(1);
  expect(clips[0].keys).toBeUndefined();
  expect(clips[0].motion).toBeUndefined(); // baked into the pixels
  expect(await depth(page)).toBe(d + 1);
  const file = await mediaFile(page, clips[0].mediaId);
  const checked = [4, 15, 26]; // inside the In window (0..0.4), the middle, inside the Out window (0.6..1.0)
  const previews = await previewRgb(page, p, checked.flatMap((f) => [f - 1, f, f + 1]).map((f) => f / FPS));
  for (const [i, frame] of checked.entries()) {
    const [prev, same, next] = previews.slice(3 * i, 3 * i + 3);
    const got = ffmpegFrame(file, frame);
    expect([got.width, got.height]).toEqual([1920, 1080]);
    const rgb = new Uint8Array(got.rgb);
    const whole = meanAbsDiff(same, rgb);
    const mask = moving(same, [prev, next]);
    const [s, a, b] = [same, prev, next].map((q) => maskedDiff(q, rgb, mask));
    console.log(`merge all (presets) frame ${frame}: ${whole.toFixed(3)}/255 whole; on ${s.count} moving px: N ${s.err.toFixed(2)}, N-1 ${a.err.toFixed(2)}, N+1 ${b.err.toFixed(2)}`);
    expect(whole, `merged frame ${frame} vs the preview`).toBeLessThan(3);
    expect(s.count, 'the animation moves pixels between neighbouring frames').toBeGreaterThan(1500);
    expect(s.err, `frame ${frame} is the preview's frame N, not N - 1`).toBeLessThan(0.6 * a.err);
    expect(s.err, `frame ${frame} is the preview's frame N, not N + 1`).toBeLessThan(0.6 * b.err);
  }
  await page.getByTestId('btn-undo').click();
  expect(await presentJson(page)).toBe(json);
  expect(errors).toEqual([]);
});
