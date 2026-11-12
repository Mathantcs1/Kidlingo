// Plan 5 Task 8: summary keyframe diamonds on the timeline, key selection, the retiming drag and the keyboard
// (Delete removes selected keys before clips, `[` / `]` jump, Escape cancels). Built on the pip project: 'pip' (lime
// 200×200 image, sourced) is moved to timeline 1..3 s showing source 0.5..2.5 s with scale keys at local 0.5 / 1.5
// (timeline 1.0 / 2.0) and an opacity key at local 1.0 (timeline 1.5); an adjustment layer 'adj' (sourceless, its
// `in` of 7 is ignored) at 0.5..3.0 s has opacity keys at local 0.5 / 2.0 (timeline 1.0 / 2.5).
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { clipEl, expectOnlyToast, playerState, toast, trackErrors } from './helpers';
import { expectPixel, isBlue, isGreen, setupPip, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const PPS = 60;
const C = { x: 960, y: 540 };
const projectJson = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const clipOf = (page: Page, id: string) =>
  page.evaluate((id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id), id);
const keysOf = async (page: Page, prop: 'scale' | 'opacity') => ((await clipOf(page, 'pip'))?.keys?.[prop] ?? []).map((k) => [k.t, k.v]);
const diamonds = (page: Page) => page.getByTestId('keyframe-diamond');
const diamond = (page: Page, time: number) => page.locator(`[data-testid="keyframe-diamond"][data-time="${time.toFixed(4)}"]`);
const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.__clipforge!.getState().select(ids), ids);
const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);

async function setup(page: Page, locked = false): Promise<void> {
  await setupPip(page);
  await page.evaluate((locked) => {
    const s = window.__clipforge!.getState();
    const lin = { kind: 'linear' as const };
    s.apply((p) => {
      const pip = p.tracks.find((t) => t.id === 'v2')!.clips[0];
      const keyed = { ...pip, start: 1, in: 0.5, out: 2.5, keys: { scale: [{ t: 0.5, v: 1, ease: lin }, { t: 1.5, v: 2, ease: lin }], opacity: [{ t: 1, v: 1, ease: lin }] } };
      const adj = { ...pip, id: 'adj', kind: 'adjustment' as const, mediaId: '', start: 0.5, in: 7, out: 9.5, keys: { opacity: [{ t: 0.5, v: 1, ease: lin }, { t: 2, v: 0.5, ease: lin }] } };
      const tracks = p.tracks.map((t) => (t.id === 'v2' ? { ...t, locked, clips: [keyed] } : t));
      const v3 = { ...tracks[1], id: 'v3', locked: false, clips: [adj] };
      return { ...p, tracks: [tracks[0], tracks[1], v3, tracks[2]] };
    });
    s.select(['pip']);
    s.setPlayhead(0.2);
    (document.activeElement as HTMLElement | null)?.blur();
  }, locked);
  await expect(diamonds(page)).toHaveCount(3);
}

async function centreOf(loc: Locator): Promise<{ x: number; y: number }> {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Presses the diamond, moves by `dx` px, optionally checks the live state, then releases (or Escape first). */
async function dragDiamond(page: Page, time: number, dx: number, during?: () => Promise<void>, escape = false): Promise<void> {
  const from = await centreOf(diamond(page, time));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 6 });
  if (during) await during();
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
}

