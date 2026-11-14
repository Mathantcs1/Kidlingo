// Helpers for the animation preset UI specs (Plan 5B Task 7): a media-free project (overlay sticker, adjustment
// layer, audio-less) applied through the dev hook, store reads and preview-tile canvas snapshots.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newOverlayClip } from '../../src/core/overlays';
import { newTrack } from '../../src/core/model';
import type { Clip, Project } from '../../src/core/model';
import { open } from './helpers';
import { adjustmentClip } from './keyframe-helpers';

const FORMAT = { width: 1920, height: 1080, fps: 30 };

/**
 * Opens the editor with track 'v1': a sticker overlay 'st' (0..4 s); track 'v2': an adjustment layer 'adj' (5..9 s);
 * the sticker is selected and the playhead at 1 s.
 */
export async function setupOverlay(page: Page): Promise<void> {
  await open(page);
  const st = { ...newOverlayClip('sticker', 0, 4, FORMAT), id: 'st' };
  const adj: Clip = { ...adjustmentClip({ id: 'adj' }, 4), start: 5 };
  const tracks = [
    { ...newTrack('video'), id: 'v1', clips: [st] },
    { ...newTrack('video'), id: 'v2', clips: [adj] },
    { ...newTrack('audio'), id: 'a1' },
  ];
  await page.evaluate((tracks) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, format: { ...p.format, width: 1920, height: 1080, fps: 30 }, tracks }));
    s.select(['st']);
    s.setPlayhead(1);
  }, tracks as Project['tracks']);
  await expect(page.getByTestId('anim-section')).toBeVisible();
}

export const clipJson = (page: Page, id: string): Promise<Clip> =>
  page.evaluate((id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!, id);

export const depth = (page: Page): Promise<number> => page.evaluate(() => window.__clipforge!.getState().history.past.length);

/** The tile canvas's pixels as a data URL (what the tile shows right now). */
export const tilePixels = (page: Page, key: string): Promise<string> =>
  page.getByTestId(`preset-preview-${key}`).evaluate((c) => (c as HTMLCanvasElement).toDataURL());

/** Opens the browser of `slot` from its Choose button. */
export async function openBrowser(page: Page, slot: string): Promise<void> {
  await page.getByTestId(`anim-choose-${slot}`).click();
  await expect(page.getByTestId('preset-browser')).toBeVisible();
}
