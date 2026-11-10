// Track headers: add, remove, rename, reorder, mute/solo/lock/hide, the active track and the layer-ordered timeline.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  PPS,
  addToTimeline,
  center,
  clipEl,
  clipStates,
  drag,
  importFiles,
  mediaItem,
  noAudio,
  open,
  playerState,
  toast,
  tone,
  trackErrors,
  withAudio,
} from './helpers';

test.setTimeout(60_000);

interface TrackInfo {
  id: string;
  kind: string;
  name: string;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  clips: number;
}

function tracks(page: Page): Promise<TrackInfo[]> {
  return page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks.map((t) => ({
      id: t.id,
      kind: t.kind,
      name: t.name,
      hidden: t.hidden,
      muted: t.muted,
      solo: t.solo,
      locked: t.locked,
      clips: t.clips.length,
    })),
  );
}

const activeTrack = (page: Page): Promise<string | null> =>
  page.evaluate(() => window.__clipforge!.getState().activeTrackId);

const header = (page: Page, id: string): Locator => page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);
const laneOf = (page: Page, id: string): Locator => page.locator(`[data-testid="timeline-lane"][data-track-id="${id}"]`);
const top = async (loc: Locator): Promise<number> => (await loc.boundingBox())!.y;

async function videoIds(page: Page): Promise<string[]> {
  return (await tracks(page)).filter((t) => t.kind === 'video').map((t) => t.id);
}

test('the default project shows one video and one audio header with their controls', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const headers = page.getByTestId('track-header');
  await expect(headers).toHaveCount(2);
  const [v, a] = await tracks(page);
  await expect(header(page, v.id)).toHaveAttribute('data-track-kind', 'video');
  await expect(header(page, v.id).getByTestId('track-name')).toHaveText('Video 1');
  await expect(header(page, a.id).getByTestId('track-name')).toHaveText('Audio 1');
  await expect(header(page, v.id).getByTestId('track-btn-hide')).toHaveCount(1);
  await expect(header(page, a.id).getByTestId('track-btn-hide')).toHaveCount(0);
  for (const id of [v.id, a.id]) {
    const h = header(page, id);
    for (const b of ['mute', 'solo', 'lock']) {
      await expect(h.getByTestId(`track-btn-${b}`)).toHaveAttribute('aria-pressed', 'false');
    }
    // The only track of its kind cannot be removed or moved.
    await expect(h.getByTestId('track-btn-remove')).toBeDisabled();
    await expect(h.getByTestId('track-btn-up')).toBeDisabled();
    await expect(h.getByTestId('track-btn-down')).toBeDisabled();
    // Each header is as tall as its lane and level with it.
    const hb = (await h.boundingBox())!;
    const lb = (await laneOf(page, id).boundingBox())!;
    expect(Math.abs(hb.y - lb.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(hb.height - lb.height)).toBeLessThanOrEqual(1);
  }
  await expect(page.getByTestId('solo-indicator')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a new video layer appears above the first, becomes active, and receives added media', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  const [first] = await videoIds(page);
  await page.getByTestId('btn-add-video-layer').click();
  const ids = await videoIds(page);
  expect(ids).toHaveLength(2);
  const second = ids[1];
  expect(ids[0]).toBe(first);
  await expect(laneOf(page, second)).toBeVisible();
  expect(await top(laneOf(page, second))).toBeLessThan(await top(laneOf(page, first)));
  expect(await top(header(page, second))).toBeLessThan(await top(header(page, first)));
  await expect(header(page, second).getByTestId('track-name')).toHaveText('Video 2');
  expect(await activeTrack(page)).toBe(second);
  await expect(header(page, second)).toHaveAttribute('data-active', 'true');
  await expect(header(page, first)).toHaveAttribute('data-active', 'false');

  await addToTimeline(page, 'with-audio.mp4', 1);
  expect((await clipStates(page))[0].trackId).toBe(second);

  // Clicking the first header (not a button) makes it active; the next clip goes there.
  await header(page, first).getByTestId('track-name').click();
  await expect(header(page, first)).toHaveAttribute('data-active', 'true');
  await addToTimeline(page, 'no-audio.mp4', 2);
  const placed = await clipStates(page);
  expect(placed.find((c) => c.trackId === first)?.mediaId).not.toBe(placed.find((c) => c.trackId === second)?.mediaId);
  expect(placed.filter((c) => c.trackId === first)).toHaveLength(1);

  // Clicking a lane background also sets the active track and clears the clip selection.
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  const lb = (await laneOf(page, second).boundingBox())!;
  await page.mouse.click(lb.x + 6 * PPS, lb.y + lb.height / 2);
  expect(await activeTrack(page)).toBe(second);
  expect(await page.evaluate(() => window.__clipforge!.getState().selection)).toEqual([]);
});

test('mute, solo, lock and hide toggle aria-pressed and the track, one undo step each', async ({ page }) => {
  await open(page);
  const [v, a] = await tracks(page);
  const cases: [string, string, keyof TrackInfo][] = [
    [v.id, 'mute', 'muted'],
    [a.id, 'solo', 'solo'],
    [v.id, 'lock', 'locked'],
    [v.id, 'hide', 'hidden'],
  ];
  for (const [id, btn, flag] of cases) {
    const b = header(page, id).getByTestId(`track-btn-${btn}`);
    const depth = (await playerState(page)).undoDepth;
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    expect((await tracks(page)).find((t) => t.id === id)![flag]).toBe(true);
    expect((await playerState(page)).undoDepth).toBe(depth + 1);
    if (flag === 'solo') await expect(page.getByTestId('solo-indicator')).toBeVisible();
    await page.getByTestId('btn-undo').click();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    expect((await tracks(page)).find((t) => t.id === id)![flag]).toBe(false);
    if (flag === 'solo') await expect(page.getByTestId('solo-indicator')).toHaveCount(0);
    await page.getByTestId('btn-redo').click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.getByTestId('solo-indicator')).toHaveCount(0);
  // Hidden and locked tracks show it on header and lane.
  await header(page, v.id).getByTestId('track-btn-lock').click();
  await expect(header(page, v.id)).toHaveClass(/is-locked/);
  await expect(laneOf(page, v.id)).toHaveClass(/is-locked/);
});

test('a locked track refuses drops, drags, split and delete with a toast and leaves the project unchanged', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1); // [0,3) on Video 1
  const [v] = await tracks(page);
  const [c] = await clipStates(page);
  await header(page, v.id).getByTestId('track-btn-lock').click();
  await expect(clipEl(page, c.id)).toHaveClass(/is-locked/);
  const before = await clipStates(page);
  const depth = (await playerState(page)).undoDepth;

  // Media dropped on the locked lane.
  await mediaItem(page, 'no-audio.mp4').dragTo(laneOf(page, v.id), { targetPosition: { x: 6 * PPS, y: 20 } });
  await expect(toast(page).filter({ hasText: 'Track is locked' })).toHaveCount(1);
  // A clip dragged on the locked lane.
  await drag(page, await center(clipEl(page, c.id)), 2 * PPS);
  await expect(toast(page).filter({ hasText: 'Track is locked' }).first()).toBeVisible();
  // Split and delete of the selected locked clip.
  await clipEl(page, c.id).click();
  await page.getByTestId('timeline-ruler').click({ position: { x: 1.5 * PPS, y: 8 } });
  await page.getByTestId('btn-split').click();
  await page.getByTestId('btn-delete').click();
  await expect(toast(page).filter({ hasText: 'Track is locked' })).not.toHaveCount(0);
  expect(await clipStates(page)).toEqual(before);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // Unlocked, the same edits work again.
  await header(page, v.id).getByTestId('track-btn-lock').click();
  await expect(clipEl(page, c.id)).not.toHaveClass(/is-locked/);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
});

