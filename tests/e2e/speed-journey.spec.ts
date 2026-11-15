// Plan 5D journey: import, 2x, reverse, split, a speed ramp on one half, a freeze frame on the other, detach and attach the
// sound, undo the whole chain one step per gesture, redo, reload (project restored exactly) and export 1080p (ffprobe: the
// duration is the timeline's end). Every edit goes through the real controls; the dev hook only reads.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, setPlayhead, trackErrors, withAudio } from './helpers';
import { clipEnd } from '../../src/core/clipTime';
import type { Project } from '../../src/core/model';

test.setTimeout(300_000);

const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const f = (page: Page, id: string) => page.getByTestId(id);

test('speed journey: 2x, reverse, split, ramp, freeze, detach/attach, undo chain, reload, export', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const startJson = JSON.stringify(await present(page));
  const startDepth = await depth(page);
  const id = (await clipStates(page))[0].id;
  let steps = 0;
  const gesture = async (name: string, run: () => Promise<void>): Promise<void> => {
    const before = await depth(page);
    await run();
    expect(await depth(page), name).toBe(before + 1);
    steps++;
  };
  const field = async (testId: string, value: string): Promise<void> => {
    await f(page, testId).fill(value);
    await f(page, testId).press('Enter');
  };

  await clipEl(page, id).click();
  await gesture('speed 200%', () => field('speed-value', '200'));
  await gesture('reverse', () => f(page, 'speed-reverse').click());
  // Split the 1.5 s reversed clip at 0.75 s: two halves, the left plays the END of the footage.
  await setPlayhead(page, 0.75);
  await gesture('split', () => f(page, 'btn-split').click());
  const halves = (await clipStates(page)).filter((c) => c.trackKind === 'video').sort((a, b) => a.start - b.start);
  expect(halves).toHaveLength(2);
  const [left, right] = halves;
  const clipOf = async (cid: string) => (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.id === cid)!;
  const l = await clipOf(left.id);
  const r = await clipOf(right.id);
  expect(l.reverse && r.reverse && l.speed === 2 && r.speed === 2).toBe(true);
  expect(l.in).toBeCloseTo(r.out, 6); // reversed halves join on the same footage time (left = upper footage)

  await clipEl(page, left.id).click();
  await f(page, 'speed-ripple').check(); // a ramp changes the length: push the clips after it
  await gesture('ramp preset', () => f(page, 'speed-preset-flash').click());
  expect((await clipOf(left.id)).speedKeys).toBeDefined();

  await clipEl(page, right.id).click();
  await setPlayhead(page, (await clipOf(right.id)).start + 0.3);
  await gesture('freeze frame', () => f(page, 'speed-freeze').click());
  expect((await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.freeze)).toHaveLength(1);

  const remaining = (await clipStates(page)).filter((c) => c.trackKind === 'video').find((c) => c.id === right.id)!;
  await clipEl(page, remaining.id).click();
  await gesture('detach audio', () => f(page, 'audio-detach').click());
  await clipEl(page, remaining.id).click();
  await gesture('attach audio', () => f(page, 'audio-attach').click());

  const done = await present(page);
  const doneJson = JSON.stringify(done);
  const undo = f(page, 'btn-undo');
  for (let i = 0; i < steps; i++) await undo.click();
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
  const end = Math.max(...done.tracks.flatMap((t) => t.clips).map((c) => clipEnd(c)));
  expect(Math.abs(Number(probe.format.duration) - end)).toBeLessThanOrEqual(2 / done.format.fps + 1e-3);
  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});
