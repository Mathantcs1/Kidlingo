// Pointer gestures stay sane: a clip drag ignores other pointers and ends quietly when its clip vanishes; a scrub
// cannot stick when pointer capture fails.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PPS, addToTimeline, center, clipEl, clipStates, importFiles, open, playerState, toast, trackErrors, withAudio } from './helpers';

async function oneClip(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
}

interface PointerInit {
  pointerId: number;
  button?: number;
  buttons?: number;
  clientX?: number;
  clientY?: number;
}

/** Dispatches a synthetic pointer event on the element matching `selector` (window when null) inside the page. */
function pointer(page: Page, type: string, init: PointerInit, selector: string | null): Promise<void> {
  return page.evaluate(
    ({ type, init, selector }) => {
      const target: EventTarget = selector ? document.querySelector(selector)! : window;
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, ...init }));
    },
    { type, init, selector },
  );
}

test('undo during a clip drag ends the drag quietly: no error toasts, nothing committed', async ({ page }) => {
  const errors = trackErrors(page);
  await oneClip(page);
  const [clip] = await clipStates(page);
  const from = await center(clipEl(page, clip.id));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y, { steps: 4 });
  await expect(page.getByTestId('drag-ghost')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z'); // undoes "add to timeline": the dragged clip vanishes
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await page.mouse.move(from.x + 90, from.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await expect(toast(page)).toHaveCount(0);
  expect((await playerState(page)).undoDepth).toBe(1); // only the import is left
  await page.getByTestId('btn-redo').click();
  expect(await clipStates(page)).toEqual([clip]);
  expect(errors).toEqual([]);
});

test('a clip drag ignores the release and cancel of another pointer and commits on its own release', async ({ page }) => {
  await oneClip(page);
  const [clip] = await clipStates(page);
  const from = await center(clipEl(page, clip.id));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + PPS, from.y, { steps: 6 });
  await expect(page.getByTestId('drag-ghost')).toHaveCount(1);

  await pointer(page, 'pointerup', { pointerId: 99, clientX: from.x + PPS, clientY: from.y }, null);
  await pointer(page, 'pointercancel', { pointerId: 99 }, null);
  await expect(page.getByTestId('drag-ghost')).toHaveCount(1);
  expect(await clipStates(page)).toEqual([clip]);

  await page.mouse.up();
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  const [moved] = await clipStates(page);
  expect(moved.start).toBeGreaterThan(0.8);
  expect(moved.start).toBeLessThan(1.2);
});

test('a scrub whose pointer capture failed ends when a move arrives with the button up', async ({ page }) => {
  await oneClip(page);
  const ruler = page.getByTestId('timeline-ruler');
  const box = (await ruler.boundingBox())!;
  const y = box.y + 8;
  // A synthetic pointer id is not an active pointer, so setPointerCapture throws (the failure being simulated).
  await pointer(page, 'pointerdown', { pointerId: 7, button: 0, buttons: 1, clientX: box.x + PPS, clientY: y }, '[data-testid="timeline-ruler"]');
  expect((await playerState(page)).playhead).toBeCloseTo(1, 1);
  // The release happened elsewhere; the next move over the ruler has no button down: the scrub is over.
  await pointer(page, 'pointermove', { pointerId: 7, buttons: 0, clientX: box.x + 2 * PPS, clientY: y }, '[data-testid="timeline-ruler"]');
  await pointer(page, 'pointermove', { pointerId: 7, buttons: 1, clientX: box.x + 2.5 * PPS, clientY: y }, '[data-testid="timeline-ruler"]');
  expect((await playerState(page)).playhead).toBeCloseTo(1, 1);
});
