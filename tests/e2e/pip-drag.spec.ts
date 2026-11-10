// Robustness of an on-canvas transform drag: other edits during it, the click threshold, a lost pointerup, and
// Space while dragging.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { toast, trackErrors } from './helpers';
import { canvasBox, dragTo, holding, setupPip, toPage, transformOf, undoDepth } from './pip-helpers';
import type { Pt } from './pip-helpers';

test.setTimeout(60_000);

const C = { x: 960, y: 540 };
const overlay = (page: Page) => page.getByTestId('transform-overlay');

async function press(page: Page, from: Pt, by: Pt): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 4 });
}

/** Applies an edit through the store, as another part of the UI would. */
function applyEdit(page: Page, kind: 'renameTrack' | 'addMedia' | 'ownOpacity'): Promise<void> {
  return page.evaluate((kind) => {
    window.__clipforge!.getState().apply((p) => {
      if (kind === 'renameTrack') return { ...p, tracks: p.tracks.map((t) => (t.id === 'v1' ? { ...t, name: 'Backdrop' } : t)) };
      if (kind === 'addMedia') {
        const m = { id: 'extra', name: 'extra.png', kind: 'image' as const, duration: 5, width: 10, height: 10, hasAudio: false };
        return { ...p, media: { ...p.media, extra: m } };
      }
      return {
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, transform: { ...c.transform, opacity: 0.5 } } : c)),
        })),
      };
    });
  }, kind);
}

test('an unrelated edit during a drag does not end it: the drag still commits once', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  for (const kind of ['renameTrack', 'addMedia'] as const) {
    const before = await transformOf(page, 'pip');
    const depth = await undoDepth(page);
    await holding(page, 'Alt', async () => {
      await press(page, from, { x: 60, y: 30 });
      await applyEdit(page, kind);
      await page.mouse.move(from.x + 90, from.y + 45, { steps: 2 });
      await page.mouse.up();
    });
    const t = await transformOf(page, 'pip');
    expect(Math.abs(t.x - before.x - 90 / b.s), kind).toBeLessThanOrEqual(2);
    expect(Math.abs(t.y - before.y - 45 / b.s), kind).toBeLessThanOrEqual(2);
    expect(await undoDepth(page), kind).toBe(depth + 2);
    // Back to the centre for the next round (undo the transform and the edit).
    await page.getByTestId('btn-undo').click();
    await page.getByTestId('btn-undo').click();
  }
  expect(errors).toEqual([]);
});

test("an edit of the clip's own transform during a drag ends it quietly", async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  const depth = await undoDepth(page);
  await press(page, from, { x: 60, y: 30 });
  await applyEdit(page, 'ownOpacity');
  await page.mouse.move(from.x + 90, from.y + 45, { steps: 2 });
  await page.mouse.up();
  expect(await transformOf(page, 'pip')).toEqual({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.5 });
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(toast(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a press that moves less than the drag threshold is a click: nothing changes', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const before = await transformOf(page, 'pip');
  const depth = await undoDepth(page);
  const body = toPage(b, { x: C.x + 30, y: C.y + 20 });
  const corner = toPage(b, { x: C.x + 100, y: C.y + 100 });
  for (const from of [body, corner]) {
    await dragTo(page, from, { x: from.x + 2, y: from.y + 1 }, { steps: 2 });
    expect(await transformOf(page, 'pip')).toEqual(before);
    expect(await undoDepth(page)).toBe(depth);
  }
  // 6 px is a drag (with Alt, so it is not snapped back to the centre).
  await holding(page, 'Alt', () => dragTo(page, body, { x: body.x + 6, y: body.y }, { steps: 3 }));
  const t = await transformOf(page, 'pip');
  expect(Math.abs(t.x - 6 / b.s)).toBeLessThanOrEqual(1);
  expect(t.y).toBe(0);
  expect(await undoDepth(page)).toBe(depth + 1);
  expect(errors).toEqual([]);
});

test('a drag whose button was released elsewhere (no pointerup, or the window lost focus) is cancelled', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  const before = await transformOf(page, 'pip');
  const depth = await undoDepth(page);
  for (const lose of ['buttons-up', 'blur'] as const) {
    await press(page, from, { x: 60, y: 30 });
    await page.evaluate(({ lose, x, y }) => {
      if (lose === 'blur') window.dispatchEvent(new Event('blur'));
      else window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: x, clientY: y }));
    }, { lose, x: from.x + 80, y: from.y + 40 });
    await page.mouse.move(from.x + 100, from.y + 50, { steps: 2 });
    await page.mouse.up();
    expect(await transformOf(page, 'pip'), lose).toEqual(before);
    expect(await undoDepth(page), lose).toBe(depth);
  }
  expect(errors).toEqual([]);
});

test('Space during a drag neither starts playback nor ends the drag', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const b = await canvasBox(page);
  const from = toPage(b, C);
  const depth = await undoDepth(page);
  // No modifier held (Alt would turn the Space shortcut off by itself); the end position is far from any snap line.
  await press(page, from, { x: 60, y: 30 });
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__clipforge!.getState().playing)).toBe(false);
  await expect(overlay(page)).toBeVisible();
  await page.mouse.move(from.x + 90, from.y + 45, { steps: 2 });
  await page.mouse.up();
  expect(Math.abs((await transformOf(page, 'pip')).x - 90 / b.s)).toBeLessThanOrEqual(2);
  expect(await undoDepth(page)).toBe(depth + 1);
  // Afterwards Space plays again as usual.
  await page.keyboard.press(' ');
  await expect.poll(() => page.evaluate(() => window.__clipforge!.getState().playing)).toBe(true);
  expect(errors).toEqual([]);
});
