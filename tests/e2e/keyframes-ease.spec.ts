// Plan 5 Task 9: ease presets and the cubic-Bézier curve editor (presets, handle drag, numeric inputs, arrow nudges).
// The pip project (a lime 200×200 square over blue, 0..2 s): opacity keys at local 0.4 (0) and 1.6 (1) and a third at
// 1.9, scale keys at 0.4 / 1.6 (value 1, so they only add refs). Opacity at the segment's quarter point (0.7 s) is
// measured through the preview's G channel. Helpers: ease-helpers.ts.
import { test, expect } from '@playwright/test';
import { easeAt } from '../../src/core/easing';
import { playerState, trackErrors } from './helpers';
import { curveD, diamond, fractionAt, handle, keys, near, num, editor, opacityAt, openOn, setup } from './ease-helpers';
import { undoDepth } from './pip-helpers';

test.setTimeout(90_000);

test('easeIn on a segment: the pixel at its quarter point follows easeAt, in ONE undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  const d = await undoDepth(page);
  const dblclick = diamond(page, 0.4);
  await dblclick.dblclick();
  await expect(editor(page)).toBeVisible();
  // Plan 5B: spring is stored data and evaluates (Task 3), but the editor offers it only with its fields (Task 8).
  await expect(page.getByTestId('ease-preset-linear')).toBeVisible();
  await expect(page.getByTestId('ease-preset-spring')).toHaveCount(0);
  await page.getByTestId('ease-preset-easeIn').click();
  expect(await undoDepth(page)).toBe(d + 1);
  expect((await keys(page, 'opacity')).map((e) => e.kind)).toEqual(['easeIn', 'linear', 'linear']);
  expect((await keys(page, 'scale')).map((e) => e.kind)).toEqual(['easeIn', 'linear']); // every property keyed at that time
  const expected = easeAt({ kind: 'easeIn' }, await fractionAt(page, 0.7));
  const got = await opacityAt(page, 0.7);
  console.log(`easeIn at the quarter point: ${got.toFixed(4)} (easeAt ${expected.toFixed(4)}, linear 0.25)`);
  near(got, expected, 2 / 255 + 0.005);
  expect(Math.abs(got - 0.25)).toBeGreaterThan(0.1);
  await expect(page.getByTestId('ease-preset-easeIn')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ControlOrMeta+z');
  expect((await keys(page, 'opacity'))[0].kind).toBe('linear');
  expect(await undoDepth(page)).toBe(d);
  expect(errors).toEqual([]);
});

test('dragging handle 1 commits ONCE on release; the preview follows the stored curve', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  const before = await curveD(page);
  const b = (await handle(page, 1).boundingBox())!;
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y - 40, { steps: 8 });
  // Live: the curve and the number move, nothing is committed.
  expect(await undoDepth(page)).toBe(d);
  expect(await curveD(page)).not.toBe(before);
  await expect.poll(async () => Number(await num(page, 'x1').inputValue())).toBeCloseTo(0.5, 1);
  await expect.poll(async () => Number(await num(page, 'y1').inputValue())).toBeCloseTo(0.75, 1);
  await page.mouse.move(from.x + 40, from.y - 40);
  await page.mouse.up();
  expect(await undoDepth(page)).toBe(d + 1);
  const [e] = await keys(page, 'opacity');
  expect(e.kind).toBe('bezier');
  expect(e.bezier![0]).toBeCloseTo(0.5, 1);
  expect(e.bezier![1]).toBeCloseTo(0.75, 1);
  expect(e.bezier!.slice(2)).toEqual([0.75, 0.75]);
  near(await opacityAt(page, 0.7), easeAt(e, await fractionAt(page, 0.7)), 2 / 255 + 0.005);
  expect(Math.abs((await opacityAt(page, 0.7)) - 0.25)).toBeGreaterThan(0.05); // not linear any more
  // Pressing a preset's handle without moving it leaves the preset alone (no step, no conversion to a custom curve).
  await page.getByTestId('ease-preset-easeIn').click();
  const d2 = await undoDepth(page);
  const h = (await handle(page, 1).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  expect(await undoDepth(page)).toBe(d2);
  expect((await keys(page, 'opacity'))[0].kind).toBe('easeIn');
});

test('numeric inputs commit on Enter and on blur, clamp, and an unchanged value adds no step', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  await num(page, 'x1').fill('0.3');
  expect(await undoDepth(page)).toBe(d); // typing alone commits nothing
  await num(page, 'x1').press('Enter');
  expect(await undoDepth(page)).toBe(d + 1);
  expect((await keys(page, 'opacity'))[0]).toEqual({ kind: 'bezier', bezier: [0.3, 0.25, 0.75, 0.75] });
  await num(page, 'y2').fill('1.5');
  await page.keyboard.press('Tab'); // blur
  expect(await undoDepth(page)).toBe(d + 2);
  expect((await keys(page, 'opacity'))[0].bezier).toEqual([0.3, 0.25, 0.75, 1.5]);
  await num(page, 'x2').fill('5');
  await num(page, 'x2').press('Enter');
  await expect(num(page, 'x2')).toHaveValue('1');
  await num(page, 'y1').fill('-3');
  await num(page, 'y1').press('Enter');
  expect((await keys(page, 'opacity'))[0].bezier).toEqual([0.3, -1, 1, 1.5]);
  expect(await undoDepth(page)).toBe(d + 4);
  await num(page, 'y1').fill('-1');
  await num(page, 'y1').press('Enter');
  await num(page, 'x1').fill('');
  await num(page, 'x1').press('Enter');
  await expect(num(page, 'x1')).toHaveValue('0.3');
  expect(await undoDepth(page)).toBe(d + 4);
});

test('arrow keys nudge a focused handle: one undo step per key release, not per auto-repeat', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  await page.getByTestId('ease-preset-bezier').click();
  const d = await undoDepth(page);
  const t0 = (await playerState(page)).playhead;
  await handle(page, 1).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  expect(await undoDepth(page)).toBe(d + 3);
  expect((await keys(page, 'opacity'))[0].bezier![0]).toBe(0.28);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowUp');
  expect(await undoDepth(page)).toBe(d + 3); // held: still a draft
  await expect(num(page, 'y1')).toHaveValue('0.28');
  await page.keyboard.up('ArrowUp');
  expect(await undoDepth(page)).toBe(d + 4);
  expect((await keys(page, 'opacity'))[0].bezier![1]).toBe(0.28);
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await keys(page, 'opacity'))[0].bezier![0]).toBe(0.18);
  expect((await playerState(page)).playhead).toBe(t0); // the arrows did not step the timeline
  await handle(page, 2).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect((await keys(page, 'opacity'))[0].bezier![2]).toBe(0.86);
});
