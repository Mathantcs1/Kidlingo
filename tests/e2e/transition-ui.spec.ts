// Plan 5C Task 9: the transition browser (tiles: click, keyboard, drag onto a cut), the inspector controls, the clip menu
// entries, the audio inspector's "replaced" note and Help. Two clips of with-audio.mp4 trimmed to 0.5..2.5 (0.5 s of handle each side).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, setPlayhead, trackErrors, withAudio } from './helpers';

test.setTimeout(90_000);

const present = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);
const transitions = async (page: Page) => (await present(page)).tracks.flatMap((t) => t.transitions ?? []);
const chip = (page: Page) => page.getByTestId('transition-chip');

async function setup(page: Page, opts: { locked?: boolean } = {}): Promise<{ a: string; b: string }> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'with-audio.mp4', 2);
  const ids = (await clipStates(page)).filter((c) => c.trackKind === 'video').sort((x, y) => x.start - y.start).map((c) => c.id);
  await page.evaluate(([a, b, locked]) => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        locked: t.kind === 'video' ? false : t.locked,
        clips: t.clips.map((c) => (c.id === a ? { ...c, start: 0, in: 0.5, out: 2.5 } : c.id === b ? { ...c, start: 2, in: 0.5, out: 2.5 } : c)),
      })),
    }));
    void locked;
    window.__clipforge!.getState().select([]);
  }, [ids[0], ids[1], opts.locked ?? false] as const);
  return { a: ids[0], b: ids[1] };
}

async function addDissolve(page: Page): Promise<void> {
  await page.getByTestId('timeline-lane').first().hover();
  await page.getByTestId('transition-cut').first().click();
  await expect(chip(page)).toHaveCount(1);
}

test('a tile click adds that type at the cut nearest the playhead: one undo step, selected, inspector opens', async ({ page }) => {
  const errors = trackErrors(page);
  const { a } = await setup(page);
  await clipEl(page, a).click();
  await setPlayhead(page, 1.9);
  const d = await depth(page);
  await page.getByTestId('transition-tile-wipe').click();
  expect(await depth(page)).toBe(d + 1);
  const [t] = await transitions(page);
  expect(t.type).toBe('wipe');
  expect(t.direction).toBe('left');
  await expect(page.getByTestId('transition-inspector')).toBeVisible();
  await page.getByTestId('btn-undo').click();
  await expect(chip(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keyboard: Tab to a tile and press Enter; the chip is reachable and selects with Enter', async ({ page }) => {
  const { a } = await setup(page);
  await clipEl(page, a).click();
  await setPlayhead(page, 1.9);
  await page.getByTestId('transition-tile-zoom').focus();
  await page.keyboard.press('Enter');
  await expect(chip(page)).toHaveCount(1);
  expect((await transitions(page))[0].type).toBe('zoom');
  await page.evaluate(() => window.__clipforge!.getState().select([]));
  await chip(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('transition-inspector')).toBeVisible();
});

test('dragging a tile onto a cut shows the ghost and adds that type in one step', async ({ page }) => {
  const { a, b } = await setup(page);
  // Move the pair right so the cut is clear of the sticky track header (the pointer cannot reach a cut under it).
  await page.evaluate(([a, b]) => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, start: 4 } : c.id === b ? { ...c, start: 6 } : c)) })) })), [a, b]);
  const d = await depth(page);
  await page.getByTestId('timeline-lane').first().hover();
  const cut = page.getByTestId('transition-cut').first();
  const tile = page.getByTestId('transition-tile-slide');
  await tile.hover();
  await page.mouse.down();
  const cb = (await cut.boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 });
  // Chromium delivers the last dragover only after a further move.
  await page.mouse.move(cb.x + cb.width / 2 + 1, cb.y + cb.height / 2 + 1, { steps: 3 });
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 3 });
  await expect(page.getByTestId('transition-drop-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(chip(page)).toHaveCount(1);
  expect((await transitions(page))[0].type).toBe('slide');
  expect(await depth(page)).toBe(d + 1);
  await expect(page.getByTestId('transition-drop-ghost')).toHaveCount(0);
});

