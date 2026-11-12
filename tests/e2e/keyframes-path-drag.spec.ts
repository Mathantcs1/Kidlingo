// Plan 5 Task 10 (fix round 1): key dots near the displayed clip centre let the press through, and the transform handles
// keep their DOM identity when the motion path appears or disappears.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { canvasBox, setupPip, toPage, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const C = { x: 960, y: 540 };
type K = { t: number; x: number; y: number };
const playhead = (page: Page) => page.evaluate(() => window.__clipforge!.getState().playhead);
const pipKeys = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.keys?.position ?? []);

async function keyPip(page: Page, keys: K[], at: number): Promise<void> {
  await page.evaluate(({ keys, at }) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === 'v2' ? { ...t, clips: t.clips.map((c) => ({ ...c, keys: { position: keys.map((k) => ({ ...k, ease: { kind: 'linear' as const } })) } })) } : t,
      ),
    }));
    s.select(['pip']);
    s.setPlayhead(at);
  }, { keys, at });
}

async function pressCentreAndDrag(page: Page): Promise<void> {
  const b = await canvasBox(page);
  const t = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.transform);
  const from = toPage(b, { x: C.x + t.x, y: C.y + t.y });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 40, { steps: 6 });
  await page.mouse.up();
}

test('a key dot a hair from the clip centre (playhead just off the key) does not steal the press: it drags the clip', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyPip(page, [{ t: 0, x: 0, y: 0 }, { t: 1, x: 100, y: 0 }], 0.01);
  await expect(page.getByTestId('motion-key')).toHaveCount(2);
  await expect(page.getByTestId('motion-key').nth(0)).toHaveAttribute('data-through', 'true');
  await expect(page.getByTestId('motion-key').nth(1)).not.toHaveAttribute('data-through', 'true');
  const depth = await undoDepth(page);
  await pressCentreAndDrag(page);
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  expect(await playhead(page)).toBeCloseTo(0.01, 6); // no seek to key 0
  // The playhead (0.01 s) is within a frame of key 0, so that key takes the edit: the clip moved down 40 page px there.
  const keys = await pipKeys(page);
  expect(keys).toHaveLength(2);
  const moved = 40 / (await canvasBox(page)).s; // 40 page px in format px
  expect(keys[0].y).toBeGreaterThan(moved - 5);
  expect(keys[0].y).toBeLessThan(moved + 5);
  expect(errors).toEqual([]);
});

test('two keys at the same position (a pause) cannot swallow a press on the clip centre', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyPip(page, [{ t: 0, x: 0, y: 0 }, { t: 1, x: 0, y: 0 }], 0.5);
  await expect(page.getByTestId('motion-key')).toHaveCount(2);
  const depth = await undoDepth(page);
  await pressCentreAndDrag(page);
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  expect(await playhead(page)).toBeCloseTo(0.5, 6);
  expect(errors).toEqual([]);
});

test('the transform handles are not remounted when the first position key is added or undone', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await page.evaluate(() => { const s = window.__clipforge!.getState(); s.select(['pip']); s.setPlayhead(1); });
  const overlay = page.getByTestId('transform-overlay');
  await expect(overlay).toHaveCount(1);
  await expect(page.getByTestId('motion-key')).toHaveCount(0);
  const tag = (name: string) => page.evaluate((n) => { (window as unknown as Record<string, unknown>)[n] = document.querySelector('[data-testid="transform-overlay"]'); }, name);
  const same = (name: string) =>
    page.evaluate((n) => (window as unknown as Record<string, unknown>)[n] === document.querySelector('[data-testid="transform-overlay"]'), name);
  await tag('__quad');
  await page.evaluate(() => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === 'v2' ? { ...t, clips: t.clips.map((c) => ({ ...c, keys: { position: [{ t: 1, x: 0, y: 0, ease: { kind: 'linear' as const } }] } })) } : t)),
    }));
  });
  await expect(page.getByTestId('motion-key')).toHaveCount(1);
  expect(await same('__quad')).toBe(true);
  await page.evaluate(() => window.__clipforge!.getState().undo());
  await expect(page.getByTestId('motion-key')).toHaveCount(0);
  expect(await same('__quad')).toBe(true);
  expect(errors).toEqual([]);
});
