// Numeric transform fields in the inspector: position, scale, rotation and opacity of one visual clip, each a
// single undo step, with invalid entries and Escape reverting the draft.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { PPS, addToTimeline, clipEl, clipStates, importFiles, open, playerState, tone, trackErrors } from './helpers';
import type { Transform } from '../../src/core/model';

test.setTimeout(60_000);

/** A 360×360 lime PNG: fitted into the default 1920×1080 frame at scale 3, covering x 420..1500, y 0..1080. */
function greenSquare(): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'green.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=lime:s=360x360', '-frames:v', '1', out], {
    stdio: 'pipe',
  });
  return out;
}

const field = (page: Page, name: string): Locator => page.getByTestId(`inspector-${name}`);

function transformOf(page: Page, id: string): Promise<Transform> {
  return page.evaluate(
    (id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.transform,
    id,
  );
}

const undoDepth = async (page: Page): Promise<number> => (await playerState(page)).undoDepth;

/** RGB of the preview at format pixel (fx, fy), through the letterbox the compositor draws into. */
function pixelAt(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.evaluate(
    ({ fx, fy }) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const f = window.__clipforge!.getState().history.present.format;
      const s = Math.min(c.width / f.width, c.height / f.height);
      const x0 = Math.floor((c.width - Math.round(f.width * s)) / 2);
      const y0 = Math.floor((c.height - Math.round(f.height * s)) / 2);
      const o = document.createElement('canvas');
      o.width = c.width;
      o.height = c.height;
      const ctx = o.getContext('2d')!;
      ctx.drawImage(c, 0, 0);
      return [...ctx.getImageData(Math.floor(x0 + fx * s), Math.floor(y0 + fy * s), 1, 1).data.slice(0, 3)];
    },
    { fx, fy },
  );
}

const isGreen = (p: number[]): boolean => p[1] > 180 && p[0] < 80 && p[2] < 80;
const isBlack = (p: number[]): boolean => p[0] < 20 && p[1] < 20 && p[2] < 20;

/** Imports the green square (and a tone), adds the square to the timeline at 0 and selects it. */
async function setup(page: Page): Promise<{ id: string; audioId: string }> {
  await open(page);
  await importFiles(page, [greenSquare(), tone], 2);
  await addToTimeline(page, 'green.png', 1);
  await addToTimeline(page, 'tone.wav', 2);
  const [img, audio] = await clipStates(page);
  await page.getByTestId('timeline-ruler').click({ position: { x: 1 * PPS, y: 8 } });
  await clipEl(page, img.id).click();
  return { id: img.id, audioId: audio.id };
}

async function enter(page: Page, name: string, value: string): Promise<void> {
  await field(page, name).fill(value);
  await field(page, name).press('Enter');
}

test('the fields show the selected clip, and a value commits one undo step', async ({ page }) => {
  const errors = trackErrors(page);
  const { id } = await setup(page);
  await expect(field(page, 'x')).toHaveValue('0');
  await expect(field(page, 'y')).toHaveValue('0');
  await expect(field(page, 'scale')).toHaveValue('300');
  await expect(field(page, 'rotation')).toHaveValue('0');
  await expect(field(page, 'opacity')).toHaveValue('100');

  const depth = await undoDepth(page);
  await enter(page, 'opacity', '50');
  expect((await transformOf(page, id)).opacity).toBe(0.5);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(field(page, 'opacity')).toHaveValue('50');
  // Enter again, or leaving the field, without a change adds nothing.
  await field(page, 'opacity').press('Enter');
  await field(page, 'opacity').blur();
  expect(await undoDepth(page)).toBe(depth + 1);

  await page.getByTestId('btn-undo').click();
  expect((await transformOf(page, id)).opacity).toBe(1);
  await expect(field(page, 'opacity')).toHaveValue('100');
  // The inspector's other controls are still there.
  await expect(page.getByTestId('inspector-fit')).toBeVisible();
  expect(errors).toEqual([]);
});

