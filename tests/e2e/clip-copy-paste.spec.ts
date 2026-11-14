// Clip copy, paste and duplicate (Plan 5B Task 9, Part 1): one copy pasted at three playhead times gives three new
// clips at exactly those starts (ONE undo step each, rendered pixels), Ctrl/Cmd+C/V inside text fields stay native,
// an overlap is refused with a toast and no step, and the Copy / Paste / Duplicate toolbar buttons.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isGreen, setupPip } from './pip-helpers';

test.setTimeout(90_000);

const CENTRE = { x: 960, y: 540 };
const isBlack = (p: number[]): boolean => p[0] < 30 && p[1] < 30 && p[2] < 30;
const project = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const v2 = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present.tracks.find((t) => t.id === 'v2')!.clips.map((c) => ({ id: c.id, start: c.start, mediaId: c.mediaId, out: c.out })));
const selection = (page: Page) => page.evaluate(() => window.__clipforge!.getState().selection);
const playhead = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const ctrl = (page: Page, key: string) => page.keyboard.press(`Control+${key}`);

test('one copy pasted at three playhead times: three new clips at exactly those starts, one undo step each, rendered', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'green');
  const original = await project(page);
  const d0 = await depth(page);
  const pipMedia = (await v2(page))[0].mediaId;
  await ctrl(page, 'c');
  expect(await depth(page)).toBe(d0);
  expect(await project(page)).toBe(original);

  const times = [2.5, 5, 7.5];
  for (const [i, t] of times.entries()) {
    await playhead(page, t);
    await ctrl(page, 'v');
    expect(await depth(page)).toBe(d0 + i + 1);
    const clips = await v2(page);
    expect(clips).toHaveLength(2 + i);
    expect(clips.some((c) => c.start === t)).toBe(true);
    // Selection became the pasted clip.
    const sel = await selection(page);
    expect(sel).toHaveLength(1);
    expect(clips.find((c) => c.id === sel[0])!.start).toBe(t);
  }
  const clips = await v2(page);
  expect(clips.map((c) => c.start).sort((a, b) => a - b)).toEqual([0, 2.5, 5, 7.5]);
  expect(new Set(clips.map((c) => c.id)).size).toBe(4);
  expect(clips.every((c) => c.mediaId === pipMedia && c.out === 2)).toBe(true);
  // The media bin did not grow: media is reused, never copied.
  expect(await page.getByTestId('media-item').count()).toBe(4);

  // Each pasted clip renders: green square at the centre at 0.5 s into each paste (the background ends at 5 s).
  await playhead(page, 3);
  await expectPixel(page, CENTRE.x, CENTRE.y, isGreen, 'first paste');
  await playhead(page, 6);
  await expectPixel(page, CENTRE.x, CENTRE.y, isGreen, 'second paste');
  await playhead(page, 8);
  await expectPixel(page, CENTRE.x, CENTRE.y, isGreen, 'third paste');
  await expectPixel(page, 100, 100, isBlack, 'beyond the background');

  // Three undos remove them one by one, then the project is exactly the original; the picture follows.
  for (let i = times.length; i > 0; i--) {
    await page.getByTestId('btn-undo').click();
    expect(await depth(page)).toBe(d0 + i - 1);
  }
  expect(await project(page)).toBe(original);
  await playhead(page, 8);
  await expectPixel(page, CENTRE.x, CENTRE.y, isBlack, 'after undo');
  await playhead(page, 3);
  await expectPixel(page, CENTRE.x, CENTRE.y, isBlue, 'background only after undo');
  expect(errors).toEqual([]);
});

test('Ctrl/Cmd+C and V inside a text field stay native: the project and the clip clipboard are untouched', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'green');
  await ctrl(page, 'c'); // copy the clip
  const before = await project(page);
  const d0 = await depth(page);
  await page.getByTestId('track-name').first().dblclick();
  const input = page.getByTestId('track-name-input');
  await input.fill('Hello');
  await ctrl(page, 'a');
  await ctrl(page, 'c');
  await page.keyboard.press('End');
  await ctrl(page, 'v');
  // The field got the native paste (text), no clip was pasted, nothing else changed.
  await expect(input).toHaveValue('HelloHello');
  expect((await v2(page)).length).toBe(1);
  expect(await depth(page)).toBe(d0);
  await page.keyboard.press('Escape');
  expect(await project(page)).toBe(before);
  // The clip clipboard still holds the clip: leaving the field, V pastes it (at the playhead past the clip).
  await page.mouse.click(5, 5);
  await playhead(page, 4);
  await ctrl(page, 'v');
  expect((await v2(page)).map((c) => c.start).sort((a, b) => a - b)).toEqual([0, 4]);
  expect(errors).toEqual([]);
});

test('an overlap is refused: a toast, no new clip, no undo step, the selection stays', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'green');
  await ctrl(page, 'c');
  const d0 = await depth(page);
  const before = await project(page);
  await playhead(page, 1); // inside the original clip
  await ctrl(page, 'v');
  await expect(page.getByTestId('error-toast')).toContainText('overlap');
  expect(await depth(page)).toBe(d0);
  expect(await project(page)).toBe(before);
  expect(await selection(page)).toEqual(['pip']);
  expect(errors).toEqual([]);
});

test('toolbar: Copy, Paste and Duplicate buttons with their states, tooltips and one step per click', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'green');
  const copy = page.getByTestId('copy-clip');
  const paste = page.getByTestId('paste-clip');
  const dup = page.getByTestId('duplicate-clip');
  await expect(copy).toBeEnabled();
  await expect(copy).toHaveAttribute('title', /Ctrl\/Cmd\+C/);
  await expect(paste).toBeDisabled();
  await expect(paste).toHaveAttribute('title', 'Copy a clip first');
  await expect(dup).toHaveAttribute('title', /Ctrl\/Cmd\+D/);
  await page.evaluate(() => window.__clipforge!.getState().select([]));
  await expect(copy).toBeDisabled();
  await expect(dup).toBeDisabled();
  await page.evaluate(() => window.__clipforge!.getState().select(['pip']));

  const d0 = await depth(page);
  await copy.click();
  await expect(paste).toBeEnabled();
  await expect(paste).toHaveAttribute('title', /Ctrl\/Cmd\+V/);
  await playhead(page, 3);
  await paste.click();
  await paste.click(); // the second click lands on the (now overlapping) first paste: refused
  await expect(page.getByTestId('error-toast')).toBeVisible();
  expect(await depth(page)).toBe(d0 + 1);
  expect((await v2(page)).map((c) => c.start).sort((a, b) => a - b)).toEqual([0, 3]);

  // Duplicate puts the copy right after the selection (the pasted clip 3..5 -> 5..7) and selects it; Ctrl+D does the same.
  await dup.click();
  expect(await depth(page)).toBe(d0 + 2);
  expect((await v2(page)).map((c) => c.start).sort((a, b) => a - b)).toEqual([0, 3, 5]);
  await ctrl(page, 'd');
  expect(await depth(page)).toBe(d0 + 3);
  expect((await v2(page)).map((c) => c.start).sort((a, b) => a - b)).toEqual([0, 3, 5, 7]);
  await page.getByTestId('btn-undo').click();
  expect((await v2(page)).map((c) => c.start).sort((a, b) => a - b)).toEqual([0, 3, 5]);
  expect(errors).toEqual([]);
});
