// New-layer drop zones: media from the bin and clips dragged onto a zone create a new track in ONE undo step.
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
  tone,
  trackErrors,
  withAudio,
} from './helpers';

test.setTimeout(60_000);

interface TrackInfo {
  id: string;
  kind: string;
  clips: { id: string; mediaId: string; start: number }[];
}

const tracks = (page: Page): Promise<TrackInfo[]> =>
  page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks.map((t) => ({
      id: t.id,
      kind: t.kind,
      clips: t.clips.map((c) => ({ id: c.id, mediaId: c.mediaId, start: c.start })),
    })),
  );
const ui = (page: Page): Promise<{ active: string | null; selection: string[] }> =>
  page.evaluate(() => {
    const s = window.__clipforge!.getState();
    return { active: s.activeTrackId, selection: s.selection };
  });

const zone = (page: Page, kind: 'video' | 'audio'): Locator => page.locator(`[data-testid="new-layer-zone"][data-kind="${kind}"]`);
const laneOf = (page: Page, id: string): Locator => page.locator(`[data-testid="timeline-lane"][data-track-id="${id}"]`);
const header = (page: Page, id: string): Locator => page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);
const box = async (loc: Locator) => (await loc.boundingBox())!;
const lastVideoIndex = (ts: TrackInfo[]): number => ts.map((t) => t.kind).lastIndexOf('video');

/** Presses on a media item and hovers `target` at ruler offset `x` (HTML5 drag, kept pressed). */
async function hoverMedia(page: Page, name: string, target: Locator, x: number): Promise<void> {
  await mediaItem(page, name).hover();
  await page.mouse.down();
  const b = await box(target);
  await page.mouse.move(b.x + x, b.y + b.height / 2, { steps: 6 });
}

/** Presses on a clip and moves the pointer over `target`, `dx` px to the right (pointer drag, kept pressed). */
async function hoverClip(page: Page, clipId: string, target: Locator, dx: number): Promise<{ x: number; y: number }> {
  const from = await center(clipEl(page, clipId));
  const b = await box(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, b.y + b.height / 2, { steps: 8 });
  return from;
}

test('one zone sits above the top video lane and one below the bottom audio lane, aligned with a header cell', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await page.getByTestId('btn-add-video-layer').click();
  await page.getByTestId('btn-add-audio-track').click();
  await expect(page.getByTestId('new-layer-zone')).toHaveCount(2);
  const ts = await tracks(page);
  const topVideo = ts[lastVideoIndex(ts)].id;
  const bottomAudio = ts.filter((t) => t.kind === 'audio').at(-1)!.id;

  const vz = await box(zone(page, 'video'));
  const az = await box(zone(page, 'audio'));
  const lanes = page.getByTestId('timeline-lane');
  const firstLane = await box(lanes.first());
  const lastLane = await box(lanes.last());
  await expect(lanes.first()).toHaveAttribute('data-track-id', topVideo);
  await expect(lanes.last()).toHaveAttribute('data-track-id', bottomAudio);
  expect(vz.y + vz.height).toBeLessThanOrEqual(firstLane.y + 1);
  expect(az.y).toBeGreaterThanOrEqual(lastLane.y + lastLane.height - 1);
  expect(vz.height).toBeGreaterThanOrEqual(20);
  expect(vz.height).toBeLessThanOrEqual(36);

  // The header column keeps the rows aligned: each header is level with its lane.
  for (const t of ts) expect(Math.abs((await box(header(page, t.id))).y - (await box(laneOf(page, t.id))).y)).toBeLessThan(1);
  await expect(zone(page, 'video')).toHaveAttribute('aria-label', /new video layer/i);
  await expect(zone(page, 'video')).not.toHaveAttribute('tabindex', /.*/);
  expect(errors).toEqual([]);
});

test('media dropped on the video zone creates a layer above with the clip; one undo removes both', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, tone], 2);
  const before = await tracks(page);
  const depth = (await playerState(page)).undoDepth;

  await hoverMedia(page, 'with-audio.mp4', zone(page, 'video'), 2 * PPS);
  await expect(zone(page, 'video')).toHaveAttribute('data-drop-target', 'true');
  await expect(zone(page, 'video')).toHaveClass(/is-drop-target/);
  await page.mouse.up();
  await expect(zone(page, 'video')).not.toHaveAttribute('data-drop-target', /.*/);

  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  const after = await tracks(page);
  expect(after).toHaveLength(before.length + 1);
  const added = after[lastVideoIndex(after)];
  expect(before.map((t) => t.id)).not.toContain(added.id);
  expect(added.clips).toHaveLength(1);
  expect(Math.abs(added.clips[0].start - 2)).toBeLessThanOrEqual(0.1);
  expect(await ui(page)).toEqual({ active: added.id, selection: [added.clips[0].id] });
  await expect(page.getByTestId('timeline-lane').first()).toHaveAttribute('data-track-id', added.id);
  expect((await playerState(page)).undoDepth).toBe(depth + 1);

  await page.getByTestId('btn-undo').click();
  expect(await tracks(page)).toEqual(before);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);

  // Audio media on the audio zone appends an audio track.
  await mediaItem(page, 'tone.wav').dragTo(zone(page, 'audio'), { targetPosition: { x: 1 * PPS, y: 10 } });
  const withAudioTrack = await tracks(page);
  expect(withAudioTrack).toHaveLength(before.length + 1);
  expect(withAudioTrack.at(-1)!.kind).toBe('audio');
  expect(Math.abs(withAudioTrack.at(-1)!.clips[0].start - 1)).toBeLessThanOrEqual(0.1);
  expect(errors).toEqual([]);
});

