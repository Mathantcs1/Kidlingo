// Track headers, review round 1: dialogs cover the headers, keyboard use (Space on focused controls, rename with
// Enter/F2, IME), the active track on focus, locked-lane drag feedback, the solo live region and scroll-into-view.
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  PPS,
  addToTimeline,
  center,
  clearToasts,
  clipEl,
  clipStates,
  expectOnlyToast,
  importFiles,
  open,
  playerState,
  withAudio,
} from './helpers';

test.setTimeout(60_000);

const header = (page: Page, id: string): Locator => page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);
const laneOf = (page: Page, id: string): Locator => page.locator(`[data-testid="timeline-lane"][data-track-id="${id}"]`);
const trackIds = (page: Page, kind: string): Promise<string[]> =>
  page.evaluate((kind) => window.__clipforge!.getState().history.present.tracks.filter((t) => t.kind === kind).map((t) => t.id), kind);
const activeTrack = (page: Page): Promise<string | null> => page.evaluate(() => window.__clipforge!.getState().activeTrackId);
const activeTestId = (page: Page): Promise<string | null> => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

const expectLockToast = (page: Page): Promise<void> => expectOnlyToast(page, 'Track is locked');

/**
 * Class names of the elements painted at a point, topmost first. The editor is `inert` behind a modal, which also
 * hides it from hit testing, so `inert` is lifted just for the measurement (it does not change painting order).
 */
function stackAt(page: Page, p: { x: number; y: number }): Promise<string[]> {
  return page.evaluate(({ x, y }) => {
    const inert = [...document.querySelectorAll<HTMLElement>('[inert]')];
    for (const el of inert) el.inert = false;
    try {
      return document.elementsFromPoint(x, y).map((e) => e.className.toString());
    } finally {
      for (const el of inert) el.inert = true;
    }
  }, p);
}

async function expectCovered(page: Page, id: string): Promise<void> {
  const stack = await stackAt(page, await center(header(page, id)));
  const backdrop = stack.findIndex((c) => c.split(' ').includes('modal-backdrop'));
  const headers = stack.findIndex((c) => c.split(' ').includes('track-headers'));
  expect(backdrop, stack.join(' | ')).toBeGreaterThanOrEqual(0);
  expect(headers, stack.join(' | ')).toBeGreaterThan(backdrop);
}

test('dialogs cover the track headers', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await page.getByTestId('btn-add-video-layer').click();
  const [, v2] = await trackIds(page, 'video');
  await addToTimeline(page, 'with-audio.mp4', 1);
  await header(page, v2).getByTestId('track-btn-remove').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await expectCovered(page, v2);
  await page.getByTestId('btn-confirm-cancel').click();
  await page.getByTestId('btn-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await expectCovered(page, v2);
});

test('Space presses a keyboard-focused header button, but plays when a button was clicked or nothing is focused', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [v] = await trackIds(page, 'video');
  const h = header(page, v);
  // (a) Tab to Solo, press Space: it toggles and playback does not start.
  await h.getByTestId('track-btn-mute').focus();
  await page.keyboard.press('Tab');
  await expect(h.getByTestId('track-btn-solo')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(h.getByTestId('track-btn-solo')).toHaveAttribute('aria-pressed', 'true');
  expect((await playerState(page)).playing).toBe(false);
  await page.keyboard.press('Space');
  await expect(h.getByTestId('track-btn-solo')).toHaveAttribute('aria-pressed', 'false');
  expect((await playerState(page)).playing).toBe(false);

  // (b) A button focused by a mouse click: Space plays/pauses and does not press the button again.
  const level = page.locator('.zoom-level');
  await page.getByTestId('btn-zoom-in').click();
  const zoomed = await level.textContent();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(true);
  await expect(level).toHaveText(zoomed!);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(false);
  await expect(level).toHaveText(zoomed!);

  // (d) Nothing focused: Space plays and pauses.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await playerState(page)).playing).toBe(false);

  // (c) Space in a text field types a space.
  await h.getByTestId('track-name').dblclick();
  await h.getByTestId('track-name-input').fill('');
  await h.getByTestId('track-name-input').pressSequentially('a b');
  await expect(h.getByTestId('track-name-input')).toHaveValue('a b');
  expect((await playerState(page)).playing).toBe(false);
});

