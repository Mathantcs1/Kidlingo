// Data v6 (Plan 5): a v5 save (Plan 4) opens with the same picture, carries no keys, and is re-saved as v6 with the
// same clips. (Split out of layers-migration.spec.ts, ledger P5-4.)
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';
import { savedProject, writeSaved } from './overlay-helpers';
import { isGreen, isYellow, pixelAt, setupPip } from './pip-helpers';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(60_000);

test('a v5 save (Plan 4) opens with the same picture and is re-saved as v6 without keys', async ({ page }) => {
  const errors = trackErrors(page);
  // Blue background (inverted to yellow by a picture effect) under a lime square, plus a tone: video, image effects, audio.
  await setupPip(page);
  await page.evaluate(() =>
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === 'v1' ? { ...t, clips: t.clips.map((c) => ({ ...c, effects: [{ id: 'fx1', type: 'invert' as const, enabled: true, params: { amount: 1 } }] })) } : t,
      ),
    })),
  );
  const grid: [number, number][] = [[960, 540], [900, 500], [1020, 600], [100, 100], [1800, 1000], [400, 900]];
  const sample = (): Promise<number[][]> => Promise.all(grid.map(([x, y]) => pixelAt(page, x, y)));
  await expect.poll(async () => isGreen(await pixelAt(page, 960, 540)) && isYellow(await pixelAt(page, 100, 100))).toBe(true);
  const before = await sample();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const cur = await savedProject(page);
  expect(cur?.version).toBe(CURRENT_VERSION);
  const v5 = { ...cur!, version: 5 };
  await writeSaved(page, v5);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(1));
  await expect.poll(sample).toEqual(before);
  const p = await page.evaluate(() => window.__clipforge!.getState().history.present);
  expect(p.version).toBe(CURRENT_VERSION);
  expect(p.tracks).toEqual(v5.tracks);
  for (const c of p.tracks.flatMap((t) => t.clips)) {
    expect('keys' in c).toBe(false);
    for (const e of c.effects) expect('keys' in e).toBe(false);
  }

  // The next save is v6 with the same clips.
  await page.getByTestId('btn-add-video-layer').click();
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const after = await savedProject(page);
  expect(after?.version).toBe(CURRENT_VERSION);
  expect(after?.tracks.flatMap((t) => t.clips)).toEqual(v5.tracks.flatMap((t) => t.clips));
  expect(await sample()).toEqual(before);
  expect(errors).toEqual([]);
});
