// Helpers of the Plan 5B journey: the gesture counter (one undo step each), preset browser picks and store reads.
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { depth, f } from './effects-ui-helpers';
import { present } from './keyframes-journey-helpers';
import type { Clip } from '../../src/core/model';

export const overlaysOf = async (page: Page): Promise<Clip[]> => (await present(page)).tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'overlay');

/** Runs `run` and asserts exactly ONE new undo step; counts it in `steps.n`. */
export function gestures(page: Page): { steps: { n: number }; gesture: (name: string, run: () => Promise<void>) => Promise<void> } {
  const steps = { n: 0 };
  const gesture = async (name: string, run: () => Promise<void>): Promise<void> => {
    const before = await depth(page);
    await run();
    await expect.poll(() => depth(page), { message: name }).toBe(before + 1);
    steps.n++;
  };
  return { steps, gesture };
}

/** Opens the browser of `slot`, picks the library preset `key` (the tile click applies and closes). */
export async function pick(page: Page, slot: 'in' | 'emphasis' | 'loop' | 'out', key: string): Promise<void> {
  await f(page, `anim-choose-${slot}`).click();
  await expect(f(page, 'preset-browser')).toBeVisible();
  await f(page, `preset-tile-${key}`).click();
  await expect(f(page, 'preset-browser')).toHaveCount(0);
}

export const typed = (page: Page, id: string, v: string) => async (): Promise<void> => {
  await f(page, id).fill(v);
  await f(page, id).press('Enter');
};
