// Plan 5 Task 11: a 10 s project with 8 animated clips (position, scale, rotation and opacity keyed, plus two effects
// with keyed params each) exports at 1080p (300 frames, 10 s, the preview's pixels) and is deterministic frame for
// frame: the render exactly, the export path per frame hash (ffmpeg framemd5, the Plan 4 approach; Ruling T11-2).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { openHarness } from './harness-helpers';
import { LEN, eightClips } from './robust-harness-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(900_000);

async function exportFile(page: Page, p: Project, name: string, maxLongSide?: number): Promise<{ file: string; ms: number }> {
  const t0 = Date.now();
  const { b64, skips } = await page.evaluate(({ p, maxLongSide }) => window.cf.exportWithSkips(p, maxLongSide), { p, maxLongSide });
  const ms = Date.now() - t0;
  expect(skips).toBeNull();
  const file = test.info().outputPath(name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return { file, ms };
}

/** ffmpeg's per-frame MD5 of the decoded video stream. */
const frameHashes = (file: string): string[] =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-']).toString()
    .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1)!.trim());

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * Ruling T11-2: headless Chromium's software H.264 encoder is NOT bit-reproducible at 1080p (measured: two exports
 * of a STATIC 10 s 1080p project differ in 299 of 300 decoded frames, by 0.04-0.19/255 on average; frame 0, the
 * key frame, is identical), so per-frame hash equality is asserted where the encoder is deterministic (the same
 * export path at a 320 px long side: 300/300 frames equal) and the 1080p render itself is checked exactly (fresh
 * compositors, hash equal) and against the exported file (parity within codec error).
 */
test('10 s, 8 clips with every property and two effects keyed: the 1080p export completes; frames are deterministic', async ({ page }) => {
  await openHarness(page);
  const p = await eightClips(page);

  const full = await exportFile(page, p, 'kf-robust-1080.mp4');
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,nb_frames:format=duration', '-of', 'json', full.file]).toString();
  const info = JSON.parse(probe) as { streams: { width: number; height: number; nb_frames: string }[]; format: { duration: string } };
  expect([info.streams[0].width, info.streams[0].height]).toEqual([1920, 1080]);
  expect(Number(info.streams[0].nb_frames)).toBe(LEN * 30);
  expect(Math.abs(Number(info.format.duration) - LEN)).toBeLessThanOrEqual(1 / 30 + 1e-3);

  // The 1080p render is exact run to run (two fresh compositors) and the file carries it (codec error only).
  const frames = [1, 75, 150, 299];
  const render = async () => (await page.evaluate(({ p, t }) => window.cf.renderRgb(p, t), { p, t: frames.map((f) => f / 30) })).frames;
  const [r1, r2] = [await render(), await render()];
  expect(r2).toEqual(r1);
  const parity = frames.map((f, i) => meanAbsDiff(new Uint8Array(Buffer.from(r1[i], 'base64')), new Uint8Array(ffmpegFrame(full.file, f).rgb)));
  for (const d of parity) expect(d).toBeLessThan(3);

  // Per-frame hash determinism of the export path (same compositor and encoder pipeline, deterministic size).
  const a = await exportFile(page, p, 'kf-robust-a.mp4', 320);
  const b = await exportFile(page, p, 'kf-robust-b.mp4', 320);
  const [ha, hb] = [frameHashes(a.file), frameHashes(b.file)];
  const note = `8 animated clips, 10 s: 1080p export ${(full.ms / 1000).toFixed(1)} s (${(full.ms / 300).toFixed(0)} ms/frame); ` +
    `preview vs export ${parity.map((d) => d.toFixed(2)).join('/')}/255; 320 px exports ${(a.ms / 1000).toFixed(1)} s and ` +
    `${(b.ms / 1000).toFixed(1)} s, ${ha.length} frames, ${new Set(ha).size} distinct`;
  console.log(note);
  test.info().annotations.push({ type: 'performance', description: note });
  expect(ha).toHaveLength(LEN * 30);
  expect(hb).toEqual(ha);
  expect(new Set(ha).size).toBeGreaterThan(290); // animated: (nearly) every frame differs
});
