// Plan 5C Task 8: transition chips on the timeline: "+" on a bare cut, the duration drag, Delete routing, `T`, locked tracks
// and a trim that breaks the cut. Two clips of the 3 s with-audio.mp4, trimmed to 0.5..2.5 so each has 0.5 s of handle.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, setPlayhead, toast, trackErrors, withAudio } from './helpers';

test.setTimeout(90_000);

const present = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const transitions = async (page: Page) => (await present(page)).tracks.flatMap((t) => t.transitions ?? []);
const chip = (page: Page) => page.getByTestId('transition-chip');

async function setup(page: Page): Promise<{ a: string; b: string }> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'with-audio.mp4', 2);
  const ids = (await clipStates(page)).filter((c) => c.trackKind === 'video').sort((x, y) => x.start - y.start).map((c) => c.id);
  await page.evaluate(([a, b]) => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === a ? { ...c, start: 0, in: 0.5, out: 2.5 } : c.id === b ? { ...c, start: 2, in: 0.5, out: 2.5 } : c)),
      })),
    }));
    window.__clipforge!.getState().select([]);
  }, ids);
  return { a: ids[0], b: ids[1] };
}

async function addViaPlus(page: Page): Promise<void> {
  await page.getByTestId('timeline-lane').first().hover();
  await page.getByTestId('transition-cut').first().click();
  await expect(chip(page)).toHaveCount(1);
}

test('"+" on a bare cut adds the last-used transition: one undo step, selected, undo removes it', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const d = await depth(page);
  await addViaPlus(page);
  expect(await depth(page)).toBe(d + 1);
  const [t] = await transitions(page);
  expect(t.type).toBe('dissolve');
  expect(t.duration).toBeCloseTo(1, 1); // 0.5 s of handle each side allows exactly 1 s
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('transition-cut')).toHaveCount(0);
  await page.getByTestId('btn-undo').click();
  await expect(chip(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a duration drag is ONE undo step and stops at the handle limit', async ({ page }) => {
  await setup(page);
  await addViaPlus(page);
  const d0 = await depth(page);
  // Shorten first: right handle 30 px left = -1 s of window: clamps to the 2-frame floor.
  const handle = page.getByTestId('transition-chip-handle-r');
  let b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 10, b.y + b.height / 2, { steps: 5 });
  await page.mouse.move(b.x - 14, b.y + b.height / 2, { steps: 3 });
  await page.mouse.up();
  expect(await depth(page)).toBe(d0 + 1);
  const shorter = (await transitions(page))[0].duration;
  expect(shorter).toBeLessThan(0.5);
  // Now far to the right: the limit is the handles (1 s).
  b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 400, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await depth(page)).toBe(d0 + 2);
  expect((await transitions(page))[0].duration).toBeCloseTo(1, 1);
});

test('Escape during a duration drag cancels it: no step, the duration is unchanged', async ({ page }) => {
  await setup(page);
  await addViaPlus(page);
  const d0 = await depth(page);
  const before = (await transitions(page))[0].duration;
  const b = (await page.getByTestId('transition-chip-handle-r').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 12, b.y + b.height / 2, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await depth(page)).toBe(d0);
  expect((await transitions(page))[0].duration).toBe(before);
});

test('Delete removes the selected transition and leaves the clips; Escape only deselects', async ({ page }) => {
  await setup(page);
  await addViaPlus(page);
  await page.keyboard.press('Escape');
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await transitions(page)).toHaveLength(1);
  await chip(page).click();
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'true');
  const d = await depth(page);
  await page.keyboard.press('Delete');
  await expect(chip(page)).toHaveCount(0);
  expect(await depth(page)).toBe(d + 1);
  expect((await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'video')).toHaveLength(2);
});

test('selecting a clip deselects the transition, then Delete removes the clip not the transition', async ({ page }) => {
  const { a } = await setup(page);
  await addViaPlus(page);
  await clipEl(page, a).click();
  await expect(chip(page)).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Delete');
  expect(await transitions(page)).toHaveLength(0); // deleting the clip took its transition with it (D9)
  expect((await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'video')).toHaveLength(1);
});

test('T adds the last-used transition at the cut nearest the playhead', async ({ page }) => {
  await setup(page);
  await setPlayhead(page, 1.7);
  const d = await depth(page);
  await page.keyboard.press('t');
  await expect(chip(page)).toHaveCount(1);
  expect(await depth(page)).toBe(d + 1);
  await page.keyboard.press('t');
  await expect(toast(page)).toContainText('No cut without a transition');
});

test('a locked track has no "+" and refuses duration drags and T', async ({ page }) => {
  await setup(page);
  await addViaPlus(page);
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.transitions?.length ? { ...t, locked: true } : t)) })));
  const before = JSON.stringify(await transitions(page));
  const b = (await page.getByTestId('transition-chip-handle-r').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 14, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(JSON.stringify(await transitions(page))).toBe(before);
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, transitions: undefined })) })));
  await expect(page.getByTestId('transition-cut')).toHaveCount(0);
  await setPlayhead(page, 2);
  await page.keyboard.press('t');
  await expect(toast(page)).toContainText('locked');
});

test('trimming a cut edge removes the transition with a toast; undo restores it', async ({ page }) => {
  const { a } = await setup(page);
  await addViaPlus(page);
  await clipEl(page, a).click();
  const handle = clipEl(page, a).getByTestId('trim-end');
  const b = (await handle.boundingBox())!;
  const before = JSON.stringify(await transitions(page));
  const y = b.y + b.height * 0.85; // the chip covers the upper half of the cut; the clip's trim handle stays reachable below it
  await page.mouse.move(b.x + b.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(b.x - 40, y, { steps: 6 });
  await page.mouse.up();
  await expect(chip(page)).toHaveCount(0);
  await expect(page.getByTestId('info-toast')).toContainText('Transition removed');
  await page.getByTestId('btn-undo').click();
  await expect(chip(page)).toHaveCount(1);
  expect(JSON.stringify(await transitions(page))).toBe(before);
});
