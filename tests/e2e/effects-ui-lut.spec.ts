// LUT picker in the effects inspector (Plan 4 Task 10): import, names, use, remove, missing indicator, bin feedback.
import { test, expect } from '@playwright/test';
import { expectOnlyToast, toast } from './helpers';
import { pixelAt } from './pip-helpers';
import { INVERT, cubeText } from './lut-helpers';
import { depth, effects, f, setupImage } from './effects-ui-helpers';

test.setTimeout(90_000);
const cube = (title: string) => Buffer.from(cubeText(2, INVERT, [`TITLE "${title}"`]));
const mediaOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => Object.values(window.__clipforge!.getState().history.present.media).filter((m) => m.kind === 'lut'));

test('import a LUT, see its name and file name, use it, refuse removal while used, remove when unused', async ({ page }) => {
  await setupImage(page);
  await expect.poll(async () => (await pixelAt(page, 960, 540))[2] > 150).toBe(true);
  const plain = await pixelAt(page, 960, 540);
  await f(page, 'fx-lut-import').setInputFiles({ name: 'warm.cube', mimeType: 'text/plain', buffer: cube('Film 1') });
  await expect.poll(async () => (await mediaOf(page)).length).toBe(1);
  const [lut] = await mediaOf(page);
  const row = f(page, `fx-lut-${lut.id}`);
  await expect(row).toContainText('Film 1');
  await expect(row).toContainText('warm.cube');
  await expect(f(page, `fx-lut-select-${lut.id}`)).toBeEnabled();

  const d0 = await depth(page);
  await f(page, `fx-lut-select-${lut.id}`).click();
  expect(await depth(page)).toBe(d0 + 1);
  const [fx] = await effects(page);
  expect(fx).toMatchObject({ type: 'lut', ref: lut.id });
  await expect(f(page, `fx-${fx.id}`)).toContainText('Film 1');
  await expect.poll(async () => Math.abs((await pixelAt(page, 960, 540))[0] - (255 - plain[0])) <= 3).toBe(true);

  await f(page, `fx-lut-remove-${lut.id}`).click();
  await expectOnlyToast(page, 'Cannot remove Film 1. It is used by 1 clip on the timeline.');
  expect(await mediaOf(page)).toHaveLength(1);

  await f(page, `fx-${fx.id}-remove`).click();
  await f(page, `fx-lut-remove-${lut.id}`).click();
  await expect.poll(async () => (await mediaOf(page)).length).toBe(0);
  await expect(f(page, `fx-lut-${lut.id}`)).toHaveCount(0);
});

test('a LUT effect whose file is missing shows a missing indicator', async ({ page }) => {
  await setupImage(page);
  await f(page, 'fx-lut-import').setInputFiles({ name: 'a.cube', mimeType: 'text/plain', buffer: cube('Gone') });
  await expect.poll(async () => (await mediaOf(page)).length).toBe(1);
  const [lut] = await mediaOf(page);
  await f(page, `fx-lut-select-${lut.id}`).click();
  const [fx] = await effects(page);
  await expect(f(page, `fx-${fx.id}-missing`)).toHaveCount(0);
  await page.evaluate((id) => {
    window.__clipforge!.getState().apply((p) => ({ ...p, media: { ...p.media, [id]: { ...p.media[id], missing: true } } }));
  }, lut.id);
  await expect(f(page, `fx-${fx.id}-missing`)).toBeVisible();
  await expect(f(page, `fx-lut-select-${lut.id}`)).toBeDisabled();
});

test('a .cube chosen on the media bin Import button gives feedback; a bad one explains why', async ({ page }) => {
  await setupImage(page);
  await page.getByTestId('file-input').setInputFiles({ name: 'bin.cube', mimeType: 'text/plain', buffer: cube('Bin LUT') });
  await expect(page.getByTestId('info-toast')).toContainText('Bin LUT');
  await expect(page.getByTestId('info-toast')).toContainText('Effects');
  await expect(f(page, 'fx-luts')).toContainText('Bin LUT');
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  await page.getByTestId('file-input').setInputFiles({ name: 'bad.cube', mimeType: 'text/plain', buffer: Buffer.from('nonsense') });
  await expect(toast(page)).toHaveCount(1);
  await expect(toast(page)).toContainText('bad.cube');
});
