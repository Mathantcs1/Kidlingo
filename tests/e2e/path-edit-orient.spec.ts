// Plan 5B Task 8: orient along path from the inspector (kf-orient) and the handles during a live drag of an oriented,
// position-keyed clip (5B M4: they turn with the heading the release will give, not the old one).
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isRed, isYellow, setupPip, undoDepth } from './pip-helpers';
import { C, keyPip, pageAt, pipClip, pressAndMove } from './path-edit-helpers';

test.setTimeout(90_000);

test('orient along path turns the picture with a diagonal path (ONE step); off keeps the frame (heading baked)', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split'); // 300×100: red left half, yellow right half
  await keyPip(page, [{ t: 0, x: -300, y: -200 }, { t: 1.6, x: 300, y: 200 }], 0.8); // centre (0, 0) at 0.8 s
  const h = Math.atan2(400, 600);
  const along = (d: number) => ({ x: C.x + Math.round(d * Math.cos(h)), y: C.y + Math.round(d * Math.sin(h)) });
  await expectPixel(page, along(130).x, along(130).y, isBlue, 'unrotated: outside the picture');
  const toggle = page.getByTestId('kf-orient');
  await expect(toggle).not.toBeChecked();
  const depth = await undoDepth(page);
  await toggle.check();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  expect((await pipClip(page)).keys!.orient).toBe(true);
  await expectPixel(page, along(130).x, along(130).y, isYellow, 'oriented: right end along the heading');
  await expectPixel(page, along(-130).x, along(-130).y, isRed, 'oriented: left end behind');
  await expect(page.getByTestId('inspector-rotation')).toHaveValue('33.69');
  await toggle.uncheck();
  await expect.poll(() => undoDepth(page)).toBe(depth + 2);
  const clip = await pipClip(page);
  expect(clip.keys!.orient).toBeUndefined();
  expect(clip.transform.rotation).toBeCloseTo((h * 180) / Math.PI, 6); // baked at the playhead
  await expectPixel(page, along(130).x, along(130).y, isYellow, 'off: the frame at the playhead is kept');
  expect(errors).toEqual([]);
});

/** The angle (degrees, clockwise) of the overlay quad's top edge in page px. */
function topEdgeAngle(points: string): number {
  const [a, b] = points.trim().split(' ').map((s) => s.split(',').map(Number));
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

test('a live body drag of an oriented clip turns the handles with the new heading (as the release will)', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, [{ t: 0, x: -300, y: 0 }, { t: 1.6, x: 300, y: 0 }], 0.8);
  await page.getByTestId('kf-orient').check();
  const body = page.getByTestId('overlay-body');
  expect(Math.abs(topEdgeAngle((await body.getAttribute('points'))!))).toBeLessThan(1); // heading 0 on a level path
  // Drag the clip at 0.8 s down to (0, 300): a key there bends the path, so the heading at 0.8 s turns by 45 degrees.
  await pressAndMove(page, await pageAt(page, 0, 0), await pageAt(page, 0, 300));
  await expect.poll(async () => Math.abs(topEdgeAngle((await body.getAttribute('points'))!))).toBeGreaterThan(40);
  const live = topEdgeAngle((await body.getAttribute('points'))!);
  expect(Math.abs(Math.abs(live) - 45)).toBeLessThan(2);
  await page.mouse.up();
  await expect.poll(async () => (await pipClip(page)).keys!.position!.length).toBe(3);
  await expect.poll(async () => Math.abs(topEdgeAngle((await body.getAttribute('points'))!) - live)).toBeLessThan(1); // the release keeps it
});
