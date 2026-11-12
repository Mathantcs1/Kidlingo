// Plan 5 Task 8 fix round 1: SEVERAL selected diamonds move / delete together in ONE undo step, and an Escape that
// clears the key selection is marked as used (defaultPrevented). Same pip project as keyframes-timeline.spec.ts:
// 'pip' at timeline 1..3 s, scale keys at timeline 1.0 / 2.0 (local 0.5 / 1.5), an opacity key at timeline 1.5.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipEl, trackErrors } from './helpers';
import { setupPip, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const clipOf = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip'));
const keysOf = async (page: Page, prop: 'scale' | 'opacity') => ((await clipOf(page))?.keys?.[prop] ?? []).map((k) => [k.t, k.v]);
const diamonds = (page: Page) => page.getByTestId('keyframe-diamond');
const diamond = (page: Page, time: number) => page.locator(`[data-testid="keyframe-diamond"][data-time="${time.toFixed(4)}"]`);
const picked = (page: Page) => page.locator('[data-testid="keyframe-diamond"][aria-pressed="true"]');

async function setup(page: Page): Promise<void> {
  await setupPip(page);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    const lin = { kind: 'linear' as const };
    s.apply((p) => {
      const pip = p.tracks.find((t) => t.id === 'v2')!.clips[0];
      const keyed = { ...pip, start: 1, in: 0.5, out: 2.5, keys: { scale: [{ t: 0.5, v: 1, ease: lin }, { t: 1.5, v: 2, ease: lin }], opacity: [{ t: 1, v: 1, ease: lin }] } };
      return { ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, clips: [keyed] } : t)) };
    });
    s.select(['pip']);
    s.setPlayhead(0.2);
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect(diamonds(page)).toHaveCount(3);
  await diamond(page, 1.5).click();
  await diamond(page, 2).click({ modifiers: ['Shift'] });
  await expect(picked(page)).toHaveCount(2);
}

test('dragging one of two selected diamonds moves BOTH in ONE undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const before = await page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
  const depth = await undoDepth(page);
  const b = (await diamond(page, 2).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 6 }); // +0.5 s at 60 px/s
  await page.mouse.up();
  await expect.poll(() => keysOf(page, 'scale')).toEqual([[0.5, 1], [2, 2]]);
  expect(await keysOf(page, 'opacity')).toEqual([[1.5, 1]]);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(picked(page)).toHaveCount(2);
  await expect(diamond(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(diamond(page, 2.5)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present))).toBe(before);
  expect(errors).toEqual([]);
});

test('Delete removes BOTH selected keys in ONE step and keeps the clip', async ({ page }) => {
  await setup(page);
  const depth = await undoDepth(page);
  await page.keyboard.press('Delete');
  await expect(diamonds(page)).toHaveCount(1);
  expect(await keysOf(page, 'scale')).toEqual([[0.5, 1]]);
  expect(await keysOf(page, 'opacity')).toEqual([]);
  await expect(clipEl(page, 'pip')).toHaveCount(1);
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.keyboard.press('Control+z');
  await expect(diamonds(page)).toHaveCount(3);
});

test('an Escape that clears the key selection is preventDefault-ed; a second Escape is not', async ({ page }) => {
  await setup(page);
  const escape = () => page.evaluate(() => !window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', cancelable: true, bubbles: true })));
  expect(await escape()).toBe(true);
  await expect(picked(page)).toHaveCount(0);
  expect(await escape()).toBe(false);
});
