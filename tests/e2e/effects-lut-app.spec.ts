// LUT media in the editor (Plan 4 Task 6): import entry point, persistence over reload, in-use removal refusal, GC
// protection, the plain-English import errors and the missing-file notice.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, importFiles, open, toast } from './helpers';
import { pixelAt } from './pip-helpers';
import { INVERT, cubeText, solidPng } from './lut-helpers';
import type { MediaRef } from '../../src/core/model';

const INVERT_CUBE = cubeText(2, INVERT, ['TITLE "Invert LUT"']);
const storedIds = (page: Page): Promise<string[]> => page.evaluate(() => window.__clipforge!.listMediaIds());

function importLuts(page: Page, files: [string, string][]): Promise<MediaRef[]> {
  return page.evaluate(
    (files) => window.__clipforge!.importLutFiles(files.map(([name, text]) => new File([text], name))),
    files,
  );
}

/** An image clip on the timeline with an invert LUT effect; returns the LUT media and the ungraded centre pixel. */
async function gradedClip(page: Page): Promise<{ lut: MediaRef; plain: number[] }> {
  await open(page);
  await importFiles(page, [solidPng('blue.png', '0x3080C0')], 1);
  await addToTimeline(page, 'blue.png', 1);
  await expect.poll(() => pixelAt(page, 960, 540).then((p) => p[2] > 150)).toBe(true);
  const plain = await pixelAt(page, 960, 540);
  const [lut] = await importLuts(page, [['invert.cube', INVERT_CUBE]]);
  expect(lut).toMatchObject({ kind: 'lut', name: 'Invert LUT' });
  await page.evaluate((ref) => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.kind === 'image' ? { ...c, effects: [{ id: 'lut-fx', type: 'lut' as const, enabled: true, params: { intensity: 1 }, ref }] } : c)),
      })),
    }));
  }, lut.id);
  return { lut, plain };
}

const inverted = (plain: number[]) => async (page: Page): Promise<boolean> => {
  const p = await pixelAt(page, 960, 540);
  return p.every((v, k) => Math.abs(v - (255 - plain[k])) <= 3);
};

test('a LUT clip renders graded, survives reload with its file, cannot be removed while used, and GC keeps it', async ({ page }) => {
  const { lut, plain } = await gradedClip(page);
  // LUT media is not placeable: the media bin lists only the image.
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  await expect(page.locator('[data-testid="media-item"][data-kind="lut"]')).toHaveCount(0);
  await expect.poll(() => inverted(plain)(page), { message: 'preview graded' }).toBe(true);
  expect(await storedIds(page)).toContain(lut.id);

  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  const effects = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).map((c) => c.effects));
  expect(effects).toEqual([[{ id: 'lut-fx', type: 'lut', enabled: true, params: { intensity: 1 }, ref: lut.id }]]);
  const media = await page.evaluate((id) => window.__clipforge!.getState().history.present.media[id], lut.id);
  expect(media).toMatchObject({ kind: 'lut', name: 'Invert LUT' });
  expect(media.missing).toBeUndefined();
  // Startup GC has run after the restore; an explicit GC keeps the LUT too.
  expect(await page.evaluate(() => window.__clipforge!.gcMedia())).not.toContain(lut.id);
  expect(await storedIds(page)).toContain(lut.id);
  await expect.poll(() => inverted(plain)(page), { message: 'preview graded after reload' }).toBe(true);

  // Removing the LUT while the clip uses it is refused with the in-use message; nothing changes.
  await page.evaluate((id) => window.__clipforge!.removeMediaItem(id), lut.id);
  await expect(toast(page).locator('span')).toHaveText('Cannot remove Invert LUT. It is used by 1 clip on the timeline.');
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  expect(await page.evaluate((id) => Boolean(window.__clipforge!.getState().history.present.media[id]), lut.id)).toBe(true);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  expect(await page.evaluate(() => window.__clipforge!.gcMedia())).toEqual([]);
  expect(await storedIds(page)).toContain(lut.id);
});

test('a malformed .cube import shows the plain-English error and leaves no stored file', async ({ page }) => {
  await open(page);
  const before = await storedIds(page);
  const done = await page.evaluate(() => window.__clipforge!.importLutFiles([
    new File(['LUT_1D_SIZE 1024\n0 0 0\n1 1 1'], 'flat.cube'),
    new File(['LUT_3D_SIZE 128\n0 0 0'], 'huge.cube'),
    // A one-line multi-megabyte (binary-like) file: the toast quotes 40 printable characters of it, no more.
    new File([`LUT_3D_SIZE 2\n\u0001${'q'.repeat(3_000_000)}`], 'long.cube'),
  ]));
  expect(done).toEqual([]);
  await expect(toast(page)).toHaveCount(3);
  await expect(toast(page).locator('span')).toHaveText([
    'Could not import flat.cube: This is a 1D LUT. ClipForge only supports 3D LUTs (.cube files with a LUT_3D_SIZE line).',
    'Could not import huge.cube: This LUT has 128 points per side. ClipForge supports 3D LUTs with 2 to 65 points per side.',
    `Could not import long.cube: Line 2 of this .cube file is not three numbers: "${'q'.repeat(40)}…".`,
  ]);
  expect(await storedIds(page)).toEqual(before);
  expect(await page.evaluate(() => Object.keys(window.__clipforge!.getState().history.present.media))).toEqual([]);
});

test('a LUT whose file is gone: one notice, the clip still renders ungraded', async ({ page }) => {
  const { lut, plain } = await gradedClip(page);
  await expect.poll(() => inverted(plain)(page)).toBe(true);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.evaluate((id) => window.__clipforge!.removeMedia(id), lut.id);
  // Counts every LUT notice toast ever shown (toasts dismiss themselves after 5 s).
  await page.addInitScript(() => {
    const w = window as unknown as { lutNotices: number };
    w.lutNotices = 0;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) {
        if (n instanceof HTMLElement && n.matches('[data-testid="error-toast"]') && n.textContent?.includes('could not be loaded')) w.lutNotices++;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(toast(page).locator('span')).toHaveText('The LUT "Invert LUT" could not be loaded, so its effect is skipped.');
  // Scrubbing renders more frames: still exactly one notice, and the picture is the ungraded clip.
  for (const t of [0.5, 1, 1.5]) await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  await expect.poll(async () => (await pixelAt(page, 960, 540)).every((v, k) => Math.abs(v - plain[k]) <= 3)).toBe(true);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { lutNotices: number }).lutNotices)).toBe(1);
});

test('a LUT import asks once for persistent storage, like the media bin', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { persistCalls: number };
    w.persistCalls = 0;
    navigator.storage.persist = () => {
      w.persistCalls++;
      return Promise.resolve(false);
    };
  });
  await open(page);
  const calls = (): Promise<number> => page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls);
  await importLuts(page, [['bad.cube', 'LUT_1D_SIZE 2']]);
  expect(await calls()).toBe(0);
  await importLuts(page, [['a.cube', INVERT_CUBE], ['b.cube', INVERT_CUBE]]);
  expect(await calls()).toBe(1);
});
