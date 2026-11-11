// Effects inspector (Plan 4 Task 10): add/edit/toggle/reorder/remove, looks, the 8-effect cap, locked tracks, keyboard.
import { test, expect } from '@playwright/test';
import { clipStates, expectOnlyToast, trackErrors } from './helpers';
import { pixelAt } from './pip-helpers';
import { addEffect, depth, dragSlider, effects, f, setupImage } from './effects-ui-helpers';

test.setTimeout(90_000);
const centre = (page: Parameters<typeof pixelAt>[0]) => pixelAt(page, 960, 540);
const waitPixel = (page: Parameters<typeof pixelAt>[0], ok: (p: number[]) => boolean, why: string) =>
  expect.poll(async () => ok(await centre(page)), { message: why }).toBe(true);

test('Colour: the brightness slider changes the preview and a drag is ONE undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await setupImage(page);
  await waitPixel(page, (p) => p[2] > 150, 'plain image');
  const plain = await centre(page);
  const id = await addEffect(page, 'colour');
  const d0 = await depth(page);
  await dragSlider(page, f(page, `fx-${id}-brightness`), 0.95);
  expect(await depth(page)).toBe(d0 + 1);
  const b = (await effects(page))[0].params.brightness;
  expect(b).toBeGreaterThan(0.5);
  await waitPixel(page, (p) => p[0] > plain[0] + 40, 'brighter');
  await page.keyboard.press('ControlOrMeta+z');
  expect((await effects(page))[0].params.brightness).toBe(0);
  await waitPixel(page, (p) => Math.abs(p[0] - plain[0]) <= 2, 'plain again');
  expect(errors).toEqual([]);
});

test('the toggle disables the effect in one step and the pixel returns', async ({ page }) => {
  await setupImage(page);
  await waitPixel(page, (p) => p[2] > 150, 'plain image');
  const plain = await centre(page);
  const id = await addEffect(page, 'invert');
  await waitPixel(page, (p) => Math.abs(p[0] - (255 - plain[0])) <= 3, 'inverted');
  const d0 = await depth(page);
  await f(page, `fx-${id}-toggle`).uncheck();
  expect(await depth(page)).toBe(d0 + 1);
  expect((await effects(page))[0].enabled).toBe(false);
  await waitPixel(page, (p) => Math.abs(p[0] - plain[0]) <= 2, 'plain again');
  await expect(f(page, `fx-${id}-brightness`)).toHaveCount(0);
});

test('reordering changes the result of order-dependent effects; remove is one step', async ({ page }) => {
  await setupImage(page);
  await waitPixel(page, (p) => p[2] > 150, 'plain image');
  const inv = await addEffect(page, 'invert');
  const col = await addEffect(page, 'colour');
  await f(page, `fx-${col}-brightness`).fill('0.4');
  await expect.poll(async () => (await effects(page))[1].params.brightness).toBe(0.4);
  await expect(f(page, 'fx-order-note')).toContainText('top to bottom');
  await expect(f(page, `fx-${inv}-up`)).toBeDisabled();
  await expect(f(page, `fx-${col}-down`)).toBeDisabled();
  await page.waitForTimeout(300);
  const invertThenColour = await centre(page);
  const d0 = await depth(page);
  await f(page, `fx-${col}-up`).click();
  expect(await depth(page)).toBe(d0 + 1);
  expect((await effects(page)).map((e) => e.type)).toEqual(['colour', 'invert']);
  await expect.poll(async () => Math.abs((await centre(page))[0] - invertThenColour[0])).toBeGreaterThan(30);
  await f(page, `fx-${col}-remove`).click();
  expect((await effects(page)).map((e) => e.type)).toEqual(['invert']);
  expect(await depth(page)).toBe(d0 + 2);
});

test('the looks gallery applies Teal & Orange in ONE step and Undo restores the previous stack exactly', async ({ page }) => {
  await setupImage(page);
  await addEffect(page, 'blur');
  const before = await effects(page);
  const d0 = await depth(page);
  await f(page, 'fx-look-tealOrange').click();
  expect(await depth(page)).toBe(d0 + 1);
  expect((await effects(page)).map((e) => e.type)).toEqual(['colour', 'splitTone']);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await effects(page)).toEqual(before);
  expect(await depth(page)).toBe(d0);
});

test('the 9th effect is refused with a plain-English toast', async ({ page }) => {
  await setupImage(page);
  for (let i = 0; i < 8; i++) await addEffect(page, 'invert');
  const d0 = await depth(page);
  await f(page, 'fx-add').selectOption('mirror');
  await f(page, 'fx-add-button').click();
  await expectOnlyToast(page, 'At most 8 effects per clip');
  expect((await effects(page)).length).toBe(8);
  expect(await depth(page)).toBe(d0);
});

test('a clip on a locked track has every effect control disabled', async ({ page }) => {
  await setupImage(page);
  const id = await addEffect(page, 'colour');
  const track = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks[0].id);
  await page.locator(`[data-testid="track-header"][data-track-id="${track}"]`).getByTestId('track-btn-lock').click();
  for (const t of ['fx-add', 'fx-add-button', 'fx-look-tealOrange', `fx-${id}-toggle`, `fx-${id}-remove`, `fx-${id}-brightness`]) {
    await expect(f(page, t), t).toBeDisabled();
  }
  const before = await effects(page);
  await f(page, 'fx-look-bw').click({ force: true });
  expect(await effects(page)).toEqual(before);
});

test('keyboard: Enter adds, arrows move a slider one step each, Delete in a slider keeps the clip', async ({ page }) => {
  await setupImage(page);
  await f(page, 'fx-add').selectOption('colour');
  await f(page, 'fx-add').press('Enter');
  await expect.poll(async () => (await effects(page)).length).toBe(1);
  await f(page, 'fx-add').selectOption('invert');
  await f(page, 'fx-add-button').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await effects(page)).length).toBe(2);
  const id = (await effects(page))[0].id;
  const slider = f(page, `fx-${id}-brightness`);
  await slider.focus();
  const d0 = await depth(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await effects(page))[0].params.brightness).toBeCloseTo(0.02, 5);
  expect(await depth(page)).toBe(d0 + 2);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect(await clipStates(page)).toHaveLength(1);
  expect(await depth(page)).toBe(d0 + 2);
});

test('chroma key: the colour picker commits all three channels in one step, with the neutral-colour hint', async ({ page }) => {
  await setupImage(page);
  const id = await addEffect(page, 'chromaKey');
  await expect(f(page, `fx-${id}-hint`)).toContainText('grey');
  const d0 = await depth(page);
  await f(page, `fx-${id}-colour`).fill('#ff8000');
  expect(await depth(page)).toBe(d0 + 1);
  const p = (await effects(page))[0].params;
  expect([p.keyR, p.keyG, p.keyB]).toEqual([1, 128 / 255, 0]);
  await page.keyboard.press('Delete');
  expect(await clipStates(page)).toHaveLength(1);
});
