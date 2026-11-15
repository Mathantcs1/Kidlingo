// Plan 5D Task 5: keyframe diamonds and previous/next key follow the TIMELINE under speed and reverse.
// The pip clip (timeline 1.. , footage 0.5..2.5) has scale keys at footage 0.5 / 1.5 and an opacity key at 1.0.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { playerState, trackErrors } from './helpers';
import { setupPip } from './pip-helpers';

test.setTimeout(90_000);

const diamonds = (page: Page) => page.getByTestId('keyframe-diamond');

async function setup(page: Page, retime: Record<string, unknown>): Promise<void> {
  await setupPip(page);
  await page.evaluate((retime) => {
    const s = window.__clipforge!.getState();
    const lin = { kind: 'linear' as const };
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id !== 'v2' ? t : { ...t, clips: t.clips.map((c) => ({ ...c, start: 1, in: 0.5, out: 2.5, ...retime, keys: { scale: [{ t: 0.5, v: 1, ease: lin }, { t: 1.5, v: 2, ease: lin }], opacity: [{ t: 1, v: 1, ease: lin }] } })) },
      ),
    }));
    s.select(['pip']);
    s.setPlayhead(0.2);
    (document.activeElement as HTMLElement | null)?.blur();
  }, retime);
}

const times = async (page: Page): Promise<number[]> =>
  (await diamonds(page).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-time'))))).sort((a, b) => a - b);

test('at 2x the diamonds sit at timeline 1.0, 1.25 and 1.5 (footage keys at half the distance)', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page, { speed: 2 });
  await expect(diamonds(page)).toHaveCount(3);
  const t = await times(page);
  [1.0, 1.25, 1.5].forEach((want, i) => expect(t[i]).toBeCloseTo(want, 3));
  expect(errors).toEqual([]);
});

test('in reverse the key at `in` is off the clip and Next key walks the timeline order', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page, { reverse: true });
  await expect(diamonds(page)).toHaveCount(2); // footage 0.5 = `in` plays last: off the clip
  const t = await times(page);
  expect(t[0]).toBeCloseTo(2.0, 3); // footage 1.5 (2.5 - 1.5 = 1.0 s in)
  expect(t[1]).toBeCloseTo(2.5, 3); // footage 1.0
  for (const want of [2.0, 2.5]) {
    await page.keyboard.press(']');
    await expect.poll(async () => (await playerState(page)).playhead).toBeCloseTo(want, 2);
  }
  expect(errors).toEqual([]);
});
