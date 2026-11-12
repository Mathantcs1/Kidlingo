// Plan 5 Task 7: keyframes for effect parameters in the effects inspector (stopwatch, key, strip per animatable param,
// the chroma key colour as one group), on a picture clip and on an adjustment layer; overlays have no effects UI.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, toast, trackErrors } from './helpers';
import { solidPng } from './lut-helpers';
import { pixelAt } from './pip-helpers';
import { addEffect, depth, dragSlider, effects, f, setupImage } from './effects-ui-helpers';
import type { Clip, VideoEffect } from '../../src/core/model';

test.setTimeout(90_000);

const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const projectJson = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const centre = (page: Page) => pixelAt(page, 960, 540);
const brightKeys = async (page: Page) => ((await effects(page))[0].keys?.brightness ?? []).map((k) => [k.t, Math.round(k.v * 1000) / 1000]);
const kf = (id: string, param: string, part = '') => `fx-${id}-${param}-kf${part}`;

/** The image clip (0..2 s) with a Colour effect, playhead 0; brightness left static. */
async function setupColour(page: Page): Promise<{ id: string; plain: number[] }> {
  await setupImage(page);
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({
    ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, out: c.in + 2 })) })),
  })));
  await setTime(page, 0);
  await expect.poll(async () => (await centre(page))[2] > 150, { message: 'plain image' }).toBe(true);
  const plain = await centre(page);
  return { id: await addEffect(page, 'colour'), plain };
}

/** Brightness keyed -0.5 at 0 s and 0.5 at 1 s through the UI (stopwatch, then two slider commits). */
async function keyBrightness(page: Page, id: string): Promise<void> {
  const d0 = await depth(page);
  await page.getByTestId(kf(id, 'brightness')).click();
  await expect(page.getByTestId(kf(id, 'brightness'))).toHaveAttribute('aria-pressed', 'true');
  expect(await depth(page)).toBe(d0 + 1);
  expect(await brightKeys(page)).toEqual([[0, 0]]);
  await f(page, `fx-${id}-brightness`).fill('-0.5');
  await expect.poll(() => brightKeys(page)).toEqual([[0, -0.5]]);
  expect(await depth(page)).toBe(d0 + 2);
  await setTime(page, 1);
  await f(page, `fx-${id}-brightness`).fill('0.5');
  await expect.poll(() => brightKeys(page)).toEqual([[0, -0.5], [1, 0.5]]);
  expect(await depth(page)).toBe(d0 + 3);
}

test('animate Colour brightness -0.5 to 0.5: the slider and the preview follow the playhead', async ({ page }) => {
  const errors = trackErrors(page);
  const { id, plain } = await setupColour(page);
  await keyBrightness(page, id);
  expect((await effects(page))[0].params.brightness).toBe(0); // the stored value is untouched while animated
  const slider = f(page, `fx-${id}-brightness`);
  await setTime(page, 0.5);
  await expect(slider).toHaveValue('0');
  await expect.poll(async () => Math.max(...(await centre(page)).map((v, i) => Math.abs(v - plain[i])))).toBeLessThanOrEqual(2);
  await setTime(page, 0);
  await expect(slider).toHaveValue('-0.5');
  await expect.poll(async () => (await centre(page))[2]).toBeLessThan(plain[2] - 30);
  await setTime(page, 1);
  await expect(slider).toHaveValue('0.5');
  await expect.poll(async () => (await centre(page))[0]).toBeGreaterThan(plain[0] + 40);
  // 0.3 s (frame 9): brightness -0.2 sits between the two.
  await setTime(page, 0.3);
  await expect(slider).toHaveValue('-0.2');
  const q = (await centre(page))[2];
  expect(q).toBeLessThan(plain[2] - 5);
  expect(q).toBeGreaterThan(plain[2] - 100);
  // The strip shows both keys; Undo walks back one key per step.
  await expect(f(page, kf(id, 'brightness', '-strip')).getByTestId('kf-strip-key')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await brightKeys(page)).toEqual([[0, -0.5]]);
  expect(errors).toEqual([]);
});

