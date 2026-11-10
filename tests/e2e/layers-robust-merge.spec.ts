// Merge all with layers: the merged file is the composite of the visible layers with the audible tracks' audio;
// one undo step restores every clip on every track and the track names/flags.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { importFiles, open, playerState, tone, trackErrors } from './helpers';
import { images } from './pip-helpers';
import type { Track } from '../../src/core/model';

test.setTimeout(300_000);

/**
 * Red full-frame background on v1, a green 200² square on v2 (HIDDEN) at x = −500, a blue 200² square on v3 at
 * x = +500, all 0..1 s; v1 is MUTED (a silent picture, but the flag must not silence the merged clip); audio: a1
 * tone at volume 1 (muted, named 'Music'), a2 tone at volume 0.5 and SOLOED.
 */
async function setup(page: Page): Promise<void> {
  await open(page);
  const [, green] = images();
  const blue = join(test.info().outputPath('img'), 'blue.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=200x200', '-frames:v', '1', blue]);
  const red = join(test.info().outputPath('img'), 'red.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=192x108', '-frames:v', '1', red]);
  await importFiles(page, [red, green, blue, tone], 4);
  await page.evaluate(() => {
    window.__clipforge!.getState().apply((p) => {
      const byName = (n: string) => Object.values(p.media).find((m) => m.name === n)!;
      const clip = (id: string, n: string, scale: number, x: number, volume = 1) => {
        const m = byName(n);
        return { id, mediaId: m.id, kind: m.kind, start: 0, in: 0, out: 1, volume, fit: 'fit' as const, transform: { x, y: 0, scale, rotation: 0, opacity: 1 } };
      };
      const flags = { hidden: false, muted: false, solo: false, locked: false, name: '' };
      return {
        ...p,
        tracks: [
          { ...flags, id: 'v1', kind: 'video' as const, name: 'Background', muted: true, clips: [clip('red', 'red.png', 10, 0)] },
          { ...flags, id: 'v2', kind: 'video' as const, hidden: true, clips: [clip('green', 'green.png', 1, -500)] },
          { ...flags, id: 'v3', kind: 'video' as const, clips: [clip('blue', 'blue.png', 1, 500)] },
          { ...flags, id: 'a1', kind: 'audio' as const, name: 'Music', muted: true, clips: [clip('t1', 'tone.wav', 1, 0, 1)] },
          { ...flags, id: 'a2', kind: 'audio' as const, solo: true, clips: [clip('t2', 'tone.wav', 1, 0, 0.5)] },
        ],
      };
    });
  });
}

const tracksOf = (page: Page): Promise<Track[]> => page.evaluate(() => window.__clipforge!.getState().history.present.tracks);

/** Copies a stored media file out of the browser's private storage into the test output folder. */
async function mediaFile(page: Page, id: string, name: string): Promise<string> {
  const b64 = await page.evaluate(async (id) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('clipforge-media');
    const bytes = new Uint8Array(await (await (await dir.getFileHandle(id)).getFile()).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, id);
  const dir = test.info().outputPath('merged');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, name);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  return out;
}

function duration(file: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

/** Peak absolute 16-bit sample of the file's audio, or null without an audio stream. */
function audioPeak(file: string): number | null {
  const streams = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).toString();
  if (streams.trim() === '') return null;
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'], { maxBuffer: 64 << 20 });
  let peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  return peak;
}

function rgbAt(f: { width: number; rgb: Buffer }, x: number, y: number): number[] {
  const i = (y * f.width + x) * 3;
  return [f.rgb[i], f.rgb[i + 1], f.rgb[i + 2]];
}

async function mergeAll(page: Page): Promise<string> {
  await page.getByTestId('btn-merge-all').click();
  await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 200_000 });
  const tracks = await tracksOf(page);
  const clips = tracks.flatMap((t) => t.clips);
  expect(clips).toHaveLength(1);
  expect(tracks[0].clips).toHaveLength(1);
  return clips[0].mediaId;
}

test('merge all on three layers (middle hidden) and two audio tracks (one muted): composite of the visible layers, one undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const before = await tracksOf(page);
  const depth = (await playerState(page)).undoDepth;

  const id = await mergeAll(page);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  const after = await tracksOf(page);
  // Ruling H: names, hide and the other tracks' mute stay; the target is unmuted and every solo is cleared, so
  // the merged clip on v1 is audible (trackAudible: not muted, no solo anywhere).
  const flags = (ts: Track[]) => ts.map(({ clips: _c, ...t }) => t);
  expect(flags(after)).toEqual(flags(before).map((t) => ({ ...t, solo: false, muted: t.id === 'v1' ? false : t.muted })));
  expect(after[0].muted || after.some((t) => t.solo)).toBe(false);
  const file = await mediaFile(page, id, 'merged.mp4');
  expect(Math.abs(duration(file) - 1)).toBeLessThanOrEqual(0.3);
  const f = ffmpegFrame(file, 5);
  expect([f.width, f.height]).toEqual([1920, 1080]);
  const isRed = (p: number[]) => p[0] > 180 && p[1] < 80 && p[2] < 80;
  const isBlue = (p: number[]) => p[2] > 180 && p[0] < 80 && p[1] < 80;
  expect(isRed(rgbAt(f, 960, 540)), 'centre: background').toBe(true);
  expect(isRed(rgbAt(f, 460, 540)), 'hidden green layer is not in the merge').toBe(true);
  expect(isBlue(rgbAt(f, 1460, 540)), 'visible blue layer').toBe(true);
  // Only a2 (volume 0.5) is heard: the muted a1 at volume 1 would push the peak to about 1.5× the tone's.
  const reference = audioPeak(tone) ?? 0;
  expect(reference).toBeGreaterThan(1000);
  const peak = audioPeak(file) ?? 0;
  expect(Math.abs(peak / (reference * 0.5) - 1), `peak ${peak} vs tone ${reference}`).toBeLessThanOrEqual(0.15);

  await page.getByTestId('btn-undo').click();
  expect(await tracksOf(page)).toEqual(before);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // With every audio track muted nothing is audible: the merged file has no sound.
  await page.evaluate(() =>
    window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, muted: true } : t)) })),
  );
  const silentId = await mergeAll(page);
  const silent = await mediaFile(page, silentId, 'merged-silent.mp4');
  expect(audioPeak(silent) ?? 0).toBeLessThan(50);
  expect(errors).toEqual([]);
});