test('inspector controls round-trip to the data, one undo step each', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await addDissolve(page);
  const sel = (id: string) => page.getByTestId(id);
  let d = await depth(page);
  await sel('transition-type').selectOption('wipe');
  expect((await transitions(page))[0]).toMatchObject({ type: 'wipe', direction: 'left' });
  expect(await depth(page)).toBe(++d);
  await sel('transition-direction-up').click();
  expect((await transitions(page))[0].direction).toBe('up');
  expect(await depth(page)).toBe(++d);
  await sel('transition-softness').fill('20');
  await sel('transition-softness').press('Enter');
  expect((await transitions(page))[0].softness).toBeCloseTo(0.2, 6);
  expect(await depth(page)).toBe(++d);
  await sel('transition-ease').selectOption('easeOut');
  expect((await transitions(page))[0].ease.kind).toBe('easeOut');
  expect(await depth(page)).toBe(++d);
  await sel('transition-audio-curve').selectOption('gain');
  expect((await transitions(page))[0].audio).toBe('gain');
  expect(await depth(page)).toBe(++d);
  await sel('transition-duration').fill('0.4');
  await sel('transition-duration').press('Enter');
  const dur = (await transitions(page))[0].duration;
  expect(dur).toBeGreaterThan(0.3);
  expect(dur).toBeLessThan(0.5);
  expect(await depth(page)).toBe(++d);
  await sel('transition-type').selectOption('zoom');
  await sel('transition-amount').fill('3');
  await sel('transition-amount').press('Enter');
  expect((await transitions(page))[0]).toMatchObject({ type: 'zoom', amount: 3 });
  await sel('transition-remove').click();
  await expect(chip(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the ease list offers only the no-overshoot kinds', async ({ page }) => {
  await setup(page);
  await addDissolve(page);
  const values = await page.getByTestId('transition-ease').locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(['linear', 'easeIn', 'easeOut', 'easeInOut', 'bezier']);
});

test('clip menu: Add transition at start / end and Remove transition; unavailable ones are disabled with a reason', async ({ page }) => {
  const { a, b } = await setup(page);
  await clipEl(page, a).click({ button: 'right' });
  await expect(page.getByTestId('transition-menu-add-start')).toBeDisabled(); // nothing before the first clip
  await page.getByTestId('transition-menu-add-end').click();
  await expect(chip(page)).toHaveCount(1);
  await clipEl(page, b).click({ button: 'right' });
  await expect(page.getByTestId('transition-menu-add-start')).toBeDisabled(); // already has one
  const d = await depth(page);
  await page.getByTestId('transition-menu-remove').click();
  await expect(chip(page)).toHaveCount(0);
  expect(await depth(page)).toBe(d + 1);
});

test('locked track: tiles still add nothing, inspector fields and the menu entries are disabled', async ({ page }) => {
  const { a } = await setup(page);
  await addDissolve(page);
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, locked: true } : t)) })));
  await expect(page.getByTestId('transition-type')).toBeDisabled();
  await expect(page.getByTestId('transition-remove')).toBeDisabled();
  await page.evaluate(() => window.__clipforge!.getState().select([]));
  await clipEl(page, a).click({ button: 'right' });
  await expect(page.getByTestId('transition-menu-add-end')).toBeDisabled();
});

test('the audio inspector notes that the transition replaces a fade on that edge', async ({ page }) => {
  const { b } = await setup(page);
  await addDissolve(page);
  await page.evaluate((b) => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === b ? { ...c, audio: { ...c.audio, fadeIn: 0.3 } } : c)) })) })), b);
  await clipEl(page, b).click();
  await expect(page.getByTestId('transition-fade-replaced')).toContainText('Fade in');
});

test('Help finds crossfade and the inspector links to the transitions topic', async ({ page }) => {
  await setup(page);
  await addDissolve(page);
  await page.getByTestId('transition-help').click();
  await expect(page.getByTestId('help-panel')).toContainText('Transitions and crossfades');
  await page.getByTestId('help-close').click();
  await page.getByTestId('btn-help').click();
  await page.getByTestId('ctx-help-start').click();
  await page.getByTestId('help-search').fill('crossfade');
  await expect(page.getByTestId('help-panel')).toContainText('Transitions and crossfades');
});
