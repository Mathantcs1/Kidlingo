// Plan 4 Task 9: the effects inspector, look gallery, LUT import, copy/paste, compare toggle and the clip badge.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { PPS, addToTimeline, center, clipEl, clipStates, drag, importFiles, open, toast, tone, trackErrors } from './helpers';
import { pixelAt, undoDepth } from './pip-helpers';

test.setTimeout(180_000);

const f = (page: Page, id: string): Locator => page.getByTestId(id);
const GREEN = [30, 200, 60];

function png(name: string, color = '0x1ec83c'): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, name);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=64x64`, '-frames:v', '1', out], { stdio: 'pipe' });
  return out;
}

async function setup(page: Page, files: string[], name: string): Promise<string> {
  await open(page);
  await importFiles(page, files, files.length);
  await addToTimeline(page, name, 1);
  const [c] = await clipStates(page);
  await clipEl(page, c.id).click();
  return c.id;
}

const pix = (page: Page): Promise<number[]> => pixelAt(page, 960, 540);
const near = (a: number[], b: number[], tol: number): boolean => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const waitPix = (page: Page, ok: (p: number[]) => boolean): Promise<void> => expect.poll(async () => ok(await pix(page))).toBe(true);

async function setRange(loc: Locator, value: number): Promise<void> {
  await loc.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function addFx(page: Page, type: string): Promise<void> {
  await f(page, 'fx-add').selectOption(type);
  await f(page, 'fx-add-button').click();
}

const rows = (page: Page): Locator => f(page, 'fx-inspector').locator('li[data-type]');
async function rowId(page: Page, index: number): Promise<string> {
  return ((await rows(page).nth(index).getAttribute('data-testid')) ?? '').slice(3);
}
const present = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present);
const clipFx = (page: Page, id: string) =>
  page.evaluate((id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.fx, id);

test('the Effects section shows for picture clips only', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [png('still.png'), tone], 2);
  await addToTimeline(page, 'still.png', 1);
  await addToTimeline(page, 'tone.wav', 2);
  const states = await clipStates(page);
  const video = states.find((c) => c.trackKind === 'video')!;
  const audio = states.find((c) => c.trackKind === 'audio')!;
  await clipEl(page, video.id).click();
  await expect(f(page, 'fx-inspector')).toBeVisible();
  await clipEl(page, audio.id).click();
  await expect(f(page, 'fx-inspector')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('add an effect, drag a slider (one undo step), toggle it, and the preview follows', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page, [png('still.png')], 'still.png');
  await waitPix(page, (p) => near(p, GREEN, 6));
  const d0 = await undoDepth(page);
  await addFx(page, 'color');
  expect(await undoDepth(page)).toBe(d0 + 1);
  const id = await rowId(page, 0);
  const before = await present(page);
  await setRange(f(page, `fx-${id}-brightness`), 1);
  expect(await undoDepth(page)).toBe(d0 + 2);
  await waitPix(page, (p) => p[0] > 140);
  await f(page, 'btn-undo').click();
  expect(await present(page)).toEqual(before);
  await waitPix(page, (p) => near(p, GREEN, 6));
  await f(page, 'btn-redo').click();
  await f(page, `fx-${id}-toggle`).uncheck();
  await waitPix(page, (p) => near(p, GREEN, 6));
  await expect(f(page, 'clip-fx-badge')).toHaveCount(0);
  await f(page, `fx-${id}-toggle`).check();
  await expect(f(page, 'clip-fx-badge')).toContainText('1');
  expect(errors).toEqual([]);
});

test('reordering effects that do not commute changes the picture; Reset restores defaults; remove works', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  await addFx(page, 'color');
  await addFx(page, 'invert');
  const colorId = await rowId(page, 0);
  await setRange(f(page, `fx-${colorId}-brightness`), 1);
  await waitPix(page, (p) => p[1] < 80);
  const first = await pix(page);
  await f(page, `fx-${colorId}-down`).click();
  await expect.poll(async () => Math.abs((await pix(page))[0] - first[0])).toBeGreaterThan(30);
  await f(page, `fx-${colorId}-reset`).click();
  expect((await clipFx(page, (await clipStates(page))[0].id)).find((e) => e.id === colorId)!.params.brightness).toBe(0);
  await f(page, `fx-${colorId}-remove`).click();
  await expect(rows(page)).toHaveCount(1);
});

test('a 13th effect is refused with a toast', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  for (let i = 0; i < 12; i++) await addFx(page, 'invert');
  await expect(rows(page)).toHaveCount(12);
  await addFx(page, 'invert');
  await expect(toast(page)).toContainText('at most 12');
  await expect(rows(page)).toHaveCount(12);
});

test('a look is one effect: click applies it, the intensity slider commits once on release, another look replaces it', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  const d0 = await undoDepth(page);
  await f(page, 'look-gallery').isVisible();
  await f(page, 'look-tealOrange').click();
  expect(await undoDepth(page)).toBe(d0 + 1);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute('data-type', 'look');
  await expect(f(page, 'look-tealOrange')).toHaveAttribute('aria-pressed', 'true');
  await setRange(f(page, 'look-intensity'), 0.4);
  expect(await undoDepth(page)).toBe(d0 + 2);
  const id = (await clipStates(page))[0].id;
  expect((await clipFx(page, id))[0].params.intensity).toBeCloseTo(0.4, 5);
  await f(page, 'look-moody').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(f(page, 'look-moody')).toHaveAttribute('aria-pressed', 'true');
  expect((await clipFx(page, id))[0].params.preset).toBe(1);
});

test('Copy then Paste duplicates the stack onto another clip with new ids, in one undo step', async ({ page }) => {
  await open(page);
  await importFiles(page, [png('still.png')], 1);
  await addToTimeline(page, 'still.png', 1);
  await addToTimeline(page, 'still.png', 2);
  const [a, b] = (await clipStates(page)).sort((x, y) => x.start - y.start);
  await clipEl(page, a.id).click();
  await addFx(page, 'blur');
  await addFx(page, 'sepia');
  await f(page, 'fx-copy').click();
  await clipEl(page, b.id).click();
  const d0 = await undoDepth(page);
  await f(page, 'fx-paste').click();
  expect(await undoDepth(page)).toBe(d0 + 1);
  const fa = await clipFx(page, a.id);
  const fb = await clipFx(page, b.id);
  expect(fb.map((e) => e.type)).toEqual(['blur', 'sepia']);
  expect(fb.some((e) => fa.some((x) => x.id === e.id))).toBe(false);
  await f(page, 'btn-undo').click();
  expect(await clipFx(page, b.id)).toEqual([]);
});

test('a locked track disables the controls; hiding the layer keeps them editable', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  await addFx(page, 'blur');
  const id = await rowId(page, 0);
  const header = page.locator('[data-testid="track-header"][data-track-kind="video"]');
  await header.getByTestId('track-btn-hide').click();
  await expect(f(page, `fx-${id}-blur`.replace('-blur', '-radius'))).toBeEnabled();
  await header.getByTestId('track-btn-hide').click();
  await header.getByTestId('track-btn-lock').click();
  await expect(f(page, 'fx-add')).toBeDisabled();
  await expect(f(page, 'look-cinematic')).toBeDisabled();
  await expect(f(page, `fx-${id}-toggle`)).toBeDisabled();
  await expect(f(page, `fx-${id}-remove`)).toBeDisabled();
});

test('the backslash key and the button show the preview without effects; project and history are untouched', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  await addFx(page, 'invert');
  await waitPix(page, (p) => near(p, [225, 55, 195], 8));
  const d0 = await undoDepth(page);
  const before = await present(page);
  await page.keyboard.press('\\');
  await expect(f(page, 'fx-bypass-tag')).toBeVisible();
  await waitPix(page, (p) => near(p, GREEN, 6));
  expect(await undoDepth(page)).toBe(d0);
  expect(await present(page)).toEqual(before);
  await f(page, 'fx-bypass').click();
  await expect(f(page, 'fx-bypass-tag')).toHaveCount(0);
  await waitPix(page, (p) => near(p, [225, 55, 195], 8));
});

test('an export still contains the effect while Effects off is on', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  await addFx(page, 'invert');
  const [c] = await clipStates(page);
  await drag(page, await center(clipEl(page, c.id).getByTestId('trim-end')), -(c.out - c.in - 0.5) * PPS);
  await page.keyboard.press('\\');
  await expect(f(page, 'fx-bypass-tag')).toBeVisible();
  await f(page, 'btn-export').click();
  await f(page, 'btn-export-start').click();
  const link = f(page, 'export-download');
  await expect(link).toBeVisible({ timeout: 150_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const frame = ffmpegFrame(await download.path(), 0);
  const i = ((frame.height >> 1) * frame.width + (frame.width >> 1)) * 3;
  const got = [frame.rgb[i], frame.rgb[i + 1], frame.rgb[i + 2]];
  expect(near(got, [225, 55, 195], 14), `exported centre ${got}`).toBe(true);
});

test('import a .cube: it joins the library, the LUT effect uses it; a bad file shows the reason and changes nothing', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  await addFx(page, 'lut');
  const dir = test.info().outputPath('luts');
  mkdirSync(dir, { recursive: true });
  const rowsText: string[] = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rowsText.push(`${1 - r} ${1 - g} ${1 - b}`);
  const good = join(dir, 'invert.cube');
  writeFileSync(good, `TITLE "Invert"\nLUT_3D_SIZE 2\n${rowsText.join('\n')}\n`);
  const bad = join(dir, 'one-d.cube');
  writeFileSync(bad, 'LUT_1D_SIZE 2\n0 0 0\n1 1 1\n');
  const d0 = await undoDepth(page);
  await f(page, 'lut-import').setInputFiles(good);
  await expect(f(page, 'lut-select')).not.toHaveValue('');
  expect(await undoDepth(page)).toBe(d0 + 1);
  await expect(f(page, 'lut-select')).toContainText('Invert');
  await waitPix(page, (p) => near(p, [225, 55, 195], 8));
  await expect(f(page, 'lut-missing')).toHaveCount(0);
  const d1 = await undoDepth(page);
  const luts = Object.keys((await present(page)).luts).length;
  await f(page, 'lut-import').setInputFiles(bad);
  await expect(toast(page)).toContainText('1D');
  expect(await undoDepth(page)).toBe(d1);
  expect(Object.keys((await present(page)).luts)).toHaveLength(luts);
});

test('slider keys commit one step per press, Delete on a focused slider keeps the clip, and a reload restores the stack and LUT', async ({ page }) => {
  await setup(page, [png('still.png')], 'still.png');
  await addFx(page, 'color');
  const id = await rowId(page, 0);
  const slider = f(page, `fx-${id}-brightness`);
  const d0 = await undoDepth(page);
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await undoDepth(page)).toBe(d0 + 2);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await f(page, 'look-cinematic').click();
  const stack = await clipFx(page, (await clipStates(page))[0].id);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await clipEl(page, (await clipStates(page))[0].id).click();
  await expect(rows(page)).toHaveCount(2);
  expect(await clipFx(page, (await clipStates(page))[0].id)).toEqual(stack);
});
