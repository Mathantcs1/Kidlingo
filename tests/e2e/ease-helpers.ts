// Shared helpers of the ease editor specs (Plan 5 Task 9): the keyed pip project, opening the editor, measuring opacity.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { snapToFrame } from '../../src/core/fps';
import type { Ease } from '../../src/core/easing';
import { pixelAt, setupPip } from './pip-helpers';

const C = { x: 960, y: 540 };
export const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
export const keys = (page: Page, prop: 'opacity' | 'scale') =>
  page.evaluate((prop) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.keys![prop]!.map((k) => k.ease), prop);
export const diamond = (page: Page, time: number) => page.locator(`[data-testid="keyframe-diamond"][data-time="${time.toFixed(4)}"]`);
export const editor = (page: Page) => page.getByTestId('ease-editor');
export const handle = (page: Page, n: 1 | 2) => page.getByTestId(`ease-handle-${n}`);
export const num = (page: Page, name: string) => page.getByTestId(`ease-${name}`);
export const curveD = (page: Page) => page.getByTestId('ease-curve').getAttribute('d');

export async function setup(page: Page, opts: { locked?: boolean; opacityEase?: Ease } = {}): Promise<void> {
  await setupPip(page);
  await page.evaluate(({ locked, ease }) => {
    const s = window.__clipforge!.getState();
    const lin = { kind: 'linear' as const };
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id !== 'v2' ? t : {
        ...t,
        locked,
        clips: t.clips.map((c) => ({
          ...c,
          keys: {
            opacity: [{ t: 0.4, v: 0, ease: ease ?? lin }, { t: 1.6, v: 1, ease: lin }, { t: 1.9, v: 0.5, ease: lin }],
            scale: [{ t: 0.4, v: 1, ease: lin }, { t: 1.6, v: 1, ease: lin }],
          },
        })),
      })),
    }));
    s.select(['pip']);
    s.setPlayhead(0.2);
    (document.activeElement as HTMLElement | null)?.blur();
  }, { locked: opts.locked ?? false, ease: opts.opacityEase });
  await expect(page.getByTestId('keyframe-diamond')).toHaveCount(3);
}

/** Opens the editor on the diamond at `time` with the keyboard (Enter), as a keyboard user would. */
export async function openOn(page: Page, time: number): Promise<void> {
  await diamond(page, time).focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeVisible();
}

/** Opacity progress (0..1) of the pip at the preview centre, from the G channel against the 0 and 1 references. */
export async function opacityAt(page: Page, t: number): Promise<number> {
  const read = async (at: number): Promise<number> => {
    await setTime(page, at);
    await page.waitForTimeout(150);
    return (await pixelAt(page, C.x, C.y))[1];
  };
  const g0 = await read(0.4);
  const g1 = await read(1.6);
  await setTime(page, t);
  await page.waitForTimeout(150);
  return ((await pixelAt(page, C.x, C.y))[1] - g0) / (g1 - g0);
}

export const fps = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present.format.fps);
export const fractionAt = async (page: Page, t: number): Promise<number> => (snapToFrame(t, await fps(page)) - 0.4) / 1.2;
export const near = (a: number, b: number, tol: number): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

