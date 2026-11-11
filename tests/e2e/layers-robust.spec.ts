// Multi-layer robustness: the preview's decoder bound with many stacked layers, merge-all refusing up front on a
// locked track, and format switches keeping customised placement.
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { expectOnlyToast, importFiles, open, playerState, trackErrors, withAudio } from './helpers';
import { expectPixel, isGreen, setupPip, transformOf, undoDepth } from './pip-helpers';

test.setTimeout(180_000);

const header = (page: Page, id: string): Locator => page.locator(`[data-testid="track-header"][data-track-id="${id}"]`);
const stats = (page: Page) => page.evaluate(() => window.__clipforge!.videoSourceStats());
const LEN = 0.5;
const KEEP_RECENT = 2;

/** `layers` video tracks L0.. each holding `perLayer` back-to-back LEN-second clips of with-audio.mp4. */
async function stacked(page: Page, layers: number, perLayer: number): Promise<void> {
  await importFiles(page, [withAudio], 1);
  await page.evaluate(
    ({ layers, perLayer, LEN }) => {
      window.__clipforge!.getState().apply((p) => {
        const m = Object.values(p.media)[0];
        const flags = { hidden: false, muted: false, solo: false, locked: false, name: '', volume: 1, duck: null };
        const clip = (L: number, k: number) => {
          const inPoint = (k * LEN + L * 0.1) % 2;
          const transform = { x: (L - 2.5) * 150, y: (k % 2) * 60, scale: 0.2, rotation: 0, opacity: 1 };
          return { id: `L${L}c${k}`, mediaId: m.id, kind: 'video' as const, start: k * LEN, in: inPoint, out: inPoint + LEN, volume: 1, audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] }, fit: 'fit' as const, transform };
        };
        const video = Array.from({ length: layers }, (_, L) => ({
          ...flags,
          id: `L${L}`,
          kind: 'video' as const,
          clips: Array.from({ length: perLayer }, (_, k) => clip(L, k)),
        }));
        return { ...p, tracks: [...video, { ...flags, id: 'A', kind: 'audio' as const, clips: [] }] };
      });
    },
    { layers, perLayer, LEN },
  );
}

async function idle(page: Page, t: number): Promise<void> {
  const canvas = page.getByTestId('preview-canvas');
  await expect
    .poll(async () => {
      const [state, renderedT] = await Promise.all([canvas.getAttribute('data-render-state'), canvas.getAttribute('data-rendered-t')]);
      return state === 'idle' && Math.abs(Number(renderedT) - t) < 0.005;
    })
    .toBe(true);
}

async function scrubTo(page: Page, t: number): Promise<void> {
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  await idle(page, t);
}

test('six stacked layers: the preview keeps at most visible active clips + KEEP_RECENT decoders; hidden layers get none', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await stacked(page, 6, 4);
  const positions = [0.25, 0.75, 1.25, 1.75, 0.25];
  for (const t of positions) {
    await scrubTo(page, t);
    const s = await stats(page);
    expect(s.open, `at ${t}`).toBeGreaterThanOrEqual(6);
    expect(s.open, `at ${t}`).toBeLessThanOrEqual(6 + KEEP_RECENT);
  }
  expect((await stats(page)).peak).toBeLessThanOrEqual(6 + KEEP_RECENT);

  // Hide two layers: their decoders close, and scrubbing opens decoders only for the four visible layers.
  await header(page, 'L1').getByTestId('track-btn-hide').click();
  await header(page, 'L4').getByTestId('track-btn-hide').click();
  await expect.poll(async () => (await stats(page)).open).toBeLessThanOrEqual(4 + KEEP_RECENT);
  await idle(page, 0.25);
  const before = await stats(page);
  await scrubTo(page, 0.75);
  const hidden = await stats(page);
  expect(hidden.opened - before.opened).toBe(4);
  expect(hidden.open).toBeLessThanOrEqual(4 + KEEP_RECENT);

  // Unhiding opens exactly the decoders of the two layers' active clips.
  await header(page, 'L1').getByTestId('track-btn-hide').click();
  await header(page, 'L4').getByTestId('track-btn-hide').click();
  await expect.poll(async () => (await stats(page)).opened - hidden.opened).toBe(2);
  await idle(page, 0.75);
  const shown = await stats(page);
  expect(shown.opened - hidden.opened).toBe(2);
  expect(shown.open).toBeGreaterThanOrEqual(6);
  expect(shown.open).toBeLessThanOrEqual(6 + KEEP_RECENT);
  expect(shown.peak).toBeLessThanOrEqual(6 + KEEP_RECENT);
  expect(errors).toEqual([]);
});

function exportTempEntries(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    try {
      const dir = (await root.getDirectoryHandle('clipforge-export')) as unknown as { keys(): AsyncIterable<string> };
      for await (const n of dir.keys()) names.push(n);
    } catch {
      // No export ever ran: no directory.
    }
    return names;
  });
}

