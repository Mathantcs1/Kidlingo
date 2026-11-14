// Helpers of the motion path editing specs (Plan 5B Task 8), on the pip project ('pip' 200×200 lime or the 300×100
// red|yellow split, 0..2 s on layer 'v2', over the blue background).
import type { Locator, Page } from '@playwright/test';
import type { PositionKeyframe } from '../../src/core/model';
import { canvasBox, toPage } from './pip-helpers';
import type { Pt } from './pip-helpers';

export const C = { x: 960, y: 540 };
export type K = { t: number; x: number; y: number };
export const dots = (page: Page) => page.getByTestId('motion-key');
export const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
export const playhead = (page: Page) => page.evaluate(() => window.__clipforge!.getState().playhead);
export const projectJson = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
export const pipClip = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!);
export const pipKeys = async (page: Page): Promise<PositionKeyframe[]> => (await pipClip(page)).keys?.position ?? [];

/** Puts linear position keys on the pip clip (v2), selects it and sets the playhead; `track` patches its layer. */
export async function keyPip(page: Page, keys: K[], at: number, track: { locked?: boolean } = {}): Promise<void> {
  await page.evaluate(({ keys, at, track }) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === 'v2' ? { ...t, ...track, clips: t.clips.map((c) => ({ ...c, keys: { position: keys.map((k) => ({ ...k, ease: { kind: 'linear' as const } })) } })) } : t,
      ),
    }));
    s.select(['pip']);
    s.setPlayhead(at);
    (document.activeElement as HTMLElement | null)?.blur();
  }, { keys, at, track });
}

/** The centre of an svg element in page px. */
export async function centreOf(loc: Locator): Promise<Pt> {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Page px of a format offset from the canvas centre. */
export async function pageAt(page: Page, x: number, y: number): Promise<Pt> {
  return toPage(await canvasBox(page), { x: C.x + x, y: C.y + y });
}

/** Presses at `from` and moves to `to` in steps; the caller releases (or presses Escape first). */
export async function pressAndMove(page: Page, from: Pt, to: Pt): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

/** A downsampled snapshot of the preview canvas (every 4th pixel, RGB). */
export function snapshot(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = c.width;
    o.height = c.height;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const out: number[] = [];
    for (let i = 0; i < d.length; i += 16) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  });
}

export const maxDiff = (a: number[], b: number[]): number => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
