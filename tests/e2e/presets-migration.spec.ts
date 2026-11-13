// Data v7 (Plan 5B Task 2): a v6 save with keyframes (Plan 5A) opens with the same picture and the same keys and is
// re-saved as v7; a save from the next version (8) shows the "newer version" notice and its stored bytes never change.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { savedProject, writeSaved } from './overlay-helpers';
import { isBlue, isGreen, pixelAt, setupPip } from './pip-helpers';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(60_000);

const GRID: [number, number][] = [[760, 540], [960, 540], [700, 480], [860, 600], [100, 100], [1800, 1000]];
const sample = (page: Page): Promise<number[][]> => Promise.all(GRID.map(([x, y]) => pixelAt(page, x, y)));
const at = async (page: Page, t: number): Promise<number[][]> => {
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  return sample(page);
};

test('a v6 save with keyframes opens with the same picture and keys, and is re-saved as v7', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  // The green square slides from x = -600 to x = 200 (eased first segment) and holds a half-transparent opacity key.
  await page.evaluate(() =>
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id !== 'v2' ? t : {
        ...t,
        clips: t.clips.map((c) => ({
          ...c,
          keys: {
            position: [{ t: 0, x: -600, y: 0, ease: { kind: 'easeInOut' as const } }, { t: 2, x: 200, y: 0, ease: { kind: 'linear' as const } }],
            opacity: [{ t: 0, v: 1, ease: { kind: 'hold' as const } }, { t: 1.5, v: 0.5, ease: { kind: 'linear' as const } }],
          },
        })),
      })),
    })),
  );
  await expect.poll(async () => isGreen(await pixelAt(page, 760, 540)) && isBlue(await pixelAt(page, 960, 540))).toBe(true);
  const before = { mid: await at(page, 1), early: await at(page, 0.5), late: await at(page, 1.75) };
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = await savedProject(page);
  expect(cur?.version).toBe(CURRENT_VERSION);
  const v6 = { ...cur!, version: 6 };
  await writeSaved(page, v6);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(1));
  await expect.poll(() => sample(page)).toEqual(before.mid);
  expect(await at(page, 0.5)).toEqual(before.early);
  expect(await at(page, 1.75)).toEqual(before.late);
  const p = await page.evaluate(() => window.__clipforge!.getState().history.present);
  expect(p.version).toBe(CURRENT_VERSION);
  expect(p.tracks).toEqual(v6.tracks);
  expect(p.tracks.find((t) => t.id === 'v2')!.clips[0].keys).toEqual(v6.tracks.find((t) => t.id === 'v2')!.clips[0].keys);
  for (const c of p.tracks.flatMap((t) => t.clips)) expect('motion' in c).toBe(false);

  // The next save is v7 with the same clips (keys included) and the same picture.
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const after = await savedProject(page);
  expect(after?.version).toBe(7);
  expect(after?.tracks.flatMap((t) => t.clips)).toEqual(v6.tracks.flatMap((t) => t.clips));
  expect(await at(page, 1)).toEqual(before.mid);
  expect(errors).toEqual([]);
});

test('a save from the next version (8) shows the newer-version notice and its stored bytes never change', async ({ page }) => {
  await setupPip(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = await savedProject(page);
  // A future save: version 8 with data this build would otherwise "repair" (an unknown preset, a malformed loop).
  const v8 = {
    ...cur!, version: CURRENT_VERSION + 1, futureField: { a: 1 },
    tracks: cur!.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, motion: { in: { preset: 'teleport', duration: 99 } }, keys: { loops: { opacity: { mode: 'bounce' } } } })) })),
  };
  expect(v8.version).toBe(8);
  await writeSaved(page, v8);
  const bytes = JSON.stringify(await savedProject(page));

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toContainText('saved by a newer version');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  // Interaction: a new layer, a playhead move and an explicit autosave flush neither overwrite nor repair it.
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0.5));
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.waitForTimeout(1500);
  expect(JSON.stringify(await savedProject(page))).toBe(bytes);
  await expect(page.getByTestId('restore-failed')).toContainText('newer version');
});
