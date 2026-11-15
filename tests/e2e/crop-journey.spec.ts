// Plan 5E journey through the real UI: a video and a photo; on the photo crop (fields, then a handle in crop mode), flip,
// a moved pivot, a rotation animation and an anchor animation, a Pop entrance (turns about the pivot); one undo step
// per gesture, the whole chain undone and redone, the photo split at a whole frame (every frame unchanged), a reload,
// and a 1080p export whose duration is within a frame and whose five frames match the preview.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { addToTimeline, center, clipEl, importFiles, open, trackErrors, withAudio } from './helpers';
import { depth, f } from './effects-ui-helpers';
import { exportFile, fileBlocks, maxDiff, settledBlocks } from './effects-journey-helpers';
import { clipOf, diffs, grabs, kenPng, present, setTime } from './keyframes-journey-helpers';
import { gestures, pick, typed } from './presets-journey-helpers';

test.setTimeout(600_000);

const FPS = 30;
const GRAB = [10, 24, 42, 58, 75];

test('crop journey: crop, crop on canvas, flip, pivot, rotation + anchor keys, Pop, undo chain, split, reload, 1080p export', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, kenPng()], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.getByTestId('btn-add-video-layer').click();
  await addToTimeline(page, 'ken.png', 2);
  const imageId = (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.kind === 'image')!.id;
  // Setup (not counted): a 3 s photo.
  await page.evaluate((id) => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, out: c.in + 3 } : c)) })) })), imageId);
  const startJson = JSON.stringify(await present(page));
  const { steps, gesture } = gestures(page);

  await clipEl(page, imageId).click();
  await setTime(page, 0);
  // 1-2. crop with the fields
  await gesture('crop left', typed(page, 'crop-left', '20'));
  await gesture('crop top', typed(page, 'crop-top', '10'));
  // 3. a handle in crop mode (the toggle itself is UI state, no step)
  await f(page, 'crop-mode-toggle').click();
  await expect(f(page, 'crop-overlay')).toBeVisible();
  const h = await center(f(page, 'crop-handle-r'));
  await gesture('crop right by dragging', async () => {
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x - 60, h.y, { steps: 8 });
    await page.mouse.up();
  });
  await f(page, 'crop-mode-toggle').click();
  const cropped = (await clipOf(page, imageId)).crop!;
  expect(cropped.left).toBeCloseTo(0.2, 2);
  expect(cropped.top).toBeCloseTo(0.1, 2);
  expect(cropped.right).toBeGreaterThan(0.02);
  // 4-5. flip and a moved pivot
  await gesture('flip horizontal', () => f(page, 'flip-h').click());
  await gesture('anchor x', typed(page, 'anchor-x', '-25'));
  // 6-7. rotation animation
  await gesture('animate rotation', () => f(page, 'kf-toggle-rotation').click());
  await setTime(page, 1.5);
  await gesture('rotation at 1.5 s', typed(page, 'inspector-rotation', '60'));
  // 8-9. anchor animation
  await setTime(page, 0);
  await gesture('animate anchor', () => f(page, 'kf-toggle-anchor').click());
  await setTime(page, 1.5);
  await gesture('anchor at 1.5 s', typed(page, 'anchor-x', '25'));
  // 10. a Pop entrance (turns about the pivot too)
  await setTime(page, 0);
  await gesture('Pop in', () => pick(page, 'in', 'pop'));

  const edited = await clipOf(page, imageId);
  expect(edited.flip).toEqual({ h: true });
  expect(edited.keys!.rotation).toHaveLength(2);
  expect(edited.keys!.anchor).toHaveLength(2);
  expect(edited.motion!.in!.preset).toBe('pop');
  expect(steps.n).toBe(10);

  // Undo the whole chain, then redo it: exact.
  const doneJson = JSON.stringify(await present(page));
  for (let i = 0; i < steps.n; i++) await page.getByTestId('btn-undo').click();
  expect(JSON.stringify(await present(page))).toBe(startJson);
  for (let i = 0; i < steps.n; i++) await page.getByTestId('btn-redo').click();
  expect(JSON.stringify(await present(page))).toBe(doneJson);

  // Split at a whole frame: every frame stays the same; both halves keep crop, flip and anchor keys.
  const times = [43, 44, 45, 46, 47, 60].map((n) => n / FPS);
  const beforeSplit = await grabs(page, times);
  await setTime(page, 1.5);
  await clipEl(page, imageId).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const d0 = await depth(page);
  await page.keyboard.press('s');
  await expect.poll(() => depth(page)).toBe(d0 + 1);
  const halves = (await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'image');
  expect(halves).toHaveLength(2);
  for (const c of halves) {
    expect(c.crop).toEqual(edited.crop);
    expect(c.flip).toEqual({ h: true });
    expect((c.keys?.anchor ?? []).length).toBeGreaterThanOrEqual(1);
  }
  const afterSplit = await grabs(page, times);
  const drift = diffs(beforeSplit, afterSplit);
  console.log(`crop journey: split drift per frame ${drift.map((x) => x.toFixed(2)).join('/')}`);
  for (const x of drift) expect(x, 'the split leaves every frame unchanged').toBeLessThan(3);

  // Reload: the project is restored exactly; then export at 1080p.
  const splitJson = JSON.stringify(await present(page));
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  expect(await present(page)).toEqual(JSON.parse(splitJson));
  const preview: number[][][] = [];
  for (const n of GRAB) preview.push(await settledBlocks(page, n / FPS));
  const file = await exportFile(page);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString()) as {
    format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[];
  };
  expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080 });
  const done = await present(page);
  const end = Math.max(...done.tracks.flatMap((t) => t.clips).map((c) => c.start + (c.out - c.in)));
  expect(Math.abs(Number(probe.format.duration) - end)).toBeLessThanOrEqual(1 / FPS + 1e-3);
  const exp = GRAB.map((n, i) => maxDiff(preview[i], fileBlocks(file, n)));
  console.log(`crop journey: export vs preview max block drift ${exp.map((x) => x.toFixed(1)).join('/')}/255`);
  for (const x of exp) expect(x, 'export frame matches the preview').toBeLessThan(8);
  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});