test('every slider release writes ONE key; arrow presses are one step each; locked tracks disable the controls', async ({ page }) => {
  const { id } = await setupColour(page);
  await keyBrightness(page, id);
  const slider = f(page, `fx-${id}-brightness`);
  await setTime(page, 0.5);
  const d0 = await depth(page);
  await dragSlider(page, slider, 0.9);
  expect(await depth(page)).toBe(d0 + 1);
  expect((await brightKeys(page)).map((k) => k[0])).toEqual([0, 0.5, 1]);
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await depth(page)).toBe(d0 + 3);
  expect((await brightKeys(page)).map((k) => k[0])).toEqual([0, 0.5, 1]);
  // The key diamond under the playhead is pressed; previous/next jump to the neighbours without history.
  await expect(f(page, kf(id, 'brightness', '-key'))).toHaveAttribute('aria-pressed', 'true');
  await f(page, kf(id, 'brightness', '-next')).click();
  expect((await page.evaluate(() => window.__clipforge!.getState().playhead))).toBe(1);
  expect(await depth(page)).toBe(d0 + 3);
  // Locked track: the stopwatch, key and slider are disabled; navigation stays.
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, locked: true })) })));
  for (const t of [kf(id, 'brightness'), kf(id, 'brightness', '-key'), `fx-${id}-brightness`]) await expect(f(page, t)).toBeDisabled();
  await expect(f(page, kf(id, 'brightness', '-prev'))).toBeEnabled();
});

test('typing a value while the playhead is off the clip is refused with a toast', async ({ page }) => {
  const { id } = await setupColour(page);
  await keyBrightness(page, id);
  await setTime(page, 4);
  const d0 = await depth(page);
  await f(page, `fx-${id}-brightness`).fill('0.2');
  await expect(toast(page)).toContainText('playhead onto the clip');
  expect(await depth(page)).toBe(d0);
  expect(await brightKeys(page)).toEqual([[0, -0.5], [1, 0.5]]);
});

test('Mirror mode has no stopwatch and still edits statically; every other param has one', async ({ page }) => {
  await setupImage(page);
  const id = await addEffect(page, 'mirror');
  await expect(f(page, `fx-${id}-mode`)).toBeVisible();
  await expect(page.locator(`[data-testid^="fx-${id}-mode-kf"]`)).toHaveCount(0);
  const d0 = await depth(page);
  await f(page, `fx-${id}-mode`).fill('2');
  await expect.poll(async () => (await effects(page))[0].params.mode).toBe(2);
  expect(await depth(page)).toBe(d0 + 1);
  expect((await effects(page))[0].keys).toBeUndefined();
  const col = await addEffect(page, 'colour');
  for (const p of ['brightness', 'contrast', 'saturation']) await expect(f(page, kf(col, p))).toBeVisible();
});

test('removing an animated effect removes its keys in one step; Undo restores the effect and its keys exactly', async ({ page }) => {
  const { id } = await setupColour(page);
  await keyBrightness(page, id);
  const before = await projectJson(page);
  const d0 = await depth(page);
  await f(page, `fx-${id}-remove`).click();
  expect(await effects(page)).toEqual([]);
  expect(await depth(page)).toBe(d0 + 1);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await projectJson(page)).toBe(before);
  expect(await brightKeys(page)).toEqual([[0, -0.5], [1, 0.5]]);
});

test('applying a look replaces an animated stack in one step; Undo brings the keys back', async ({ page }) => {
  const { id } = await setupColour(page);
  await keyBrightness(page, id);
  const before = await projectJson(page);
  const d0 = await depth(page);
  await f(page, 'fx-look-tealOrange').click();
  expect(await depth(page)).toBe(d0 + 1);
  const stack = await effects(page);
  expect(stack.map((e: VideoEffect) => e.type)).toEqual(['colour', 'splitTone']);
  expect(stack.some((e: VideoEffect) => e.keys)).toBe(false);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await projectJson(page)).toBe(before);
});