test('diamonds sit at the key times for sourced and sourceless clips; only on selected picture clips', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const check = async (id: string, start: number, times: number[]) => {
    await expect(diamonds(page)).toHaveCount(times.length);
    const clipBox = (await clipEl(page, id).boundingBox())!;
    for (const t of times) {
      const c = await centreOf(diamond(page, t));
      expect(Math.abs(c.x - (clipBox.x + (t - start) * PPS))).toBeLessThanOrEqual(1);
      expect(c.y).toBeGreaterThan(clipBox.y + clipBox.height / 2);
      expect(c.y).toBeLessThan(clipBox.y + clipBox.height);
    }
    await expect(diamond(page, times[0])).toHaveAttribute('aria-label', `Keyframe at ${times[0].toFixed(2)} s`);
  };
  await check('pip', 1, [1, 1.5, 2]);
  await select(page, ['adj']);
  await check('adj', 0.5, [1, 2.5]);
  // Unselected clips and audio clips show no row.
  await select(page, ['bg']);
  await expect(page.getByTestId('keyframe-row')).toHaveCount(0);
  await select(page, ['tone']);
  await expect(page.getByTestId('keyframe-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('click selects and seeks, Shift adds, Tab + Enter selects, clicking the clip body clears; no history', async ({ page }) => {
  await setup(page);
  const depth = await undoDepth(page);
  await diamond(page, 1.5).click();
  await expect(diamond(page, 1.5)).toHaveAttribute('aria-pressed', 'true');
  expect((await playerState(page)).playhead).toBeCloseTo(1.5, 6);
  await diamond(page, 2).click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-testid="keyframe-diamond"][aria-pressed="true"]')).toHaveCount(2);
  expect((await playerState(page)).playhead).toBeCloseTo(2, 6);
  // Clicking the clip body (above the row) clears the key selection but keeps the clip selected.
  const box = (await clipEl(page, 'pip').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 6);
  await expect(page.locator('[data-testid="keyframe-diamond"][aria-pressed="true"]')).toHaveCount(0);
  await expect(clipEl(page, 'pip')).toHaveAttribute('data-selected', 'true');
  // Keyboard: a focused diamond takes Enter: it selects, seeks and opens the ease editor.
  await diamond(page, 1).focus();
  await page.keyboard.press('Enter');
  await expect(diamond(page, 1)).toHaveAttribute('aria-pressed', 'true');
  expect((await playerState(page)).playhead).toBeCloseTo(1, 6);
  await expect(page.getByTestId('ease-editor')).toBeVisible();
  // The first Escape closes the editor (selection kept, focus back on the diamond); the next one (no drag) drops the key selection.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ease-editor')).toHaveCount(0);
  await expect(diamond(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(diamond(page, 1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(diamond(page, 1)).toHaveAttribute('aria-pressed', 'false');
  expect(await undoDepth(page)).toBe(depth);
});

test('a drag retimes the key by whole frames in ONE undo step; the animation follows; undo is exact', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const before = await projectJson(page);
  const depth = await undoDepth(page);
  // At 2.0 s the square is at scale 2 (half-size 200 px).
  await setTime(page, 2);
  await expectPixel(page, C.x + 180, C.y, isGreen, 'scale 2 before the move');
  await dragDiamond(page, 2, 30, async () => {
    await expect(diamond(page, 2.5)).toBeVisible();
    expect(await undoDepth(page)).toBe(depth); // live only
  });
  await expect.poll(() => keysOf(page, 'scale')).toEqual([[0.5, 1], [2, 2]]);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(diamond(page, 2.5)).toHaveAttribute('aria-pressed', 'true');
  // The click that ends the drag is swallowed: no seek, no clip deselection.
  await expect(clipEl(page, 'pip')).toHaveAttribute('data-selected', 'true');
  expect((await playerState(page)).playhead).toBeCloseTo(2, 6);
  await expect(page.locator('[data-testid="keyframe-diamond"][aria-pressed="true"]')).toHaveCount(1);
  // At 2.0 s the scale is now 1 + (1.5 − 0.5) / 1.5 = 1.667 (half-size ~167 px).
  await expectPixel(page, C.x + 150, C.y, isGreen, 'interpolated after the move');
  await expectPixel(page, C.x + 180, C.y, isBlue, 'interpolated after the move');
  await page.keyboard.press('Control+z');
  await expect.poll(() => projectJson(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('a drag onto another key snaps back with a toast and no history change', async ({ page }) => {
  await setup(page);
  const before = await projectJson(page);
  await dragDiamond(page, 2, -60, async () => {
    await expect(page.getByTestId('keyframe-row')).toHaveClass(/is-reject/);
  });
  await expectOnlyToast(page, 'Keyframes would overlap');
  expect(await projectJson(page)).toBe(before);
  await expect(diamond(page, 2)).toBeVisible();
});

test('Escape cancels a diamond drag: keys, history and the diamond are unchanged', async ({ page }) => {
  await setup(page);
  const before = await projectJson(page);
  const depth = await undoDepth(page);
  await dragDiamond(page, 2, 30, async () => {
    await expect(diamond(page, 2.5)).toBeVisible();
  }, true);
  await expect(diamond(page, 2)).toBeVisible();
  expect(await projectJson(page)).toBe(before);
  expect(await undoDepth(page)).toBe(depth);
  // The press selected it; the cancelled drag keeps that selection.
  await expect(diamond(page, 2)).toHaveAttribute('aria-pressed', 'true');
});

test('Delete removes the selected keys in ONE step; the next Delete removes the clip as before', async ({ page }) => {
  await setup(page);
  const depth = await undoDepth(page);
  await diamond(page, 1.5).click();
  await page.keyboard.press('Delete');
  await expect(diamonds(page)).toHaveCount(2);
  expect(await keysOf(page, 'opacity')).toEqual([]);
  expect((await clipOf(page, 'pip'))?.transform.opacity).toBe(1);
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.keyboard.press('Delete');
  await expect(clipEl(page, 'pip')).toHaveCount(0);
  expect(await undoDepth(page)).toBe(depth + 2);
});

test('[ and ] move the playhead between the selected clip\'s keys, without history', async ({ page }) => {
  await setup(page);
  const depth = await undoDepth(page);
  const playhead = async () => (await playerState(page)).playhead;
  for (const [key, t] of [[']', 1], [']', 1.5], [']', 2], [']', 2], ['[', 1.5], ['[', 1]] as const) {
    await page.keyboard.press(key);
    await expect.poll(playhead).toBeCloseTo(t, 6);
  }
  expect(await undoDepth(page)).toBe(depth);
});

test('locked track: diamonds select and seek but a drag and Delete are refused', async ({ page }) => {
  await setup(page, true);
  const before = await projectJson(page);
  await diamond(page, 1.5).click();
  await expect(diamond(page, 1.5)).toHaveAttribute('aria-pressed', 'true');
  expect((await playerState(page)).playhead).toBeCloseTo(1.5, 6);
  await page.keyboard.press('Delete');
  await expectOnlyToast(page, 'Track is locked');
  expect(await projectJson(page)).toBe(before);
  await expect(clipEl(page, 'pip')).toHaveCount(1);
  await page.locator('.toast-close').click();
  await expect(toast(page)).toHaveCount(0);
  await dragDiamond(page, 2, 30, async () => {
    await expect(diamond(page, 2)).toBeVisible(); // nothing moves live
  });
  await expectOnlyToast(page, 'Track is locked');
  expect(await projectJson(page)).toBe(before);
});