test('the track name is reachable by keyboard: focus makes the track active, Enter/F2 edit, focus returns', async ({ page }) => {
  await open(page);
  const [v] = await trackIds(page, 'video');
  const h = header(page, v);
  await page.getByTestId('btn-zoom-in').focus();
  await page.keyboard.press('Tab');
  await expect(h.getByTestId('track-name')).toBeFocused();
  expect(await activeTrack(page)).toBe(v);
  await expect(h).toHaveAttribute('data-active', 'true');

  const depth = (await playerState(page)).undoDepth;
  await page.keyboard.press('Enter');
  const input = h.getByTestId('track-name-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('maxlength', '40');
  await input.fill('x'.repeat(50));
  await expect(input).toHaveValue('x'.repeat(40));
  await input.fill('Main');
  // An Enter that ends an IME composition does not commit.
  await input.evaluate((el) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true })),
  );
  await expect(input).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(h.getByTestId('track-name')).toHaveText('Main');
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  expect(await activeTestId(page)).toBe('track-name');

  await page.keyboard.press('F2');
  await expect(h.getByTestId('track-name-input')).toBeFocused();
  await h.getByTestId('track-name-input').fill('Other');
  await page.keyboard.press('Escape');
  await expect(h.getByTestId('track-name')).toHaveText('Main');
  expect(await activeTestId(page)).toBe('track-name');
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
});

test('clicking a header button keeps the active track; clicking the header body changes it', async ({ page }) => {
  await open(page);
  await page.getByTestId('btn-add-video-layer').click();
  const [v1, v2] = await trackIds(page, 'video');
  expect(await activeTrack(page)).toBe(v2);
  await header(page, v1).getByTestId('track-btn-mute').click();
  expect(await activeTrack(page)).toBe(v2);
  const box = (await header(page, v1).boundingBox())!;
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 8); // header body, right of the flag buttons
  expect(await activeTrack(page)).toBe(v1);
});

test('a new layer added while scrolled down is scrolled into view', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 5; i++) await page.getByTestId('btn-add-video-layer').click();
  const scroller = page.getByTestId('timeline-scroll');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByTestId('btn-add-video-layer').click();
  const id = (await activeTrack(page))!;
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const box = (await scroller.boundingBox())!;
  for (const loc of [header(page, id), laneOf(page, id)]) {
    const b = (await loc.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(ruler.y + ruler.height - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 1);
  }
});

test('dragging a clip over a locked lane shows a rejected ghost; the drop and a trim on a locked track are refused', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  const [v1] = await trackIds(page, 'video');
  await addToTimeline(page, 'with-audio.mp4', 1); // on v1
  await page.getByTestId('btn-add-video-layer').click();
  const [, v2] = await trackIds(page, 'video');
  await header(page, v2).getByTestId('track-btn-lock').click();
  const [c] = await clipStates(page);
  const before = await clipStates(page);
  const depth = (await playerState(page)).undoDepth;

  const from = await center(clipEl(page, c.id));
  const target = (await laneOf(page, v2).boundingBox())!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + PPS, target.y + target.height / 2, { steps: 8 });
  const ghost = page.getByTestId('drag-ghost');
  await expect(ghost).toHaveClass(/is-reject/);
  await expect(laneOf(page, v2).getByTestId('drag-ghost')).toHaveCount(1);
  // Back over its own unlocked lane the ghost is fine again.
  await page.mouse.move(from.x + PPS, from.y, { steps: 4 });
  await expect(ghost).not.toHaveClass(/is-reject/);
  await page.mouse.move(from.x + PPS, target.y + target.height / 2, { steps: 4 });
  await clearToasts(page);
  await page.mouse.up();
  await expectLockToast(page);
  expect(await clipStates(page)).toEqual(before);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // A trim on a locked track: the ghost is rejected and the trim is refused.
  await header(page, v2).getByTestId('track-btn-lock').click();
  await header(page, v1).getByTestId('track-btn-lock').click();
  const locked = await clipStates(page);
  const lockedDepth = (await playerState(page)).undoDepth;
  await clearToasts(page);
  const end = await center(clipEl(page, c.id).getByTestId('trim-end'));
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x - PPS, end.y, { steps: 6 });
  await expect(page.getByTestId('drag-ghost')).toHaveClass(/is-reject/);
  await page.mouse.up();
  await expectLockToast(page);
  expect(await clipStates(page)).toEqual(locked);
  expect((await playerState(page)).undoDepth).toBe(lockedDepth);
});

test('the solo state is announced through a live region that is always present', async ({ page }) => {
  await open(page);
  const [a] = await trackIds(page, 'audio');
  const status = page.getByTestId('solo-status');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveText('');
  await header(page, a).getByTestId('track-btn-solo').click();
  await expect(status).toHaveText(/Solo on/);
  await expect(page.getByTestId('solo-indicator')).toBeVisible();
  await header(page, a).getByTestId('track-btn-solo').click();
  await expect(status).toHaveText('');
  await expect(page.getByTestId('solo-indicator')).toHaveCount(0);
});