test('chroma key: the colour is one animated group, each picker commit writes three keys in ONE step', async ({ page }) => {
  await setupImage(page);
  const id = await addEffect(page, 'chromaKey');
  await setTime(page, 0);
  const keysOf = async () => (await effects(page))[0].keys ?? {};
  const d0 = await depth(page);
  await f(page, kf(id, 'colour')).click();
  expect(await depth(page)).toBe(d0 + 1);
  expect(Object.keys(await keysOf()).sort()).toEqual(['keyB', 'keyG', 'keyR']);
  await f(page, `fx-${id}-colour`).fill('#ff0000');
  await expect.poll(async () => (await keysOf()).keyR?.[0].v).toBe(1);
  expect(await depth(page)).toBe(d0 + 2);
  await setTime(page, 1);
  await f(page, `fx-${id}-colour`).fill('#0000ff');
  await expect.poll(async () => (await keysOf()).keyB?.length).toBe(2);
  expect(await depth(page)).toBe(d0 + 3);
  const k = await keysOf();
  expect([k.keyR, k.keyG, k.keyB].map((l) => l.map((q) => q.v))).toEqual([[1, 0], [0, 0], [0, 1]]);
  expect((await effects(page))[0].params).toMatchObject({ keyR: 0, keyG: 1, keyB: 0 }); // stored colour untouched
  // Halfway the picker shows the interpolated colour.
  await setTime(page, 0.5);
  await expect(f(page, `fx-${id}-colour`)).toHaveValue('#800080');
  await page.keyboard.press('ControlOrMeta+z');
  expect((await keysOf()).keyB).toHaveLength(1);
  // The stopwatch turns the whole group off in one step, keeping the colour shown at the playhead.
  const d1 = await depth(page);
  await f(page, kf(id, 'colour')).click();
  expect(await depth(page)).toBe(d1 + 1);
  expect((await effects(page))[0].keys).toBeUndefined();
});

test('an adjustment layer animates its effect parameters', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [solidPng('red.png', '0xC81E1E')], 1);
  await addToTimeline(page, 'red.png', 1);
  await setTime(page, 0.5);
  await f(page, 'overlay-add').click();
  await f(page, 'overlay-add-adjustment').click();
  const adj = async (): Promise<Clip> => (await page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips))).find((c: Clip) => c.kind === 'adjustment')!;
  await expect.poll(async () => (await adj())?.kind).toBe('adjustment');
  const a = await adj();
  await expect(clipEl(page, a.id)).toHaveAttribute('data-selected', 'true');
  const id = await addEffect2(page, 'colour');
  await setTime(page, a.start);
  await f(page, kf(id, 'brightness')).click();
  await expect(f(page, kf(id, 'brightness'))).toHaveAttribute('aria-pressed', 'true');
  await setTime(page, a.start + 1);
  await f(page, `fx-${id}-brightness`).fill('0.6');
  await expect.poll(async () => ((await adj()).effects[0].keys?.brightness ?? []).length).toBe(2);
  expect((await adj()).effects[0].params.brightness).toBe(0);
  await setTime(page, a.start);
  await expect.poll(async () => (await centre(page))[1]).toBeLessThan(60);
  await setTime(page, a.start + 1);
  await expect.poll(async () => (await centre(page))[1]).toBeGreaterThan(80);
  expect(errors).toEqual([]);
});

/** Adds an effect to the selected clip (the adjustment layer) and returns its id. */
async function addEffect2(page: Page, type: string): Promise<string> {
  await f(page, 'fx-add').selectOption(type);
  await f(page, 'fx-add-button').click();
  const stack = () => page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.kind === 'adjustment')!.effects);
  await expect.poll(async () => (await stack()).length).toBe(1);
  return (await stack())[0].id;
}

test('overlays have no effects UI and no keyframe controls for effects', async ({ page }) => {
  await open(page);
  await importFiles(page, [solidPng('bg.png', '0x202020')], 1);
  await addToTimeline(page, 'bg.png', 1);
  await f(page, 'overlay-add').click();
  await f(page, 'overlay-add-sticker').click();
  await expect(f(page, 'overlay-sticker')).toBeVisible();
  await expect(f(page, 'fx-panel')).toHaveCount(0);
  await expect(page.locator('[data-testid^="fx-"][data-testid$="-kf"]')).toHaveCount(0);
  expect(await clipStates(page)).toHaveLength(2);
});
