// New-layer zones, edge cases: targets hidden under the sticky ruler / header column, the 8-track limit for clip
// drags, and OS files dropped outside the media bin.
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
  mediaItem,
  open,
  playerState,
  trackErrors,
  withAudio,
} from './helpers';

test.setTimeout(60_000);

/** The whole project plus the undo depth, for "nothing changed" checks. */
const snapshot = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const s = window.__clipforge!.getState();
    return JSON.stringify({ p: s.history.present, depth: s.history.past.length });
  });
const videoIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
const trackCount = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.present.tracks.length);

const zone = (page: Page, kind: 'video' | 'audio'): Locator => page.locator(`[data-testid="new-layer-zone"][data-kind="${kind}"]`);
const laneOf = (page: Page, id: string): Locator => page.locator(`[data-testid="timeline-lane"][data-track-id="${id}"]`);
const scroller = (page: Page): Locator => page.getByTestId('timeline-scroll');
const box = async (loc: Locator) => (await loc.boundingBox())!;

async function scrollTo(page: Page, left: number, top: number): Promise<void> {
  await scroller(page).evaluate((el, [l, t]) => el.scrollTo(l, t), [left, top]);
}

/** Presses on a clip, moves to (x, y) in steps and releases. */
async function dragClipTo(page: Page, clipId: string, x: number, y: number): Promise<void> {
  const from = await center(clipEl(page, clipId));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

/** Two video layers (clip on the top one) and the timeline taller than its panel. */
async function twoLayers(page: Page): Promise<string> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await page.getByTestId('btn-add-video-layer').click();
  await page.getByTestId('btn-add-audio-track').click();
  const [, v2] = await videoIds(page);
  await page.locator(`[data-testid="track-header"][data-track-id="${v2}"]`).getByTestId('track-name').click();
  await addToTimeline(page, 'with-audio.mp4', 1);
  const [scrollH, clientH] = await scroller(page).evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(scrollH).toBeGreaterThan(clientH + 20);
  return (await clipStates(page))[0].id;
}

test('a zone or lane hidden under the sticky ruler or header column is not a drop target', async ({ page }) => {
  const errors = trackErrors(page);
  const c = await twoLayers(page);

  // Scrolled down: the video zone is under the ruler. Releasing over the ruler changes nothing.
  await scrollTo(page, 0, 28);
  const ruler = await box(page.getByTestId('timeline-ruler'));
  const before = await snapshot(page);
  await dragClipTo(page, c, (await center(clipEl(page, c))).x + PPS, ruler.y + ruler.height / 2);
  expect(await snapshot(page)).toBe(before);
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  // Media from the bin released over the ruler: HTML5 drop goes to the topmost element (the ruler), not the zone.
  await mediaItem(page, 'with-audio.mp4').dragTo(page.getByTestId('timeline-ruler'), { targetPosition: { x: 2 * PPS, y: 12 } });
  expect(await snapshot(page)).toBe(before);

  // Scrolled sideways: v1's lane start is under the header column. Releasing over the header changes nothing.
  await page.getByTestId('btn-zoom-in').click();
  await page.getByTestId('btn-zoom-in').click();
  await scrollTo(page, 0, 0);
  const [v1] = await videoIds(page);
  const v1Lane = await box(laneOf(page, v1));
  await scrollTo(page, 150, 0);
  const headers = await box(page.locator('.track-headers'));
  const scrolled = await snapshot(page);
  await dragClipTo(page, c, headers.x + headers.width / 2, v1Lane.y + v1Lane.height / 2);
  expect(await snapshot(page)).toBe(scrolled);

  // Control: the same kind of drag released over the visible zone still creates a layer.
  await scrollTo(page, 0, 0);
  const vz = await box(zone(page, 'video'));
  const n = await trackCount(page);
  await dragClipTo(page, c, (await center(clipEl(page, c))).x, vz.y + vz.height / 2);
  expect(await trackCount(page)).toBe(n + 1);
  expect(errors).toEqual([]);
});

test('a clip dragged onto the video zone at the 8-layer limit is rejected with the limit toast', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio], 1);
  for (let i = 0; i < 7; i++) await page.getByTestId('btn-add-video-layer').click();
  await addToTimeline(page, 'with-audio.mp4', 1); // on the active (newest, top) layer
  await scrollTo(page, 0, 0);
  const [c] = await clipStates(page);
  const before = await snapshot(page);
  const vz = await box(zone(page, 'video'));
  const from = await center(clipEl(page, c.id));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + PPS, vz.y + vz.height / 2, { steps: 8 });
  await expect(zone(page, 'video').getByTestId('drag-ghost')).toHaveClass(/is-reject/);
  await expect(zone(page, 'video')).toHaveClass(/is-drop-reject/);
  await expect(zone(page, 'video')).toHaveAttribute('aria-label', 'At most 8 video tracks');
  await clearToasts(page);
  await page.mouse.up();
  await expectOnlyToast(page, 'At most 8 video tracks');
  expect(await snapshot(page)).toBe(before);
});

/** A real (trusted) OS file drag-and-drop at a page point, through the DevTools protocol. */
async function dropOsFile(page: Page, at: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [withAudio], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
    await cdp.send('Input.dispatchDragEvent', { type, x: at.x, y: at.y, data });
  }
  await cdp.detach();
}

test('an OS file dropped on the timeline neither leaves the app nor imports; on the media bin it imports', async ({ page }) => {
  await open(page);
  const url = page.url();
  for (const target of [zone(page, 'video'), page.getByTestId('timeline-lane').first(), page.getByTestId('timeline-ruler')]) {
    await dropOsFile(page, await center(target));
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
    await expect(page.getByTestId('media-item')).toHaveCount(0);
  }
  // A synthetic file drop on a zone is cancelled by the page (the browser would otherwise open the file).
  const prevented = await zone(page, 'video').evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.mp4', { type: 'video/mp4' }));
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(prevented).toBe(true);

  await dropOsFile(page, await center(page.getByRole('complementary', { name: 'Media bin' })));
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  expect(page.url()).toBe(url);
  expect((await playerState(page)).undoDepth).toBeGreaterThanOrEqual(0);
});
