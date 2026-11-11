// Shared setup for the effects UI specs (Plan 4 Task 10): one image clip selected, effects read from the store.
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, playerState } from './helpers';
import { solidPng } from './lut-helpers';
import type { VideoEffect } from '../../src/core/model';

export const f = (page: Page, id: string): Locator => page.getByTestId(id);
export const depth = async (page: Page): Promise<number> => (await playerState(page)).undoDepth;

/** Opens the editor with a solid 0x3080C0 image clip on the timeline, selected (inspector shows its effects). */
export async function setupImage(page: Page, name = 'blue.png', hex = '0x3080C0'): Promise<string> {
  await open(page);
  await importFiles(page, [solidPng(name, hex)], 1);
  await addToTimeline(page, name, 1);
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  await expect(f(page, 'fx-add')).toBeVisible();
  return c.id;
}

export const effects = (page: Page): Promise<VideoEffect[]> =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips)[0].effects);

/** Chooses an effect type in the add menu and clicks Add; returns the new effect's id. */
export async function addEffect(page: Page, type: string): Promise<string> {
  const n = (await effects(page)).length;
  await f(page, 'fx-add').selectOption(type);
  await f(page, 'fx-add-button').click();
  await expect.poll(async () => (await effects(page)).length).toBe(n + 1);
  return (await effects(page))[n].id;
}

/** Drags a range input from its centre to `frac` (0..1) of its width: many input events, one release. */
export async function dragSlider(page: Page, slider: Locator, frac: number): Promise<void> {
  const b = (await slider.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * (0.5 + (frac - 0.5) / 2), b.y + b.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width * frac, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}
