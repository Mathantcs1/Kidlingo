// Plan 5B journey through the real UI: a photo and a video; Ken Burns + Fade In on the photo; Slide In + Pulse + Fade
// Out on the video; keys with a spring ease and a Repeat loop on a sticker overlay, its path curved (Smooth path) and
// oriented; its animation copied to a second sticker; saved as a preset and, after a reload, applied to a third; the
// video split at a whole frame (every frame unchanged); a clip pasted at three places (Ctrl+C, three Ctrl+V); a
// 1080p export whose duration is within a frame and whose five frames match the preview. One undo step per gesture.
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';
import { depth, f } from './effects-ui-helpers';
import { exportFile, fileBlocks, maxDiff, settledBlocks } from './effects-journey-helpers';
import { clipOf, diffs, grabs, kenPng, present, setTime } from './keyframes-journey-helpers';
import { gestures, overlaysOf, pick, typed } from './presets-journey-helpers';

test.setTimeout(600_000);

const FPS = 30;
const CUT_TIMES = [43, 44, 45, 46, 47, 60].map((n) => n / FPS); // around the split at 1.5 s
const GRAB = [10, 24, 42, 58, 75]; // preview vs export frames

test('presets journey: Ken Burns, Slide/Pulse/Fade, spring + loop + curved path sticker, copy, save and reuse, split, paste x3, undo chain, reload, 1080p export', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, kenPng()], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [video] = await clipStates(page);
  await page.getByTestId('btn-add-video-layer').click();
  await addToTimeline(page, 'ken.png', 2);
  const image = (await clipStates(page)).find((c) => c.id !== video.id)!;
  for (const i of [0, 1, 2]) {
    await page.getByTestId('btn-add-video-layer').click();
    await f(page, 'overlay-add').click();
    await f(page, 'overlay-add-sticker').click();
    await expect.poll(async () => (await overlaysOf(page)).length).toBe(i + 1);
  }
  // Setup edits (not counted): a 3 s photo and 3 s stickers at the start, side by side.
  const ids = (await overlaysOf(page)).map((o) => o.id);
  await page.evaluate((ids) => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => {
    const k = ids.indexOf(c.id);
    if (k >= 0) return { ...c, start: 0, in: 0, out: 3, transform: { ...c.transform, x: -500 + 500 * k, y: 250, scale: 0.6 } };
    return c.kind === 'image' ? { ...c, out: c.in + 3 } : c;
  }) })) })), ids);
  const [st1, st2, st3] = ids;

  const startJson = JSON.stringify(await present(page));
  const startDepth = await depth(page);
  const { steps, gesture } = gestures(page);
  const keyTimes = async (id: string, prop: 'scale' | 'position') => ((await clipOf(page, id)).keys?.[prop] ?? []).map((k) => k.t);

  // 1. The photo: Fade In and Ken Burns (Loop slot).
  await clipEl(page, image.id).click();
  await setTime(page, 0);
  await gesture('photo Fade In', () => pick(page, 'in', 'fade'));
  await gesture('photo Ken Burns', () => pick(page, 'loop', 'kenBurns'));
  expect(Object.keys((await clipOf(page, image.id)).motion!).sort()).toEqual(['in', 'loop']);

  // 2. The video: Slide In, Pulse at 0.5 s, Fade Out.
  await clipEl(page, video.id).click();
  await setTime(page, 0);
  await gesture('video Slide In', () => pick(page, 'in', 'slide'));
  await setTime(page, 0.5);
  await gesture('video Pulse at the playhead', () => pick(page, 'emphasis', 'pulse'));
  await gesture('video Fade Out', () => pick(page, 'out', 'fade'));
  expect((await clipOf(page, video.id)).motion!.emphasis!.at).toBe(0.5);

  // 3. Sticker 1: position keys, a spring ease, scale keys with a Repeat loop, Smooth path and orient.
  await clipEl(page, st1).click();
  await setTime(page, 0);
  await gesture('position stopwatch', () => f(page, 'kf-toggle-position').click());
  await gesture('x -400', typed(page, 'inspector-x', '-400'));
  await setTime(page, 2);
  await gesture('x 400 at 2 s', typed(page, 'inspector-x', '400'));
  await gesture('y 150 at 2 s', typed(page, 'inspector-y', '150'));
  expect(await keyTimes(st1, 'position')).toEqual([0, 2]);
  await page.locator('[data-testid="keyframe-diamond"][data-time="0.0000"]').first().dblclick();
  await expect(f(page, 'ease-editor')).toBeVisible();
  await gesture('spring ease', () => f(page, 'ease-preset-spring').click());
  await f(page, 'ease-close').click();
  await setTime(page, 0);
  await gesture('scale stopwatch', () => f(page, 'kf-toggle-scale').click());
  await gesture('scale 50', typed(page, 'inspector-scale', '50'));
  await setTime(page, 1);
  await gesture('scale 110 at 1 s', typed(page, 'inspector-scale', '110'));
  expect(await keyTimes(st1, 'scale')).toEqual([0, 1]);
  await gesture('Repeat loop on scale', async () => { await f(page, 'kf-loop-scale').selectOption('repeat'); });
  await gesture('Smooth path', () => f(page, 'mp-smooth').click());
  await gesture('orient along the path', () => f(page, 'kf-orient').check());
  const s1 = await clipOf(page, st1);
  expect(s1.keys!.loops).toEqual({ scale: { mode: 'repeat', count: null } });
  expect(s1.keys!.orient).toBe(true);
  expect(s1.keys!.position!.some((k) => k.in || k.out)).toBe(true); // curved: tangents at the ends
  expect(s1.keys!.position![0].ease.kind).toBe('spring');

  // 4. Copy its animation to sticker 2 (replaces it, ONE step); the copy is the same animation.
  await f(page, 'anim-copy').click();
  await clipEl(page, st2).click();
  await gesture('paste animation onto sticker 2', () => f(page, 'anim-paste').click());
  const s2 = await clipOf(page, st2);
  expect(s2.keys!.loops).toEqual(s1.keys!.loops);
  expect(s2.keys!.position!.map((k) => k.ease.kind)).toEqual(['spring', 'linear']);

  // 5. Save sticker 1's animation as a preset (the library, not the project), then reload.
  await clipEl(page, st1).click();
  const d = await depth(page);
  await f(page, 'preset-save').click();
  await f(page, 'preset-save-name').fill('Journey swoop');
  await f(page, 'preset-save-category').selectOption('in');
  await f(page, 'preset-save-confirm').click();
  await expect(f(page, 'preset-save-dialog')).toHaveCount(0);
  expect(await depth(page)).toBe(d);

  // Undo chain of this phase: one step per gesture back to the start, then forward again.
  const phaseA = JSON.stringify(await present(page));
  for (let i = 0; i < steps.n; i++) await page.getByTestId('btn-undo').click();
  expect(await depth(page)).toBe(startDepth);
  expect(JSON.stringify(await present(page))).toBe(startJson);
  for (let i = 0; i < steps.n; i++) await page.getByTestId('btn-redo').click();
  expect(JSON.stringify(await present(page))).toBe(phaseA);
  console.log(`journey: ${steps.n} gestures before the reload`);

  await page.waitForTimeout(900);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  // Deep equality: the load repair writes `keys` in canonical order, so the JSON text may differ in key order only.
  expect(await present(page)).toEqual(JSON.parse(phaseA));

  // 6. After the reload: apply the saved preset to sticker 3 (ONE step, relative to its own place).
  const b = await depth(page);
  const bJson = phaseA;
  await clipEl(page, st3).click();
  await setTime(page, 0);
  await f(page, 'anim-choose-in').click();
  await f(page, 'preset-cat-mine').click();
  await page.locator('[data-testid^="preset-tile-user-"]').first().click();
  await expect(f(page, 'preset-browser')).toHaveCount(0);
  expect(await depth(page)).toBe(b + 1);
  const s3 = await clipOf(page, st3);
  expect(s3.keys!.position!.map((k) => k.x - s3.transform.x)).toEqual(s1.keys!.position!.map((k) => k.x - s1.keys!.position![0].x));
  expect(s3.keys!.loops).toEqual(s1.keys!.loops);

  // 7. Split the video at a whole frame (45 frames = 1.5 s): every frame around the cut is unchanged.
  const before = await grabs(page, CUT_TIMES);
  const beforeGrab = await grabs(page, GRAB.map((n) => n / FPS));
  expect(maxDiff(beforeGrab[0], beforeGrab[3]), 'the animation changes the picture').toBeGreaterThan(25);
  await clipEl(page, video.id).click();
  await setTime(page, 1.5);
  await gesture('split the video', () => f(page, 'btn-split').click());
  const drift = diffs(before, await grabs(page, CUT_TIMES));
  console.log(`journey: split pixel drift per frame ${drift.map((x) => x.toFixed(2)).join('/')}`);
  for (const x of drift) expect(x, 'the split leaves every frame unchanged').toBeLessThan(3);
  const halves = (await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'video');
  expect(halves.map((c) => Object.keys(c.motion ?? {}).sort().join('+')).sort()).toEqual(['emphasis+in', 'out']);

  // 8. Copy the photo (Ken Burns + Fade In) and paste it at three places: three steps, one each.
  await clipEl(page, image.id).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+c');
  const pasteStarts = [3.5, 7, 10.5];
  for (const t of pasteStarts) {
    await setTime(page, t);
    await gesture(`paste the photo at ${t}`, async () => { await page.keyboard.press('Control+v'); });
  }
  const photos = (await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.mediaId === image.mediaId);
  expect(photos.map((c) => c.start).sort((x, y) => x - y)).toEqual([0, ...pasteStarts]);
  for (const c of photos) expect(c.motion).toEqual(photos[0].motion);
  const doneJson = JSON.stringify(await present(page));
  expect(await depth(page)).toBe(b + 1 + 1 + 3); // phase B: apply the saved preset, split, three pastes
  for (let i = 0; i < 5; i++) await page.getByTestId('btn-undo').click();
  expect(await depth(page)).toBe(b);
  expect(await present(page)).toEqual(JSON.parse(bJson)); // (key order differs from before the reload, see above)
  for (let i = 0; i < 5; i++) await page.getByTestId('btn-redo').click();
  expect(JSON.stringify(await present(page))).toBe(doneJson);

  // 9. Reload again, then export at 1080p: duration within one frame, five frames match the preview.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  expect(JSON.stringify(await present(page))).toBe(doneJson);
  const preview: number[][][] = [];
  for (const n of GRAB) preview.push(await settledBlocks(page, n / FPS));
  const reloadDrift = diffs(beforeGrab, preview);
  console.log(`journey: reloaded preview vs the pre-split preview ${reloadDrift.map((x) => x.toFixed(2)).join('/')}`);
  for (const x of reloadDrift) expect(x, 'reloaded preview equals the pre-edit picture').toBeLessThan(3);
  const file = await exportFile(page);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString()) as {
    format: { duration: string }; streams: { codec_type: string; width?: number; height?: number }[];
  };
  expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ width: 1920, height: 1080 });
  const done = await present(page);
  const end = Math.max(...done.tracks.flatMap((t) => t.clips).map((c) => c.start + (c.out - c.in)));
  expect(Math.abs(Number(probe.format.duration) - end)).toBeLessThanOrEqual(1 / FPS + 1e-3);
  const exp = GRAB.map((n, i) => maxDiff(preview[i], fileBlocks(file, n)));
  console.log(`journey: export vs preview max block drift ${exp.map((x) => x.toFixed(1)).join('/')}/255`);
  for (const x of exp) expect(x, 'export frame matches the preview').toBeLessThan(8);
  await f(page, 'btn-export-close').click();
  expect(errors).toEqual([]);
});