test('media of the wrong kind or past the 8-layer limit is refused by a zone with a toast and changes nothing', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, tone], 2);
  const before = await tracks(page);
  const depth = (await playerState(page)).undoDepth;

  await hoverMedia(page, 'tone.wav', zone(page, 'video'), 1 * PPS);
  await expect(zone(page, 'video')).toHaveAttribute('data-drop-target', 'reject');
  await expect(zone(page, 'video')).toHaveClass(/is-drop-reject/);
  await page.mouse.up();
  await expectOnlyToast(page, 'Audio goes on an audio track');
  await clearToasts(page);
  await mediaItem(page, 'with-audio.mp4').dragTo(zone(page, 'audio'), { targetPosition: { x: 1 * PPS, y: 10 } });
  await expectOnlyToast(page, 'Video and images go on a video track');
  expect(await tracks(page)).toEqual(before);
  expect((await playerState(page)).undoDepth).toBe(depth);

  for (let i = 0; i < 7; i++) await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(9);
  const full = await tracks(page);
  const fullDepth = (await playerState(page)).undoDepth;
  await clearToasts(page);
  await page.getByTestId('timeline-scroll').evaluate((el) => {
    el.scrollTop = 0;
  });
  await mediaItem(page, 'with-audio.mp4').dragTo(zone(page, 'video'), { targetPosition: { x: 1 * PPS, y: 10 } });
  await expectOnlyToast(page, 'At most 8 video tracks');
  expect(await tracks(page)).toEqual(full);
  expect((await playerState(page)).undoDepth).toBe(fullDepth);
});

test('dragging a clip onto the video zone moves it to a new top layer in one undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  const before = await tracks(page);
  const [c] = await clipStates(page);
  const depth = (await playerState(page)).undoDepth;

  await hoverClip(page, c.id, zone(page, 'video'), 1 * PPS);
  const ghost = zone(page, 'video').getByTestId('drag-ghost');
  await expect(ghost).toHaveCount(1);
  await expect(ghost).not.toHaveClass(/is-reject/);
  await expect(zone(page, 'video')).toHaveClass(/is-drop-target/);
  expect(Math.abs((await box(ghost)).x - (await box(zone(page, 'video'))).x - 1 * PPS)).toBeLessThan(3);
  await page.mouse.up();

  const after = await tracks(page);
  expect(after).toHaveLength(before.length + 1);
  const added = after[lastVideoIndex(after)];
  expect(added.clips.map((x) => x.id)).toEqual([c.id]);
  expect(Math.abs(added.clips[0].start - 1)).toBeLessThanOrEqual(0.1);
  expect(after.find((t) => t.id === c.trackId)!.clips).toEqual([]);
  expect(await ui(page)).toEqual({ active: added.id, selection: [c.id] });
  expect((await playerState(page)).undoDepth).toBe(depth + 1);
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);

  await page.getByTestId('btn-undo').click();
  expect(await tracks(page)).toEqual(before);
  await expect(laneOf(page, added.id)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an audio clip over the video zone is rejected; a locked source is refused; Escape cancels', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, tone], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'tone.wav', 2);
  const before = await tracks(page);
  const depth = (await playerState(page)).undoDepth;
  const states = await clipStates(page);
  const v = states.find((s) => s.trackKind === 'video')!;
  const a = states.find((s) => s.trackKind === 'audio')!;

  // Audio clip over the video zone: rejected ghost, toast on release.
  await hoverClip(page, a.id, zone(page, 'video'), 0.5 * PPS);
  await expect(zone(page, 'video').getByTestId('drag-ghost')).toHaveClass(/is-reject/);
  await expect(zone(page, 'video')).toHaveClass(/is-drop-reject/);
  await clearToasts(page);
  await page.mouse.up();
  await expectOnlyToast(page, 'Audio goes on an audio track');
  expect(await tracks(page)).toEqual(before);

  // Escape while over the zone cancels: no ghost, nothing changes on release.
  await clearToasts(page);
  await hoverClip(page, v.id, zone(page, 'video'), 1 * PPS);
  await expect(zone(page, 'video').getByTestId('drag-ghost')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await page.mouse.up();
  expect(await tracks(page)).toEqual(before);
  await expect(page.getByTestId('error-toast')).toHaveCount(0);

  // A clip on a locked track: rejected ghost and the lock toast.
  await header(page, v.trackId).getByTestId('track-btn-lock').click();
  const lockedDepth = (await playerState(page)).undoDepth;
  await hoverClip(page, v.id, zone(page, 'video'), 1 * PPS);
  await expect(zone(page, 'video').getByTestId('drag-ghost')).toHaveClass(/is-reject/);
  await page.mouse.up();
  await expectOnlyToast(page, 'Track is locked');
  const locked = await tracks(page);
  expect(locked.map((t) => t.clips)).toEqual(before.map((t) => t.clips));
  expect(locked).toHaveLength(before.length);
  expect((await playerState(page)).undoDepth).toBe(lockedDepth);
  expect(lockedDepth).toBe(depth + 1);
});
