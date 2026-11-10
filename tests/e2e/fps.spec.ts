// The project adopts the frame rate of the first video clip added to an empty timeline, and exports at it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { addToTimeline, importFiles, open } from './helpers';
import { importPaths, openHarness } from './harness-helpers';
import { emptyProject } from '../../src/core/model';
import { addClip } from '../../src/core/timeline';
import { clipFromMedia } from '../../src/media/clip';

test.setTimeout(120_000);

const fps25 = join(ensureFixtures(), 'fps25.mp4');

test('adding a 25 fps clip to the empty timeline makes the project 25 fps', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => window.__clipforge!.getState().history.present.format.fps)).toBe(30);
  await importFiles(page, [fps25], 1);
  await addToTimeline(page, 'fps25.mp4', 1);
  expect(await page.evaluate(() => window.__clipforge!.getState().history.present.format.fps)).toBe(25);
});

test('a 25 fps project exports at 25 fps with the right duration', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [fps25]);
  let p = { ...emptyProject(), media: { [m.id]: m } };
  const track = p.tracks[0].id;
  p = addClip(p, track, clipFromMedia(m, track, 0, p.format));
  expect(p.format.fps).toBe(25);
  // A tiny frame (the fixture's own size) for the software renderer.
  p = { ...emptyProject(), media: p.media, format: { width: 160, height: 90, fps: p.format.fps } };
  p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [clipFromMedia(m, t.id, 0, p.format)] } : t)) };
  const b64 = await page.evaluate(({ p }) => window.cf.exportBase64(p, 160), { p });
  mkdirSync(test.info().outputDir, { recursive: true });
  const out = join(test.info().outputDir, 'fps25-export.mp4');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  const probe = JSON.parse(
    execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', out,
    ]).toString(),
  );
  expect(probe.streams[0].avg_frame_rate).toBe('25/1');
  expect(Number(probe.streams[0].nb_read_frames)).toBe(50);
  expect(Math.abs(Number(probe.format.duration) - 2)).toBeLessThanOrEqual(0.05);
});
