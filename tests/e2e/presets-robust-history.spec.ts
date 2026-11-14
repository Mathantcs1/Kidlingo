// Plan 5B Task 10: history and persistence of preset clips in the real app. Clip copy/paste/duplicate (Task 9) of a clip
// carrying presets + loops + a curved path with a spring ease (and of a sticker overlay), Copy/Paste animation onto an
// adjustment layer (kind repair), and removing a slot: seven gestures are seven undo steps; undo and redo walk back and
// forth restoring every state exactly (project JSON); a reload restores the project JSON exactly; pasted clips animate
// exactly like the original (pixels at the same offset from their starts).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { presetStack } from './preset-robust-helpers';
import { layered, depth, expectSameFrames, load, openWithImages, present, presentJson, snapshots } from './robust-helpers';
import type { Clip } from '../../src/core/model';

test.setTimeout(180_000);

const select = (page: Page, ids: string[]) => page.evaluate((ids) => { const s = window.__clipforge!.getState(); s.select(ids); (document.activeElement as HTMLElement | null)?.blur(); }, ids);
const playhead = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const clips = async (page: Page): Promise<Clip[]> => (await present(page)).tracks.flatMap((t) => t.clips);
const OPACITY_ONLY = ['fade', 'flash', 'blink'];

/** The preset clip's animation without its identity and place: what a copy must carry. */
const animationOf = (c: Clip) => JSON.stringify({ keys: c.keys, motion: c.motion, effects: c.effects.map((e) => ({ ...e, id: '' })), transform: c.transform });

test('seven gestures on preset clips: seven undo steps, undo/redo restore every state exactly, reload restores the project', async ({ page }) => {
  const errors = trackErrors(page);
  await load(page, presetStack(await openWithImages(page), { start: 0.5, len: 2, bgLen: 12 }));
  const states = [await presentJson(page)];
  const d0 = await depth(page);
  const original = (await clips(page)).find((c) => c.id === 'img')!;

  const gestures: [string, () => Promise<void>][] = [
    ['copy the image clip, paste at 3 s', async () => { await select(page, ['img']); await page.keyboard.press('Control+c'); await playhead(page, 3); await page.keyboard.press('Control+v'); }],
    ['paste at 5.5 s', async () => { await playhead(page, 5.5); await page.keyboard.press('Control+v'); }],
    ['paste at 8 s', async () => { await playhead(page, 8); await page.keyboard.press('Control+v'); }],
    ['duplicate the pasted clip (it is still selected)', async () => { await page.keyboard.press('Control+d'); }],
    ['copy the sticker, paste at 4 s', async () => { await select(page, ['ov']); await page.keyboard.press('Control+c'); await playhead(page, 4); await page.keyboard.press('Control+v'); }],
    ['copy the image animation, paste onto the adjustment layer', async () => {
      await select(page, ['img']);
      await page.getByTestId('anim-copy').click();
      await select(page, ['adj']);
      await page.getByTestId('anim-paste').click();
    }],
    ['remove the loop preset of the original image', async () => { await select(page, ['img']); await page.getByTestId('anim-remove-loop').click(); }],
  ];
  for (const [i, [what, run]] of gestures.entries()) {
    await run();
    await expect.poll(() => depth(page), { message: what }).toBe(d0 + i + 1);
    states.push(await presentJson(page));
    expect(states[i + 1], `${what} changed the project`).not.toBe(states[i]);
  }

  // Content: the three pasted images and the duplicate carry exactly the original's animation, in new clips.
  const all = await clips(page);
  const images = all.filter((c) => c.kind === 'image' && c.id !== 'bg' && c.mediaId === original.mediaId);
  expect(images).toHaveLength(5);
  expect(new Set(images.map((c) => c.id)).size).toBe(5);
  const withLoop = images.filter((c) => c.motion?.loop);
  expect(withLoop).toHaveLength(4); // the loop of the ORIGINAL was removed by the last gesture, the copies keep theirs
  for (const c of withLoop) expect(animationOf(c)).toBe(animationOf({ ...original, motion: { ...original.motion } }));
  const copies = images.filter((c) => c.id !== 'img').map((c) => c.start).sort((a, b) => a - b);
  expect(copies).toEqual([3, 5.5, 8, 10]); // the duplicate goes right after the selection's end (8 + 2)
  const adj = all.find((c) => c.id === 'adj')!;
  for (const slot of ['in', 'emphasis', 'loop', 'out'] as const) if (adj.motion?.[slot]) expect(OPACITY_ONLY).toContain(adj.motion[slot]!.preset);
  expect(adj.keys?.position).toBeUndefined();
  const sticker = all.filter((c) => c.kind === 'overlay');
  expect(sticker).toHaveLength(2);

  const n = gestures.length;
  for (let i = n - 1; i >= 0; i--) {
    await page.getByTestId('btn-undo').click();
    expect(await presentJson(page), `undo to state ${i}`).toBe(states[i]);
  }
  for (let i = 1; i <= n; i++) {
    await page.getByTestId('btn-redo').click();
    expect(await presentJson(page), `redo to state ${i}`).toBe(states[i]);
  }
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect.poll(() => presentJson(page)).toBe(states[n]);
  expect(errors).toEqual([]);
});

test('a pasted preset clip animates exactly like the original: frames at the same offset from each start are identical', async ({ page }) => {
  const errors = trackErrors(page);
  const m = await openWithImages(page);
  const stack = presetStack(m, { start: 0.5, len: 2, bgLen: 12 });
  // Only the image on top of the background: the sticker and adjustment layer would add their own motion.
  await load(page, layered([[stack.tracks[0].clips[0]], [stack.tracks[1].clips[0]]], Object.values(m)));
  await select(page, ['img']);
  await page.keyboard.press('Control+c');
  const starts = [3.5, 6.5, 9.5];
  for (const t of starts) { await playhead(page, t); await page.keyboard.press('Control+v'); }
  expect((await clips(page)).filter((c) => c.id !== 'bg').map((c) => c.start).sort((a, b) => a - b)).toEqual([0.5, ...starts]);
  const offsets = [0, 4, 12, 20, 30, 41, 50, 59].map((f) => f / 30); // In window, Pulse, loop and Out window
  const original = await snapshots(page, offsets.map((o) => 0.5 + o));
  for (const s of starts) expectSameFrames(original, await snapshots(page, offsets.map((o) => s + o)), `paste at ${s}`);
  // And they survive a reload as the same pictures.
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const json = await presentJson(page);
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect.poll(() => presentJson(page)).toBe(json);
  expectSameFrames(original, await snapshots(page, offsets.map((o) => 9.5 + o)), 'after reload');
  expect(errors).toEqual([]);
});
