// Plan 5B Task 7: the timeline bands of a preset stack (widths proportional to the windows; never take a clip drag
// or trim) and the motion ghost on the preview (D3, Ruling P5B-7: an outline where a preset draws the picture while
// the handles stay at rest; a click on it selects the clip; drags still edit the rest transform).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ClipMotion } from '../../src/core/motionTypes';
import { trackErrors } from './helpers';
import { canvasBox, dragTo, holding, setupPip, toPage, transformOf, undoDepth } from './pip-helpers';
import { clipJson, depth, setupOverlay } from './presets-ui-helpers';

test.setTimeout(60_000);

const setMotion = (page: Page, id: string, motion: ClipMotion): Promise<void> =>
  page.evaluate(({ id, motion }) => window.__clipforge!.getState().apply((p) => ({
    ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, motion } : c)) })),
  })), { id, motion });

const lin = { kind: 'linear' as const };
const clipEl = (page: Page, id: string) => page.locator(`[data-testid="timeline-clip"][data-clip-id="${id}"]`);

test('bands: widths and places proportional to the windows; presses go through to the clip (drag, trim)', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await setMotion(page, 'st', {
    in: { preset: 'fade', duration: 0.5, delay: 0.5, ease: lin, params: {} },
    out: { preset: 'fade', duration: 1, delay: 0, ease: lin, params: {} },
    emphasis: { preset: 'pulse', duration: 0.6, delay: 0, ease: lin, params: { intensity: 0.15 }, at: 2 },
    loop: { preset: 'breathe', duration: 3, delay: 0, ease: lin, params: { intensity: 0.05 }, phase: 0, count: null },
  });
  const c = (await clipEl(page, 'st').boundingBox())!;
  const W = c.width / 4; // px per second (the clip is 4 s)
  const rel = async (id: string) => {
    const b = (await page.getByTestId(id).boundingBox())!;
    return { left: b.x - c.x, width: b.width };
  };
  const inb = await rel('motion-band-in');
  expect(Math.abs(inb.left - 0.5 * W)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(inb.width - 0.5 * W)).toBeLessThanOrEqual(1.5);
  const out = await rel('motion-band-out');
  expect(Math.abs(out.left - 3 * W)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(out.width - 1 * W)).toBeLessThanOrEqual(1.5);
  const em = await rel('motion-band-emphasis');
  expect(Math.abs(em.left - 2 * W)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(em.width - 0.6 * W)).toBeLessThanOrEqual(1.5);
  await expect(page.getByTestId('motion-band-loop')).toBeVisible();
  // Points on the bands (clear of the clip's name) hit the clip itself, never a band.
  const mid = { x: c.x + 0.75 * W, y: c.y + c.height / 2 };
  for (const pt of [{ x: c.x + 0.75 * W, y: c.y + 4 }, { x: c.x + 3.5 * W, y: c.y + c.height / 2 }, { x: c.x + 2.3 * W, y: c.y + c.height - 2 }]) {
    expect(await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return !el?.closest('.motion-bands') && el?.closest('[data-testid="timeline-clip"]')?.getAttribute('data-clip-id');
    }, pt)).toBe('st');
  }
  // A body drag starting on the entrance band moves the clip (one step).
  const d = await depth(page);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + W, mid.y, { steps: 8 });
  await page.mouse.up();
  expect(await depth(page)).toBe(d + 1);
  expect((await clipJson(page, 'st')).start).toBeGreaterThan(0.5);
  // A trim on the end handle (over the exit band) trims (one step).
  const c2 = (await clipEl(page, 'st').boundingBox())!;
  const end = { x: c2.x + c2.width - 2, y: c2.y + c2.height / 2 };
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x - W, end.y, { steps: 8 });
  await page.mouse.up();
  expect(await depth(page)).toBe(d + 2);
  expect((await clipJson(page, 'st')).out).toBeLessThan(3.9);
  expect(errors).toEqual([]);
});

test('motion ghost: outline at a Slide In first frame, none at rest; a click on it selects; drags edit the rest', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await setMotion(page, 'pip', { in: { preset: 'slide', duration: 1, delay: 0, ease: lin, params: { direction: 0, distance: 0.25 } } });
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0));
  const b = await canvasBox(page);
  const ghost = page.getByTestId('motion-ghost');
  await expect(ghost).toHaveCount(1);
  const g = (await ghost.boundingBox())!;
  const centre = toPage(b, { x: 960 - 480, y: 540 });
  expect(Math.abs(g.x + g.width / 2 - centre.x)).toBeLessThanOrEqual(2);
  const body = (await page.getByTestId('overlay-body').boundingBox())!;
  expect(Math.abs(g.width - body.width), `ghost ${g.width} vs handles ${body.width}`).toBeLessThanOrEqual(1);
  // At rest (after the window) there is no ghost.
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(1.5));
  await expect(ghost).toHaveCount(0);
  // Deselect; a click on the drawn picture selects the clip (no history).
  await page.evaluate(() => { const s = window.__clipforge!.getState(); s.select([]); s.setPlayhead(0); });
  const d = await undoDepth(page);
  await page.mouse.click(centre.x, centre.y);
  await expect.poll(() => page.evaluate(() => window.__clipforge!.getState().selection)).toEqual(['pip']);
  expect(await undoDepth(page)).toBe(d);
  await expect(ghost).toHaveCount(1);
  // A drag that starts on the ghost (away from the handles) edits nothing.
  const before = await transformOf(page, 'pip');
  await dragTo(page, centre, { x: centre.x + 60, y: centre.y + 40 });
  expect(await transformOf(page, 'pip')).toEqual(before);
  expect(await undoDepth(page)).toBe(d);
  // A drag on the rest box (the handles) moves the REST transform, one step; the ghost follows.
  const rest = toPage(b, { x: 960, y: 540 });
  await holding(page, 'Alt', () => dragTo(page, rest, { x: rest.x + 100, y: rest.y }));
  const t = await transformOf(page, 'pip');
  expect(Math.abs(t.x - 100 / b.s)).toBeLessThanOrEqual(2);
  expect(await undoDepth(page)).toBe(d + 1);
  await expect.poll(async () => { const n = (await ghost.boundingBox())!; return Math.abs(n.x + n.width / 2 - (centre.x + 100)); }).toBeLessThanOrEqual(3);
  // A click on empty canvas (no ghost there) keeps the selection.
  await page.mouse.click(toPage(b, { x: 1700, y: 100 }).x, toPage(b, { x: 1700, y: 100 }).y);
  expect(await page.evaluate(() => window.__clipforge!.getState().selection)).toEqual(['pip']);
  expect(errors).toEqual([]);
});
