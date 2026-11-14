// Plan 5B Task 10: a 10 s 1080p project with 8 clips, each carrying 4 presets + a curved spring-eased path with orient +
// key loops (see preset-harness-helpers) exports completely (300 frames, the preview's pixels) and is deterministic:
// the 1080p render is exact run to run, the file matches the preview within 3/255 on ten frames, and the export path
// is frame-for-frame equal at a 320 px long side (Ruling T11-2: software H.264 is not bit-reproducible at 1080p).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { openHarness } from './harness-helpers';
import { LEN, eightPresetClips } from './preset-harness-helpers';
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

const frameHashes = (file: string): string[] =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-']).toString()
    .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1)!.trim());

function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

test('10 s, 8 clips x (4 presets + curved path + loops): the 1080p export completes; render and export are deterministic and match the preview', async ({ page }) => {
  await openHarness(page);
  const p = await eightPresetClips(page);
  const presets = p.tracks.flatMap((t) => t.clips).filter((c) => c.motion);
  expect(presets).toHaveLength(8);
  for (const c of presets) {
    expect(Object.keys(c.motion!).sort()).toEqual(['emphasis', 'in', 'loop', 'out']);
    expect(c.keys!.position!.every((q) => q.in && q.out)).toBe(true);
    expect(c.keys!.loops).toBeDefined();
  }

  const full = await exportFile(page, p, 'presets-robust-1080.mp4');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,nb_frames:format=duration', '-of', 'json', full.file]).toString()) as {
    streams: { width: number; height: number; nb_frames: string }[]; format: { duration: string };
  };
  expect([probe.streams[0].width, probe.streams[0].height]).toEqual([1920, 1080]);
  expect(Number(probe.streams[0].nb_frames)).toBe(LEN * 30);
  expect(Math.abs(Number(probe.format.duration) - LEN)).toBeLessThanOrEqual(1 / 30 + 1e-3);

  // Ten frames: inside entrances, the emphasis windows (3..6.2 s), the loop region (after 5 s) and the exits (last 0.6 s).
  const frames = [1, 9, 40, 75, 110, 150, 190, 230, 280, 297];
  const render = async () => (await page.evaluate(({ p, t }) => window.cf.renderRgb(p, t), { p, t: frames.map((f) => f / 30) })).frames;
  const [r1, r2] = [await render(), await render()];
  expect(r2).toEqual(r1); // the 1080p render is exact run to run (fresh compositors)
  const parity = frames.map((f, i) => meanAbsDiff(new Uint8Array(Buffer.from(r1[i], 'base64')), new Uint8Array(ffmpegFrame(full.file, f).rgb)));
  for (const d of parity) expect(d).toBeLessThan(3);

  const a = await exportFile(page, p, 'presets-robust-a.mp4', 320);
  const b = await exportFile(page, p, 'presets-robust-b.mp4', 320);
  const [ha, hb] = [frameHashes(a.file), frameHashes(b.file)];
  const note = `8 clips x 4 presets + curved path + loops, 10 s: 1080p export ${(full.ms / 1000).toFixed(1)} s (${(full.ms / 300).toFixed(0)} ms/frame); ` +
    `preview vs export ${parity.map((d) => d.toFixed(2)).join('/')}/255; 320 px exports ${(a.ms / 1000).toFixed(1)} s and ${(b.ms / 1000).toFixed(1)} s, ` +
    `${ha.length} frames, ${new Set(ha).size} distinct`;
  console.log(note);
  test.info().annotations.push({ type: 'performance', description: note });
  expect(ha).toHaveLength(LEN * 30);
  expect(hb).toEqual(ha);
  expect(new Set(ha).size).toBeGreaterThan(290);
});
