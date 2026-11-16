// Plan 5C journey: two clips of the 3 s with-audio.mp4 (trimmed to 0.5..2.5 so each has 0.5 s of handle), a crossfade added
// with the cut's "+", turned into a soft wipe to the right, its duration dragged, the outgoing clip split OUTSIDE the window,
// the undo chain walked back exactly, redo, reload (project restored exactly) and a 1080p export measured with ffprobe/ffmpeg
// (duration, the picture at the cut, the audio through the crossfade). Every edit goes through the real controls.
import { execFileSync, spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, setPlayhead, trackErrors, withAudio } from './helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(300_000);

const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const f = (page: Page, id: string) => page.getByTestId(id);
const transitions = async (page: Page) => (await present(page)).tracks.flatMap((t) => t.transitions ?? []);

/** Mean level (dB) of the file's audio over [from, from + len). */
function levelDb(file: string, from: number, len: number): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume: (-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) throw new Error(`no volumedetect output: ${r.stderr.slice(-300)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** Mean luma (0..255) of the exported frame at `t` seconds. */
function lumaAt(file: string, t: number): number {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  return raw.reduce((a, v) => a + v, 0) / raw.length;
}

test('transition journey: crossfade, wipe, duration drag, split, undo chain, reload, export', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'with-audio.mp4', 2);
  const ids = (await clipStates(page)).filter((c) => c.trackKind === 'video').sort((x, y) => x.start - y.start).map((c) => c.id);
  await page.evaluate(([a, b]) => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, start: 0, in: 0.5, out: 2.5 } : c.id === b ? { ...c, start: 2, in: 0.5, out: 2.5 } : c)) })),
    }));
    window.__clipforge!.getState().select([]);
  }, [ids[0], ids[1]] as const);
  // The setup edit above is the journey's starting point (history before it is not part of the chain).
  const startJson = JSON.stringify(await present(page));
  const startDepth = await depth(page);
  let steps = 0;
  const gesture = async (name: string, run: () => Promise<void>): Promise<void> => {
    const before = await depth(page);
    await run();
    expect(await depth(page), name).toBe(before + 1);
    steps++;
  };

  // 1. Crossfade through the cut's "+".
  await gesture('add via +', async () => {
    await f(page, 'timeline-lane').first().hover();
    await f(page, 'transition-cut').first().click();
    await expect(f(page, 'transition-chip')).toHaveCount(1);
  });
  expect((await transitions(page))[0]).toMatchObject({ type: 'dissolve' });
  expect((await transitions(page))[0].duration).toBeCloseTo(1, 1);

  // 2. A soft wipe to the right.
  await gesture('type wipe', async () => {
    await f(page, 'transition-type').selectOption('wipe');
  });
  await gesture('direction right', () => f(page, 'transition-direction-right').click());
  await gesture('softness 20 %', async () => {
    await f(page, 'transition-softness').fill('20');
    await f(page, 'transition-softness').press('Enter');
  });
  expect((await transitions(page))[0]).toMatchObject({ type: 'wipe', direction: 'right' });
  expect((await transitions(page))[0].softness).toBeCloseTo(0.2, 6);

  // 3. Drag the duration shorter (one step, symmetric about the cut).
  await gesture('duration drag', async () => {
    const b = (await f(page, 'transition-chip-handle-r').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x - 10, b.y + b.height / 2, { steps: 5 });
    await page.mouse.move(b.x - 14, b.y + b.height / 2, { steps: 3 });
    await page.mouse.up();
  });
  const duration = (await transitions(page))[0].duration;
  expect(duration).toBeLessThan(1);
  expect(duration).toBeGreaterThan(0);

  // 4. Split the outgoing clip well outside the window: the transition follows the right half (same cut, same id).
  await clipEl(page, ids[0]).click();
  await setPlayhead(page, 0.6);
  await gesture('split outside the window', () => f(page, 'btn-split').click());
  const afterSplit = await present(page);
  const [t] = await transitions(page);
  const outgoing = afterSplit.tracks.flatMap((x) => x.clips).find((c) => c.id === t.fromClipId)!;
  expect(outgoing.start).toBeCloseTo(0.6, 3);
  expect(t.duration).toBeCloseTo(duration, 6);

  const done = await present(page);
  const doneJson = JSON.stringify(done);
  for (let i = 0; i < steps; i++) await f(page, 'btn-undo').click();
  expect(await depth(page)).toBe(startDepth);
  expect(JSON.stringify(await present(page))).toBe(startJson);
  for (let i = 0; i < steps; i++) await f(page, 'btn-redo').click();
  expect(JSON.stringify(await present(page))).toBe(doneJson);

  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(f(page, 'restore-failed')).toHaveCount(0);
  expect(JSON.stringify(await present(page))).toBe(doneJson);

  await f(page, 'btn-export').click();
  await f(page, 'export-quality').selectOption('1080p');
  await f(page, 'btn-export-start').click();
  const link = f(page, 'export-download');
  await expect(link).toBeVisible({ timeout: 280_000 });
  await expect(f(page, 'export-error')).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const file = (await download.path())!;
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString()) as {
    format: { duration: string };
    streams: { codec_type: string; width?: number; height?: number }[];
  };
  expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080 });
  expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
  // A transition never changes the timeline length: two 2 s clips, 4 s.
  expect(Math.abs(Number(probe.format.duration) - 4)).toBeLessThanOrEqual(2 / done.format.fps + 1e-3);

  // The picture at the cut (t = 2 s) shows picture (not black) and the sound runs through the crossfade without a dip or a jump.
  expect(lumaAt(file, 1.0)).toBeGreaterThan(20);
  expect(lumaAt(file, 2.0)).toBeGreaterThan(20);
  const before = levelDb(file, 1.2, 0.3);
  const through = levelDb(file, 1.85, 0.3);
  const after = levelDb(file, 2.5, 0.3);
  console.log(`transition journey audio: before ${before.toFixed(1)} through ${through.toFixed(1)} after ${after.toFixed(1)} dB`);
  expect(through).toBeGreaterThan(before - 4);
  expect(through).toBeLessThan(before + 4);
  expect(Math.abs(after - before)).toBeLessThan(4);
  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});
