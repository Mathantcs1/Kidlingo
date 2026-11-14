// Plan 5B Task 8: the key loop control of an animated property (D4): Repeat / Ping-pong / Continue after the last key
// with a cycle count, ONE undo step per change, read through the real compositor; hidden below two keys.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isRed, isYellow, pixelAt, setupPip, undoDepth } from './pip-helpers';
import { C, pipClip, setTime } from './path-edit-helpers';

test.setTimeout(90_000);

/** Keys on the pip clip (layer v2), the clip selected, the playhead at `at`; `locked` locks its layer. */
async function keyPip(page: Page, keys: object, at: number, locked = false): Promise<void> {
  await page.evaluate(({ keys, at, locked }) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, locked, clips: t.clips.map((c) => ({ ...c, keys })) } : t)) }));
    s.select(['pip']);
    s.setPlayhead(at);
  }, { keys, at, locked });
}
const lin = { kind: 'linear' as const };
const OPACITY = { opacity: [{ t: 0, v: 0, ease: lin }, { t: 0.4, v: 1, ease: lin }] };

/** The pip's opacity at timeline time t, from the green channel of lime over blue at the centre. */
async function opacity(page: Page, t: number): Promise<number> {
  await setTime(page, t);
  await page.waitForTimeout(150);
  return (await pixelAt(page, C.x, C.y))[1] / 255;
}
const loops = async (page: Page) => (await pipClip(page)).keys?.loops;
const near = (a: number, b: number, tol = 3 / 255) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);

test('Repeat, a count, Ping-pong and back to until the end: ONE step each, the preview follows the loop', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyPip(page, OPACITY, 0.2);
  near(await opacity(page, 0.6), 1); // without a loop the last value holds
  const mode = page.getByTestId('kf-loop-opacity');
  const count = page.getByTestId('kf-loop-count-opacity');
  await expect(mode).toHaveValue('none');
  await expect(count).toBeDisabled();
  const d = await undoDepth(page);
  await mode.selectOption('repeat');
  await expect.poll(() => undoDepth(page)).toBe(d + 1);
  expect(await loops(page)).toEqual({ opacity: { mode: 'repeat', count: null } });
  // 1.5 periods equals 0.5 periods.
  const half = await opacity(page, 0.2);
  near(half, 0.5, 4 / 255);
  near(await opacity(page, 0.6), half);
  near(await opacity(page, 1.0), half); // 2.5 periods: until the clip end
  await expect(count).toHaveAttribute('placeholder', '∞');
  await count.fill('1');
  await count.press('Enter');
  await expect.poll(() => undoDepth(page)).toBe(d + 2);
  expect(await loops(page)).toEqual({ opacity: { mode: 'repeat', count: 1 } });
  near(await opacity(page, 0.6), half); // cycle 1 still plays
  near(await opacity(page, 1.0), 1); // after it, the end of cycle 1 holds
  await mode.selectOption('pingPong');
  await expect.poll(() => undoDepth(page)).toBe(d + 3);
  expect(await loops(page)).toEqual({ opacity: { mode: 'pingPong', count: 1 } }); // the count is kept
  near(await opacity(page, 0.5), 0.75, 4 / 255); // cycle 1 plays backwards (repeat would show 0.25)
  await count.fill('');
  await count.press('Enter');
  await expect.poll(() => undoDepth(page)).toBe(d + 4);
  expect(await loops(page)).toEqual({ opacity: { mode: 'pingPong', count: null } });
  await count.press('Enter'); // nothing typed: no step
  await mode.selectOption('none');
  await expect.poll(() => undoDepth(page)).toBe(d + 5);
  expect(await loops(page)).toBeUndefined();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await loops(page)).toEqual({ opacity: { mode: 'pingPong', count: null } });
  expect(errors).toEqual([]);
});

test('Continue on rotation 0 -> 90: 180 degrees at two periods (corner pixels)', async ({ page }) => {
  await setupPip(page, 'split'); // 300×100: red left half, yellow right half
  await keyPip(page, { rotation: [{ t: 0, v: 0, ease: lin }, { t: 0.4, v: 90, ease: lin }] }, 0.8);
  await expectPixel(page, C.x + 120, C.y, isBlue, 'held at 90 degrees: the picture is upright');
  const d = await undoDepth(page);
  await page.getByTestId('kf-loop-rotation').selectOption('offset');
  await expect.poll(() => undoDepth(page)).toBe(d + 1);
  await expectPixel(page, C.x + 120, C.y, isRed, '180 degrees: the red half on the right');
  await expectPixel(page, C.x - 120, C.y, isYellow, '180 degrees: the yellow half on the left');
  await expect(page.getByTestId('inspector-rotation')).toHaveValue('180');
  // Past the last key with a loop: an edit there would add a key and lengthen the loop; the row says so.
  await expect(page.getByTestId('kf-loop-rotation-hint')).toBeVisible();
  await setTime(page, 0.2);
  await expect(page.getByTestId('kf-loop-rotation-hint')).toHaveCount(0);
});

test('the control hides below two keys and shows the stored loop again when a second key arrives', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, { ...OPACITY, loops: { opacity: { mode: 'pingPong', count: 3 } } }, 0.4);
  await expect(page.getByTestId('kf-loop-opacity')).toHaveValue('pingPong');
  await expect(page.getByTestId('kf-loop-count-opacity')).toHaveValue('3');
  await page.getByTestId('kf-key-opacity').click(); // removes the key at 0.4: one key left
  await expect(page.getByTestId('kf-loop-opacity')).toHaveCount(0);
  expect(await loops(page)).toEqual({ opacity: { mode: 'pingPong', count: 3 } }); // inert, kept (R3-5)
  await setTime(page, 1);
  await page.getByTestId('kf-key-opacity').click(); // a second key
  await expect(page.getByTestId('kf-loop-opacity')).toHaveValue('pingPong');
  await expect(page.getByTestId('kf-loop-count-opacity')).toHaveValue('3');
});

test('a locked layer disables the loop control', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, OPACITY, 0.2, true);
  await expect(page.getByTestId('kf-loop-opacity')).toBeDisabled();
  await expect(page.getByTestId('kf-loop-count-opacity')).toBeDisabled();
});