const present = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));

test('merge all refuses before exporting when a track holding clips is locked; an empty locked first layer does not block it', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await stacked(page, 2, 2);
  await header(page, 'L1').getByTestId('track-btn-lock').click();
  const before = await present(page);
  const depth = (await playerState(page)).undoDepth;

  await page.getByTestId('btn-merge-all').click();
  await expectOnlyToast(page, 'Track is locked');
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  expect(await exportTempEntries(page)).toEqual([]);
  expect(await present(page)).toBe(before);
  expect((await playerState(page)).undoDepth).toBe(depth);
  await expect(page.getByTestId('media-item')).toHaveCount(1);

  // Empty the first layer and lock it instead: merging is allowed and leaves it unlocked with the merged clip.
  await header(page, 'L1').getByTestId('track-btn-lock').click();
  await page.evaluate(() =>
    window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'L0' ? { ...t, clips: [] } : t)) })),
  );
  await header(page, 'L0').getByTestId('track-btn-lock').click();
  await expect(header(page, 'L0').getByTestId('track-btn-lock')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('btn-merge-all').click();
  await expect(page.getByTestId('export-dialog')).toHaveCount(0, { timeout: 150_000 });
  const tracks = await page.evaluate(() =>
    window.__clipforge!.getState().history.present.tracks.map((t) => ({ id: t.id, locked: t.locked, clips: t.clips.length })),
  );
  expect(tracks).toEqual([
    { id: 'L0', locked: false, clips: 1 },
    { id: 'L1', locked: false, clips: 0 },
    { id: 'A', locked: false, clips: 0 },
  ]);
  await expect.poll(() => exportTempEntries(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('switching to Vertical keeps a customised PiP in place relative to the frame, refits untouched clips; undo restores', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const field = (name: string): Locator => page.getByTestId(`inspector-${name}`);
  for (const [name, value] of [['x', '600'], ['y', '-300'], ['scale', '50']]) {
    await field(name).fill(value);
    await field(name).press('Enter');
  }
  await expect.poll(() => transformOf(page, 'pip')).toEqual({ x: 600, y: -300, scale: 0.5, rotation: 0, opacity: 1 });
  // Top-right quadrant of 1920×1080: (1560, 240) relative (0.8125, 0.222).
  await expectPixel(page, 1560, 240, isGreen, 'PiP before the switch');
  const pipBefore = await transformOf(page, 'pip');
  const bgBefore = await transformOf(page, 'bg');
  const depth = await undoDepth(page);

  await page.getByTestId('format-select').selectOption('vertical');
  await expect.poll(() => page.evaluate(() => window.__clipforge!.getState().history.present.format.width)).toBe(1080);
  expect(await undoDepth(page)).toBe(depth + 1);
  const pip = await transformOf(page, 'pip');
  expect(pip.x).toBeCloseTo(600 * (1080 / 1920), 6);
  expect(pip.y).toBeCloseTo(-300 * (1920 / 1080), 6);
  // Ruling J: scale × √(area ratio); 16:9 ↔ 9:16 keeps the area, so the scale stays.
  expect(pip.scale).toBeCloseTo(0.5 * Math.sqrt((1080 * 1920) / (1920 * 1080)), 6);
  expect([pip.rotation, pip.opacity]).toEqual([0, 1]);
  // The blue 192×108 background was untouched (fit at 10×): it refits to the new canvas.
  expect(await transformOf(page, 'bg')).toEqual({ x: 0, y: 0, scale: 1080 / 192, rotation: 0, opacity: 1 });
  // Same relative spot of the 1080×1920 frame: (0.8125·1080, 0.222·1920).
  await expectPixel(page, 1080 * 0.8125, 1920 * (240 / 1080), isGreen, 'PiP after the switch');

  // Square and back: the round trip restores the placement exactly (one undo step each way).
  await page.getByTestId('format-select').selectOption('square');
  await page.getByTestId('format-select').selectOption('vertical');
  await expect.poll(() => undoDepth(page)).toBe(depth + 3);
  const trip = await transformOf(page, 'pip');
  for (const k of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) expect(Math.abs(trip[k] - pip[k]), k).toBeLessThanOrEqual(1e-9);
  for (let i = 0; i < 2; i++) await page.getByTestId('btn-undo').click();

  await page.getByTestId('btn-undo').click();
  await expect.poll(() => page.evaluate(() => window.__clipforge!.getState().history.present.format.width)).toBe(1920);
  expect(await transformOf(page, 'pip')).toEqual(pipBefore);
  expect(await transformOf(page, 'bg')).toEqual(bgBefore);
  await expectPixel(page, 1560, 240, isGreen, 'PiP after undo');
  expect(errors).toEqual([]);
});
