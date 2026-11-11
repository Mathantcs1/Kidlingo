// Blend failure policy (Plan 4 Task 11a fix round): a blend shader that cannot compile costs one toast and the blend
// (the clip draws as Normal), never the preview or the export; the export says so in its notice.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipEl, setPlayhead, trackErrors } from './helpers';
import { f, setupImage } from './effects-ui-helpers';
import { pixelAt } from './pip-helpers';
import { BLEND_UNAVAILABLE_MESSAGE } from '../../src/render/effects/unavailable';

test.setTimeout(180_000);

const toasts = (page: Page) => page.getByTestId('error-toast').filter({ hasText: BLEND_UNAVAILABLE_MESSAGE });

test('a blend shader that cannot compile: one toast, the clip draws as Normal, the export finishes with a notice', async ({ page }) => {
  const errors = trackErrors(page);
  const clipId = await setupImage(page);
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({
    ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, out: c.in + 0.3 })) })),
  })));
  await clipEl(page, clipId).click();
  await expect.poll(async () => (await pixelAt(page, 960, 540))[2] > 150).toBe(true);
  // Blend programs compile on the first blended frame, so this reaches the preview and the export compositor.
  await page.evaluate(() => window.__clipforge!.breakBlendProgram());
  await f(page, 'blend-mode-select').selectOption('multiply');
  await expect.poll(async () => (await pixelAt(page, 960, 540))[2] > 150).toBe(true);
  await page.getByTestId('btn-export').click();
  await page.getByTestId('btn-export-start').click();
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('export-notice')).toHaveText(
    'Exported with blend modes drawn as Normal (this device cannot run them).',
  );
  expect(errors).toEqual([]);
});

test('the preview shows the blend-unavailable toast exactly once and keeps drawing', async ({ page }) => {
  const errors = trackErrors(page);
  const clipId = await setupImage(page);
  await clipEl(page, clipId).click();
  // The blend program compiles on the first blended frame, so breaking it now reaches the running preview.
  await page.evaluate(() => window.__clipforge!.breakBlendProgram());
  await f(page, 'blend-mode-select').selectOption('multiply');
  await expect(toasts(page)).toBeVisible();
  for (const t of [0.1, 0.2, 0]) await setPlayhead(page, t);
  await expect.poll(async () => (await pixelAt(page, 960, 540))[2] > 150).toBe(true);
  await expect(toasts(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});
