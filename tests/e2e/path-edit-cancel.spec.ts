// Plan 5B Task 8 (fix round 1): a path dot drag ends cleanly with NO history change when the pointer is cancelled,
// the window blurs, or the layer is locked mid-drag (the preview stops moving and the release commits nothing).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isGreen, setupPip, undoDepth } from './pip-helpers';
import { C, centreOf, dots, keyPip, pageAt, playhead, pressAndMove, projectJson } from './path-edit-helpers';

test.setTimeout(90_000);

const KEYS = [{ t: 0, x: -400, y: -200 }, { t: 0.8, x: 0, y: 200 }, { t: 1.6, x: 400, y: -200 }];

/** Starts a drag of the last key dot towards (400, 200) and checks the live preview moved. */
async function startDrag(page: Page) {
  await setupPip(page);
  await keyPip(page, KEYS, 1);
  const depth = await undoDepth(page);
  const json = await projectJson(page);
  const was = await centreOf(dots(page).nth(2));
  await pressAndMove(page, was, await pageAt(page, 400, 200));
  await expectPixel(page, C.x + 100, C.y + 290, isGreen, 'live drag preview');
  return { depth, json, was };
}

async function expectBack(page: Page, s: { depth: number; json: string; was: { x: number; y: number } }) {
  await expectPixel(page, C.x + 100, C.y + 10, isGreen, 'preview back at the stored position');
  await expectPixel(page, C.x + 100, C.y + 290, isBlue, 'nothing left at the dragged position');
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await undoDepth(page)).toBe(s.depth);
  expect(await projectJson(page)).toBe(s.json);
  expect(await playhead(page)).toBeCloseTo(1, 6);
  const now = await centreOf(dots(page).nth(2));
  expect(Math.hypot(now.x - s.was.x, now.y - s.was.y)).toBeLessThan(1.5);
}

test('pointercancel mid dot drag: no history change, the preview and the dot go back', async ({ page }) => {
  const errors = trackErrors(page);
  const s = await startDrag(page);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await expectBack(page, s);
  expect(errors).toEqual([]);
});

test('window blur mid dot drag: no history change, the preview and the dot go back', async ({ page }) => {
  const errors = trackErrors(page);
  const s = await startDrag(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expectBack(page, s);
  expect(errors).toEqual([]);
});

test('the layer locked mid dot drag ends it: the preview stops, the release commits nothing and shows no toast', async ({ page }) => {
  const errors = trackErrors(page);
  const s = await startDrag(page);
  await page.evaluate(() => {
    window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, locked: true } : t)) }));
  });
  // The lock itself is one history step; the drag adds none (project JSON after the lock stays unchanged).
  await expectBack(page, { ...s, depth: s.depth + 1, json: await projectJson(page) });
  await expect(page.getByTestId('error-toast')).toHaveCount(0);
  const json = JSON.parse(await projectJson(page));
  expect(json.tracks.find((t: { id: string }) => t.id === 'v2').locked).toBe(true);
  expect(errors).toEqual([]);
});
