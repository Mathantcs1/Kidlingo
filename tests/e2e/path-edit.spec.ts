// Plan 5B Task 8: editing the motion path on the canvas. Key dots drag (ONE step, the picture follows, live == commit),
// a click still seeks, Escape cancels, tangent handles curve the path (ONE step), Smooth path and the corner toggle
// are ONE step each, a locked layer is read-only, the clip body still drags (orient: path-edit-orient.spec.ts).
import { test, expect } from '@playwright/test';
import { evalPosition } from '../../src/core/spatialPath';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isGreen, setupPip, undoDepth } from './pip-helpers';
import {
  C, centreOf, dots, keyPip, maxDiff, pageAt, pipKeys, playhead, pressAndMove, projectJson, setTime, snapshot,
} from './path-edit-helpers';

test.setTimeout(90_000);

const KEYS = [{ t: 0, x: -400, y: -200 }, { t: 0.8, x: 0, y: 200 }, { t: 1.6, x: 400, y: -200 }];

test('dragging a key dot moves that key in ONE step; the preview follows live and equals the commit; a click still seeks', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyPip(page, KEYS, 1); // at 1.0 s the clip is a quarter of the way from key 1 to key 2: (100, 100)
  await expectPixel(page, C.x + 100, C.y + 10, isGreen, 'before');
  const depth = await undoDepth(page);
  await pressAndMove(page, await centreOf(dots(page).nth(2)), await pageAt(page, 400, 200));
  // Live: key 2 at (400, 200) puts the clip at (100, 200) at 1.0 s, nothing committed yet.
  await expectPixel(page, C.x + 100, C.y + 290, isGreen, 'live drag preview');
  await expectPixel(page, C.x + 100, C.y + 10, isBlue, 'live drag preview');
  await page.waitForTimeout(150);
  const live = await snapshot(page);
  expect(await undoDepth(page)).toBe(depth);
  await page.mouse.up();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  const keys = await pipKeys(page);
  expect(keys.map((k) => k.t)).toEqual([0, 0.8, 1.6]);
  expect(Math.abs(keys[2].x - 400)).toBeLessThan(4);
  expect(Math.abs(keys[2].y - 200)).toBeLessThan(4);
  expect(keys[0]).toEqual({ t: 0, x: -400, y: -200, ease: { kind: 'linear' } });
  expect(await playhead(page)).toBeCloseTo(1, 6); // the drag did not seek
  await page.waitForTimeout(150);
  expect(maxDiff(live, await snapshot(page)), 'live preview equals the committed frame').toBeLessThanOrEqual(1);
  // The dot followed the key.
  const want = await pageAt(page, keys[2].x, keys[2].y);
  const got = await centreOf(dots(page).nth(2));
  expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1.5);
  // A click (no travel) still seeks, with no history.
  await dots(page).nth(0).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(0, 6);
  expect(await undoDepth(page)).toBe(depth + 1);
  // Undo restores the key exactly.
  await page.keyboard.press('ControlOrMeta+z');
  expect((await pipKeys(page))[2]).toEqual({ t: 1.6, x: 400, y: -200, ease: { kind: 'linear' } });
  expect(errors).toEqual([]);
});

test('Escape during a dot drag cancels: no history, no change, no seek, the preview goes back', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS, 1);
  const depth = await undoDepth(page);
  const json = await projectJson(page);
  await pressAndMove(page, await centreOf(dots(page).nth(2)), await pageAt(page, 400, 200));
  await expectPixel(page, C.x + 100, C.y + 290, isGreen, 'live drag preview');
  await page.keyboard.press('Escape');
  await expectPixel(page, C.x + 100, C.y + 10, isGreen, 'cancelled preview');
  await page.mouse.up();
  await page.waitForTimeout(100);
  expect(await undoDepth(page)).toBe(depth);
  expect(await projectJson(page)).toBe(json);
  expect(await playhead(page)).toBeCloseTo(1, 6);
});

