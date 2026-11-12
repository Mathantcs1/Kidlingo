// Plan 5 Task 6 fix round: a playhead move in the middle of a keyed on-canvas drag cancels the gesture; the release commits nothing.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { canvasBox, setupPip, toPage, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const projectJson = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));

test('moving the playhead mid-drag of a keyed clip cancels the drag: release leaves history unchanged', async ({ page }) => {
  await setupPip(page);
  await setTime(page, 0.5);
  await page.getByTestId('kf-toggle-scale').click();
  await expect(page.getByTestId('kf-toggle-scale')).toHaveAttribute('aria-pressed', 'true');
  const d = await undoDepth(page);
  const before = await projectJson(page);
  const b = await canvasBox(page);
  const from = toPage(b, { x: 960 + 150, y: 540 + 150 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 60, { steps: 6 });
  await setTime(page, 1);
  await page.mouse.move(from.x + 80, from.y + 80, { steps: 3 });
  await page.mouse.up();
  expect(await undoDepth(page)).toBe(d);
  expect(await projectJson(page)).toBe(before);
});