test('scale and X/Y change what the preview shows', async ({ page }) => {
  const { id } = await setup(page);
  await expect.poll(async () => isGreen(await pixelAt(page, 500, 100)), { timeout: 10_000 }).toBe(true);

  await enter(page, 'scale', '25'); // 90×90 in the centre
  expect((await transformOf(page, id)).scale).toBe(0.25);
  await expect.poll(async () => isBlack(await pixelAt(page, 500, 100)), { timeout: 10_000 }).toBe(true);
  expect(isGreen(await pixelAt(page, 960, 540))).toBe(true);

  await enter(page, 'x', '600');
  // Leaving the field (Tab) commits too.
  await field(page, 'y').fill('-300');
  await field(page, 'y').press('Tab');
  expect(await transformOf(page, id)).toMatchObject({ x: 600, y: -300, scale: 0.25 });
  await expect.poll(async () => isGreen(await pixelAt(page, 1560, 240)), { timeout: 10_000 }).toBe(true);
  expect(isBlack(await pixelAt(page, 960, 540))).toBe(true);
});

test('invalid entries and Escape revert the draft with no change and no undo step', async ({ page }) => {
  const { id } = await setup(page);
  const before = await transformOf(page, id);
  const depth = await undoDepth(page);

  for (const bad of ['abc', '', '1e999', '12px']) {
    await enter(page, 'x', bad);
    await expect(field(page, 'x')).toHaveValue('0');
    await expect(field(page, 'x')).toHaveAttribute('aria-invalid', 'true');
  }
  // The next edit clears the invalid mark.
  await field(page, 'x').fill('5');
  await expect(field(page, 'x')).not.toHaveAttribute('aria-invalid', 'true');
  await field(page, 'x').press('Escape');
  await expect(field(page, 'x')).toHaveValue('0');
  await field(page, 'rotation').fill('77');
  await field(page, 'rotation').press('Escape');
  await expect(field(page, 'rotation')).toHaveValue('0');
  await field(page, 'rotation').blur();
  expect(await transformOf(page, id)).toEqual(before);
  expect(await undoDepth(page)).toBe(depth);
  await expect(page.getByTestId('error-toast')).toHaveCount(0);
});

test('arrow keys step the draft (Shift ×10) and commit once on Enter', async ({ page }) => {
  const { id } = await setup(page);
  const depth = await undoDepth(page);
  const rot = field(page, 'rotation');
  await rot.focus();
  await rot.press('ArrowUp');
  await rot.press('ArrowUp');
  await rot.press('Shift+ArrowUp');
  await rot.press('ArrowDown');
  await expect(rot).toHaveValue('11');
  expect((await transformOf(page, id)).rotation).toBe(0);
  await rot.press('Enter');
  expect((await transformOf(page, id)).rotation).toBe(11);
  expect(await undoDepth(page)).toBe(depth + 1);
});

test('Reset restores the fit transform in one undo step', async ({ page }) => {
  const { id } = await setup(page);
  const fitted = await transformOf(page, id);
  await enter(page, 'x', '-200');
  await enter(page, 'rotation', '45');
  await enter(page, 'opacity', '30');
  const moved = await transformOf(page, id);
  const depth = await undoDepth(page);
  await page.getByTestId('inspector-transform-reset').click();
  expect(await transformOf(page, id)).toEqual(fitted);
  expect(await undoDepth(page)).toBe(depth + 1);
  await expect(field(page, 'x')).toHaveValue('0');
  // Reset on an already fitted clip adds no undo step.
  await page.getByTestId('inspector-transform-reset').click();
  expect(await undoDepth(page)).toBe(depth + 1);
  await page.getByTestId('btn-undo').click();
  expect(await transformOf(page, id)).toEqual(moved);
  await expect(field(page, 'rotation')).toHaveValue('45');
});

test('the fields are disabled on a locked track and absent for an audio clip', async ({ page }) => {
  const { id, audioId } = await setup(page);
  const trackId = (await clipStates(page)).find((c) => c.id === id)!.trackId;
  await page.locator(`[data-testid="track-header"][data-track-id="${trackId}"]`).getByTestId('track-btn-lock').click();
  await clipEl(page, id).click();
  for (const name of ['x', 'y', 'scale', 'rotation', 'opacity', 'transform-reset']) {
    await expect(field(page, name)).toBeDisabled();
    await expect(field(page, name)).toHaveAttribute('title', /locked/);
  }
  await clipEl(page, audioId).click();
  await expect(page.getByTestId('inspector-volume')).toBeVisible();
  for (const name of ['x', 'y', 'scale', 'rotation', 'opacity', 'transform-reset']) await expect(field(page, name)).toHaveCount(0);
});
