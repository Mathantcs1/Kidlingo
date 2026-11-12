// Plan 5A journey through the real UI: a video and an image; Ken Burns scale + position keys (easeInOut preset) on the
// image; an opacity fade-in (edited with the curve editor) and an animated Colour saturation on the video; a whole-frame
// split of the image and of the animated decoded video, plus a trim of the video; the undo chain (one step per
// gesture), reload (project JSON exact) and a 1080p export whose duration and three frames match the preview.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';
import { depth, f } from './effects-ui-helpers';
import { exportFile, fileBlocks, maxDiff, settledBlocks } from './effects-journey-helpers';
import { clipOf, diffs, dragTrim, grabs, kenPng, present, setTime } from './keyframes-journey-helpers';

test.setTimeout(480_000);

const FPS = 30;
const CUT_TIMES = [29, 30, 31, 44, 45, 46, 60, 75].map((n) => n / FPS); // around both cuts (video 1.0 s, image 1.5 s)
const GRAB = [39, 57, 78]; // export/preview comparison frames: video right half and image both on screen

test('keyframes journey: Ken Burns, fade-in, animated colour, ease edit, split/trim, undo chain, reload, 1080p export', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, kenPng()], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [video] = await clipStates(page);
  await page.getByTestId('btn-add-video-layer').click();
  await addToTimeline(page, 'ken.png', 2);
  const image = (await clipStates(page)).find((c) => c.id !== video.id)!;
  // A still lasts 5 s: shorten it to the video's 3 s (a setup edit, before the counted chain).
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.kind === 'image' ? { ...c, out: c.in + 3 } : c)) })) })));

  const startJson = JSON.stringify(await present(page));
  const startDepth = await depth(page);
  let steps = 0;
  const gesture = async (name: string, run: () => Promise<void>): Promise<void> => {
    const before = await depth(page);
    await run();
    await expect.poll(() => depth(page), { message: name }).toBe(before + 1);
    steps++;
  };
  const typed = (id: string, v: string) => async () => { await f(page, id).fill(v); await f(page, id).press('Enter'); };
  const keyTimes = async (id: string, prop: 'scale' | 'position' | 'opacity') => ((await clipOf(page, id)).keys?.[prop] ?? []).map((k) => k.t);

  // 1. Ken Burns on the image: scale 50% -> 90% and X -400 -> +400 between 0 and 2.5 s, then easeInOut on the first keys.
  await clipEl(page, image.id).click();
  await setTime(page, 0);
  await gesture('scale stopwatch', () => f(page, 'kf-toggle-scale').click());
  await gesture('scale 50', typed('inspector-scale', '50'));
  await gesture('position stopwatch', () => f(page, 'kf-toggle-position').click());
  await gesture('x -400', typed('inspector-x', '-400'));
  await setTime(page, 2.5);
  await gesture('scale 90 at 2.5', typed('inspector-scale', '90'));
  await gesture('x 400 at 2.5', typed('inspector-x', '400'));
  expect(await keyTimes(image.id, 'scale')).toEqual([0, 2.5]);
  expect(await keyTimes(image.id, 'position')).toEqual([0, 2.5]);
  await page.locator('[data-testid="keyframe-diamond"][data-time="0.0000"]').dblclick();
  await expect(f(page, 'ease-editor')).toBeVisible();
  await gesture('easeInOut preset', () => f(page, 'ease-preset-easeInOut').click());
  await f(page, 'ease-close').click();
  const ken = await clipOf(page, image.id);
  expect(ken.keys!.scale![0].ease.kind).toBe('easeInOut');
  expect(ken.keys!.position![0].ease.kind).toBe('easeInOut');

  // 2. The video: opacity fade-in 0 -> 100% over 1 s, its first ease edited in the curve editor.
  await clipEl(page, video.id).click();
  await setTime(page, 0);
  await gesture('opacity stopwatch', () => f(page, 'kf-toggle-opacity').click());
  await gesture('opacity 0', typed('inspector-opacity', '0'));
  await setTime(page, 1);
  await gesture('opacity 100 at 1 s', typed('inspector-opacity', '100'));
  expect(await keyTimes(video.id, 'opacity')).toEqual([0, 1]);
  await page.locator('[data-testid="keyframe-diamond"][data-time="0.0000"]').dblclick();
  await gesture('curve editor x1', typed('ease-x1', '0.6'));
  await f(page, 'ease-close').click();
  expect((await clipOf(page, video.id)).keys!.opacity![0].ease).toMatchObject({ kind: 'bezier', bezier: [0.6, 0.25, 0.75, 0.75] });

  // 3. An animated colour effect on the video: saturation -60% at 0 s -> +60% at 2 s.
  await setTime(page, 0);
  await gesture('add colour', async () => { await f(page, 'fx-add').selectOption('colour'); await f(page, 'fx-add-button').click(); });
  const colour = (await clipOf(page, video.id)).effects[0];
  await gesture('saturation stopwatch', () => f(page, `fx-${colour.id}-saturation-kf`).click());
  await gesture('saturation -0.6', async () => { await f(page, `fx-${colour.id}-saturation`).fill('-0.6'); });
  await setTime(page, 2);
  await gesture('saturation 0.6 at 2 s', async () => { await f(page, `fx-${colour.id}-saturation`).fill('0.6'); });
  expect((await clipOf(page, video.id)).effects[0].keys!.saturation!.map((k) => k.t)).toEqual([0, 2]);

  // Pixels around the cuts and at the comparison frames before any split.
  const before = await grabs(page, CUT_TIMES);
  const beforeGrab = await grabs(page, GRAB.map((n) => n / FPS));
  expect(maxDiff(beforeGrab[0], beforeGrab[2]), 'the animation changes the picture').toBeGreaterThan(25);

  // 4. Split the animated decoded video at 1.0 s (30 frames from its start) and the image at 1.5 s (45 frames).
  await clipEl(page, video.id).click();
  await setTime(page, 1);
  await gesture('split video', () => f(page, 'btn-split').click());
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  await clipEl(page, image.id).click();
  await setTime(page, 1.5);
  await gesture('split image', () => f(page, 'btn-split').click());
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  const afterSplit = diffs(before, await grabs(page, CUT_TIMES));
  console.log(`journey: split pixel drift per frame ${afterSplit.map((d) => d.toFixed(2)).join('/')}`);
  for (const d of afterSplit) expect(d, 'the split leaves every frame unchanged').toBeLessThan(3);
  const right = (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.kind === 'video' && c.id !== video.id)!;
  expect(right.in).toBeCloseTo(1, 9);
  expect(right.keys!.opacity!.map((k) => k.t)).toContain(1);
  expect(right.effects[0].keys!.saturation!.length).toBeGreaterThanOrEqual(2);

  // 5. Trim the video's right half's start by 12 px = 6 frames (0.2 s): later frames are unchanged.
  const late = [45, 60, 75].map((n) => n / FPS);
  const beforeTrim = await grabs(page, late);
  await gesture('trim video', () => dragTrim(page, right.id, 'start', 12));
  const trimmed = await clipOf(page, right.id);
  expect(trimmed.start).toBeCloseTo(1.2, 9);
  expect(trimmed.in).toBeCloseTo(1.2, 9);
  const afterTrim = diffs(beforeTrim, await grabs(page, late));
  console.log(`journey: trim pixel drift per frame ${afterTrim.map((d) => d.toFixed(2)).join('/')}`);
  for (const d of afterTrim) expect(d, 'the trim leaves later frames unchanged').toBeLessThan(3);
  console.log(`journey: ${steps} gestures`);

  // Undo chain: one step per gesture back to the start, then forward again.
  const doneJson = JSON.stringify(await present(page));
  for (let i = 0; i < steps; i++) await page.getByTestId('btn-undo').click();
  expect(await depth(page)).toBe(startDepth);
  expect(JSON.stringify(await present(page))).toBe(startJson);
  for (let i = 0; i < steps; i++) await page.getByTestId('btn-redo').click();
  expect(JSON.stringify(await present(page))).toBe(doneJson);

  // Reload: the project comes back exactly and looks the same.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  expect(JSON.stringify(await present(page))).toBe(doneJson);
  const preview: number[][][] = [];
  for (const n of GRAB) preview.push(await settledBlocks(page, n / FPS));
  const reloadDrift = diffs(beforeGrab, preview);
  console.log(`journey: reloaded preview vs the pre-split preview ${reloadDrift.map((d) => d.toFixed(2)).join('/')}`);
  for (const d of reloadDrift) expect(d, 'reloaded preview equals the pre-edit picture').toBeLessThan(3);

  // Export at 1080p: duration within one frame; three frames match the preview.
  const file = await exportFile(page);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString()) as {
    format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[];
  };
  expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080 });
  const done = await present(page);
  const end = Math.max(...done.tracks.flatMap((t) => t.clips).map((c) => c.start + (c.out - c.in)));
  expect(Math.abs(Number(probe.format.duration) - end)).toBeLessThanOrEqual(1 / FPS + 1e-3);
  const drift = GRAB.map((n, i) => maxDiff(preview[i], fileBlocks(file, n)));
  console.log(`journey: export vs preview max block drift ${drift.map((d) => d.toFixed(1)).join('/')}/255`);
  for (const d of drift) expect(d, 'export frame matches the preview').toBeLessThan(8);
  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});