test('a tangent handle curves the path in ONE step: mid-segment the picture leaves the chord', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyPip(page, [{ t: 0, x: -400, y: 0 }, { t: 1.6, x: 400, y: 0 }], 0); // key 0 under the playhead
  const out = page.getByTestId('motion-tangent-out');
  await expect(out).toHaveAttribute('data-empty', 'true'); // its default: a third of the chord
  await expect(page.getByTestId('motion-tangent-in')).toHaveCount(0); // a first key has no incoming segment
  const depth = await undoDepth(page);
  await pressAndMove(page, await centreOf(out), await pageAt(page, -400 + 800 / 3, -600));
  expect(await undoDepth(page)).toBe(depth);
  await page.mouse.up();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  const keys = await pipKeys(page);
  expect(Math.abs(keys[0].out!.x - 800 / 3)).toBeLessThan(5);
  expect(Math.abs(keys[0].out!.y + 600)).toBeLessThan(5);
  expect(keys[0].broken).toBeUndefined();
  expect(keys[1].in).toBeUndefined();
  await expect(out).not.toHaveAttribute('data-empty', 'true');
  // Mid-segment (0.8 s): the resolver puts the clip well above the chord; the preview shows it there.
  const mid = evalPosition(keys, undefined, 0.8);
  expect(mid.y).toBeLessThan(-150);
  await setTime(page, 0.8);
  await expectPixel(page, C.x + Math.round(mid.x), C.y + Math.round(mid.y), isGreen, 'on the curve');
  await expectPixel(page, C.x + Math.round(mid.x), C.y, isBlue, 'off the chord');
  expect(errors).toEqual([]);
});

test('Smooth path and the double-click corner toggle are ONE step each', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS, 1.2);
  await expect(dots(page).nth(1)).toHaveAttribute('data-corner', 'true');
  const depth = await undoDepth(page);
  await page.getByTestId('mp-smooth').click();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  const keys = await pipKeys(page);
  expect(keys[0].out).toEqual({ x: 400 / 3, y: 400 / 3 });
  expect(keys[1].in!.y).toBeCloseTo(0, 9); // prev -> next is horizontal
  expect(keys[1].out!.y).toBeCloseTo(0, 9);
  await expect(dots(page).nth(1)).not.toHaveAttribute('data-corner', 'true');
  await page.getByTestId('mp-smooth').click(); // already smooth: no step
  await page.waitForTimeout(100);
  expect(await undoDepth(page)).toBe(depth + 1);
  // Double-click the middle dot (not under the playhead): smooth -> corner, ONE step (its clicks only seek).
  await dots(page).nth(1).dblclick();
  await expect.poll(() => undoDepth(page)).toBe(depth + 2);
  expect((await pipKeys(page))[1].in).toBeUndefined();
  await expect(dots(page).nth(1)).toHaveAttribute('data-corner', 'true');
  // Again, now that its key is under the playhead: the dot sits on the clip centre and lets presses through to the
  // clip, and a double-click there still toggles that key: corner -> smooth.
  await page.waitForTimeout(700); // past the dot's short "just clicked" window
  await expect(dots(page).nth(1)).toHaveAttribute('data-current', 'true');
  const at = await centreOf(dots(page).nth(1));
  await page.mouse.dblclick(at.x, at.y);
  await expect.poll(() => undoDepth(page)).toBe(depth + 3);
  await expect(dots(page).nth(1)).not.toHaveAttribute('data-corner', 'true');
});

test('locked layer: the path shows and dots seek, but nothing drags; no handles, no Smooth path', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS, 0, { locked: true });
  await expect(dots(page)).toHaveCount(3);
  await expect(page.getByTestId('motion-tangent-out')).toHaveCount(0);
  await expect(page.getByTestId('mp-smooth')).toHaveCount(0);
  const depth = await undoDepth(page);
  const json = await projectJson(page);
  const was = await centreOf(dots(page).nth(2));
  await pressAndMove(page, was, await pageAt(page, 400, 200));
  const during = await centreOf(dots(page).nth(2)); // no live drag either
  expect(Math.hypot(during.x - was.x, during.y - was.y)).toBeLessThan(0.5);
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await undoDepth(page)).toBe(depth);
  expect(await projectJson(page)).toBe(json);
  await expect(page.getByTestId('error-toast')).toHaveCount(0); // nothing was even tried
  await dots(page).nth(1).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(0.8, 6);
});

test('dragging the clip body still moves the clip (and its key), with the tangent handles shown', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS, 0.8); // key 1 under the playhead: its handles show, its dot lets presses through
  await expect(page.getByTestId('motion-tangent-out')).toHaveCount(1);
  const depth = await undoDepth(page);
  await pressAndMove(page, await pageAt(page, 0, 200), await pageAt(page, 60, 200));
  await page.mouse.up();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  const keys = await pipKeys(page);
  expect(keys).toHaveLength(3);
  expect(keys[1].x).toBeGreaterThan(55);
  expect(keys[1].x).toBeLessThan(65);
  expect(keys[1].in).toBeUndefined(); // a body drag never touches tangents
});