test('double-click renames a track: Enter commits once, Escape cancels, empty falls back to the default', async ({ page }) => {
  await open(page);
  const [v] = await tracks(page);
  const h = header(page, v.id);
  const depth = (await playerState(page)).undoDepth;
  await h.getByTestId('track-name').dblclick();
  const input = h.getByTestId('track-name-input');
  await expect(input).toBeFocused();
  await input.fill('Titles');
  await input.press('Enter');
  await expect(h.getByTestId('track-name')).toHaveText('Titles');
  expect((await tracks(page))[0].name).toBe('Titles');
  expect((await playerState(page)).undoDepth).toBe(depth + 1);

  await h.getByTestId('track-name').dblclick();
  await h.getByTestId('track-name-input').fill('Nope');
  await h.getByTestId('track-name-input').press('Escape');
  await expect(h.getByTestId('track-name')).toHaveText('Titles');
  expect((await playerState(page)).undoDepth).toBe(depth + 1);

  // Typing S or Space in the field does not split or play.
  await h.getByTestId('track-name').dblclick();
  await h.getByTestId('track-name-input').fill('');
  await h.getByTestId('track-name-input').pressSequentially('S ');
  await expect(h.getByTestId('track-name-input')).toHaveValue('S ');
  await h.getByTestId('track-name-input').fill('');
  await h.getByTestId('track-name-input').press('Enter');
  await expect(h.getByTestId('track-name')).toHaveText('Video 1');
  expect((await tracks(page))[0].name).toBe('');
  expect((await playerState(page)).playing).toBe(false);
});

