// Shared helpers for the editor UI specs (preview, playback, drag editing, export).
import { join } from 'node:path';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';

const dir = ensureFixtures();
export const withAudio = join(dir, 'with-audio.mp4');
export const noAudio = join(dir, 'no-audio.mp4');
export const tone = join(dir, 'tone.wav');
export const PPS = 60;

export interface ClipState {
  id: string;
  trackId: string;
  trackKind: string;
  mediaId: string;
  start: number;
  in: number;
  out: number;
}

/** Collects uncaught page errors for a final `expect(errors).toEqual([])`. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('file-input')).toBeEnabled();
}

export function mediaItem(page: Page, name: string): Locator {
  return page.getByTestId('media-item').filter({ hasText: name });
}

export async function importFiles(page: Page, files: string[], expected: number): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByTestId('media-item')).toHaveCount(expected);
}

export async function addToTimeline(page: Page, name: string, expectedClips: number): Promise<void> {
  await mediaItem(page, name).getByTestId('btn-add-to-timeline').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(expectedClips);
}

/** Clips straight from the store, ordered by track then start. */
export function clipStates(page: Page): Promise<ClipState[]> {
  return page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks.flatMap((t) =>
      t.clips.map((c) => ({
        id: c.id,
        trackId: t.id,
        trackKind: t.kind,
        mediaId: c.mediaId,
        start: c.start,
        in: c.in,
        out: c.out,
      })),
    ),
  );
}

export function playerState(page: Page): Promise<{ playing: boolean; playhead: number; undoDepth: number }> {
  return page.evaluate(() => {
    const s = window.__clipforge!.getState();
    return { playing: s.playing, playhead: s.playhead, undoDepth: s.history.past.length };
  });
}

export function clipEl(page: Page, id: string): Locator {
  return page.locator(`[data-testid="timeline-clip"][data-clip-id="${id}"]`);
}

export async function setPlayhead(page: Page, seconds: number): Promise<void> {
  await page.getByTestId('timeline-ruler').click({ position: { x: seconds * PPS, y: 8 } });
}

export function lane(page: Page, kind: 'video' | 'audio'): Locator {
  return page.locator(`[data-testid="timeline-lane"][data-track-kind="${kind}"]`).first();
}

/** Presses at `from` (page coords), moves by (dx, dy) in steps, and releases. */
export async function drag(page: Page, from: { x: number; y: number }, dx: number, dy = 0): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
}

export async function center(loc: Locator): Promise<{ x: number; y: number }> {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function toast(page: Page): Locator {
  return page.getByTestId('error-toast');
}