test('removing a track: empty removes at once (undo restores), with clips asks first and undo restores both', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, tone], 2);
  await page.getByTestId('btn-add-audio-track').click();
  const a2 = (await tracks(page)).filter((t) => t.kind === 'audio')[1].id;
  await header(page, a2).getByTestId('track-btn-remove').click();
  await expect(header(page, a2)).toHaveCount(0);
  await page.getByTestId('btn-undo').click();
  await expect(header(page, a2)).toHaveCount(1);

  // Make a2 the active track and add two clips to it.
  await header(page, a2).getByTestId('track-name').click();
  await addToTimeline(page, 'tone.wav', 1);
  await addToTimeline(page, 'tone.wav', 2);
  const withClips = await tracks(page);
  const depth = (await playerState(page)).undoDepth;

  await header(page, a2).getByTestId('track-btn-remove').click();
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toContainText('Remove Audio 2 and its 2 clips?');
  await page.getByTestId('btn-confirm-cancel').click();
  await expect(dialog).toHaveCount(0);
  expect(await tracks(page)).toEqual(withClips);

  await header(page, a2).getByTestId('track-btn-remove').click();
  await page.getByTestId('btn-confirm-ok').click();
  await expect(header(page, a2)).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  await page.getByTestId('btn-undo').click();
  expect(await tracks(page)).toEqual(withClips);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
});

function colourPng(dir: string, name: string, colour: string, size: string): string {
  const out = join(dir, name);
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${colour}:s=${size}`, '-frames:v', '1', out];
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
  return out;
}

function centrePixel(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = c.width;
    o.height = c.height;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    return [...ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data.slice(0, 3)];
  });
}

const isRed = (p: number[]): boolean => p[0] > 180 && p[1] < 80;
const isGreen = (p: number[]): boolean => p[1] > 180 && p[0] < 80;

test('moving layers up and down changes the layer order and what the preview shows on top', async ({ page }) => {
  await open(page);
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const red = colourPng(dir, 'red.png', 'red', '320x180');
  const green = colourPng(dir, 'green.png', 'lime', '180x180');
  await importFiles(page, [red, green], 2);
  const [v1] = await videoIds(page);
  await header(page, v1).getByTestId('track-name').click();
  await addToTimeline(page, 'red.png', 1);
  await page.getByTestId('btn-add-video-layer').click();
  const [, v2] = await videoIds(page);
  await addToTimeline(page, 'green.png', 2);
  await page.getByTestId('timeline-ruler').click({ position: { x: 1 * PPS, y: 8 } });
  await expect.poll(async () => isGreen(await centrePixel(page)), { timeout: 10_000 }).toBe(true);

  await expect(header(page, v2).getByTestId('track-btn-up')).toBeDisabled();
  await header(page, v2).getByTestId('track-btn-down').click();
  expect(await videoIds(page)).toEqual([v2, v1]);
  expect(await top(header(page, v1))).toBeLessThan(await top(header(page, v2)));
  expect(await top(laneOf(page, v1))).toBeLessThan(await top(laneOf(page, v2)));
  await expect.poll(async () => isRed(await centrePixel(page)), { timeout: 10_000 }).toBe(true);

  await header(page, v2).getByTestId('track-btn-up').click();
  expect(await videoIds(page)).toEqual([v1, v2]);
  await expect.poll(async () => isGreen(await centrePixel(page)), { timeout: 10_000 }).toBe(true);
  await page.getByTestId('btn-undo').click();
  expect(await videoIds(page)).toEqual([v2, v1]);
});

test('at most 8 video layers: the ninth shows a toast and adds nothing; the timeline scrolls vertically', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 7; i++) await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(9);
  const depth = (await playerState(page)).undoDepth;
  await page.getByTestId('btn-add-video-layer').click();
  await expect(toast(page)).toContainText('At most 8 video tracks');
  await expect(page.getByTestId('track-header')).toHaveCount(9);
  expect((await playerState(page)).undoDepth).toBe(depth);

  // Taller than its panel: the rows scroll, headers and lanes together, the ruler stays in view.
  const scroller = page.getByTestId('timeline-scroll');
  const [scrollH, clientH] = await scroller.evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(scrollH).toBeGreaterThan(clientH);
  const audio = (await tracks(page)).find((t) => t.kind === 'audio')!.id;
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const hb = (await header(page, audio).boundingBox())!;
  const lb = (await laneOf(page, audio).boundingBox())!;
  expect(Math.abs(hb.y - lb.y)).toBeLessThanOrEqual(1);
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const box = (await scroller.boundingBox())!;
  expect(Math.abs(ruler.y - box.y)).toBeLessThanOrEqual(1);
});

test('header buttons work from the keyboard: Tab to a button and press Enter', async ({ page }) => {
  await open(page);
  const [v] = await tracks(page);
  const h = header(page, v.id);
  await h.getByTestId('track-btn-mute').focus();
  await page.keyboard.press('Tab');
  await expect(h.getByTestId('track-btn-solo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(h.getByTestId('track-btn-solo')).toHaveAttribute('aria-pressed', 'true');
  expect((await tracks(page))[0].solo).toBe(true);
  await expect(page.getByTestId('solo-indicator')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(h.getByTestId('track-btn-solo')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('solo-indicator')).toHaveCount(0);
});
