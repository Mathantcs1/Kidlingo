// Plan 5B Task 9 (D9, D10): the personal preset library. Save as preset (name and category validated, no undo step),
// it survives a reload under My presets, applying it is ONE step and works relative to the destination's rest position,
// delete asks and touches the library only, favourites persist, and a library saved by a NEWER version is shown
// read-only and its IndexedDB value is never changed.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, trackErrors } from './helpers';
import { clipJson, depth, openBrowser, setupOverlay } from './presets-ui-helpers';

test.setTimeout(90_000);

const lin = { kind: 'linear' as const };
const KEY = 'clipforge:presets';

/** The raw IndexedDB value (idb-keyval's default store) of `key`. */
const idbGet = (page: Page, key: string): Promise<unknown> =>
  page.evaluate((key) => new Promise((resolve, reject) => {
    const r = indexedDB.open('keyval-store');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const g = r.result.transaction('keyval').objectStore('keyval').get(key);
      g.onsuccess = () => { resolve(g.result); r.result.close(); };
    };
  }), key);

const idbSet = (page: Page, key: string, value: unknown): Promise<void> =>
  page.evaluate(({ key, value }) => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('keyval-store');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put(value, key);
      tx.oncomplete = () => { r.result.close(); resolve(); };
    };
  }), { key, value });

/** The overlay project with an animated sticker 'st' (position slide + opacity keys + a Fade In) and a plain sticker 'st2'. */
async function setupAnimated(page: Page): Promise<void> {
  await setupOverlay(page);
  await page.evaluate((lin) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => {
      const st = p.tracks.find((t) => t.id === 'v1')!.clips[0];
      const keyed = {
        ...st,
        keys: { position: [{ t: 0, x: 100, y: 50, ease: lin }, { t: 1, x: 400, y: 50, ease: lin }], opacity: [{ t: 0, v: 0, ease: lin }, { t: 1, v: 1, ease: lin }] },
        motion: { in: { preset: 'fade' as const, duration: 0.5, delay: 0, ease: lin, params: {} } },
      };
      const st2 = { ...st, id: 'st2', transform: { ...st.transform, x: 40, y: -10 } };
      return { ...p, tracks: [{ ...p.tracks[0], clips: [keyed] }, p.tracks[1], { ...p.tracks[1], id: 'v3', clips: [st2] }, p.tracks[2]] };
    });
    s.select(['st']);
    s.setPlayhead(1);
  }, lin);
  await expect(page.getByTestId('preset-save')).toBeEnabled();
  await page.waitForTimeout(900); // autosave (the IndexedDB database exists from here on)
}

async function reload(page: Page): Promise<void> {
  await page.waitForTimeout(700);
  await open(page);
  await page.evaluate(() => { const s = window.__clipforge!.getState(); s.select(['st']); s.setPlayhead(1); });
  await expect(page.getByTestId('anim-section')).toBeVisible();
}

async function savePreset(page: Page, name: string, category = 'in'): Promise<void> {
  await page.getByTestId('preset-save').click();
  await expect(page.getByTestId('preset-save-dialog')).toBeVisible();
  await page.getByTestId('preset-save-name').fill(name);
  await page.getByTestId('preset-save-category').selectOption(category);
  await page.getByTestId('preset-save-confirm').click();
}

const userTiles = (page: Page) => page.locator('[data-testid^="preset-tile-user-"]');

test('save as preset: validated, no undo step, listed under My presets after a reload; applying is ONE step relative to the rest position', async ({ page }) => {
  const errors = trackErrors(page);
  await setupAnimated(page);
  const d0 = await depth(page);
  await page.getByTestId('preset-save').click();
  await expect(page.getByTestId('preset-save-name')).toBeFocused();
  await page.getByTestId('preset-save-confirm').click(); // empty name
  await expect(page.getByTestId('error-toast')).toContainText('name');
  await expect(page.getByTestId('preset-save-dialog')).toBeVisible();
  await page.getByTestId('preset-save-name').fill('x'.repeat(41));
  await page.getByTestId('preset-save-confirm').click();
  await expect(page.getByTestId('error-toast').last()).toContainText('at most 40');
  await page.getByTestId('preset-save-name').fill('  Glide in ');
  await page.getByTestId('preset-save-category').selectOption('in');
  await page.getByTestId('preset-save-confirm').click();
  await expect(page.getByTestId('preset-save-dialog')).toHaveCount(0);
  expect(await depth(page)).toBe(d0); // the library, not the project
  const rec = (await idbGet(page, KEY)) as { version: number; presets: { id: string; name: string; category: string; payload: { keys: { position: { x: number }[] } } }[] };
  expect(rec.version).toBe(1);
  expect(rec.presets.map((p) => [p.name, p.category])).toEqual([['Glide in', 'in']]);
  expect(rec.presets[0].payload.keys.position.map((k) => k.x)).toEqual([0, 300]); // relative to the first position key
  const id = rec.presets[0].id;

  await reload(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-cat-mine').click();
  await expect(userTiles(page)).toHaveCount(1);
  await expect(page.getByTestId(`preset-user-name-${id}`)).toHaveText('Glide in');
  await page.keyboard.press('Escape');

  // Apply it to the plain sticker: ONE step, positions relative to ITS rest position (40, -10), the click closes the browser.
  await page.evaluate(() => window.__clipforge!.getState().select(['st2']));
  await openBrowser(page, 'in');
  await page.getByTestId('preset-cat-mine').click();
  const d1 = await depth(page);
  await page.getByTestId(`preset-tile-user-${id}`).click();
  await expect(page.getByTestId('preset-browser')).toHaveCount(0);
  expect(await depth(page)).toBe(d1 + 1);
  const st2 = await clipJson(page, 'st2');
  expect(st2.keys!.position!.map((k) => [k.x, k.y])).toEqual([[40, -10], [340, -10]]);
  expect(st2.motion!.in!.preset).toBe('fade');
  await page.getByTestId('btn-undo').click();
  expect((await clipJson(page, 'st2')).keys).toBeUndefined();
  expect(errors).toEqual([]);
});

test('rename and delete: delete asks, removes the preset from the library only; the clip keeps its animation', async ({ page }) => {
  const errors = trackErrors(page);
  await setupAnimated(page);
  await savePreset(page, 'Glide in');
  await expect(page.getByTestId('preset-save-dialog')).toHaveCount(0);
  const id = ((await idbGet(page, KEY)) as { presets: { id: string }[] }).presets[0].id;
  const d0 = await depth(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-cat-mine').click();
  // Rename (inline): Enter commits, Escape cancels.
  await page.getByTestId(`preset-user-rename-${id}`).click();
  const input = page.getByTestId(`preset-user-rename-input-${id}`);
  await input.fill('Swoosh');
  await input.press('Escape');
  await expect(page.getByTestId(`preset-user-name-${id}`)).toHaveText('Glide in');
  await expect(page.getByTestId('preset-browser')).toBeVisible(); // Escape closed the editor, not the browser
  await page.getByTestId(`preset-user-rename-${id}`).click();
  await page.getByTestId(`preset-user-rename-input-${id}`).fill('Swoosh');
  await page.getByTestId(`preset-user-rename-input-${id}`).press('Enter');
  await expect(page.getByTestId(`preset-user-name-${id}`)).toHaveText('Swoosh');
  expect(((await idbGet(page, KEY)) as { presets: { name: string }[] }).presets[0].name).toBe('Swoosh');
  // Delete: asks first; cancel keeps it, confirm removes it from the library only.
  await page.getByTestId(`preset-user-delete-${id}`).click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('btn-confirm-cancel').click();
  await expect(userTiles(page)).toHaveCount(1);
  await page.getByTestId(`preset-user-delete-${id}`).click();
  await page.getByTestId('btn-confirm-ok').click();
  await expect(userTiles(page)).toHaveCount(0);
  await expect(page.getByTestId('preset-browser')).toBeVisible();
  expect(((await idbGet(page, KEY)) as { presets: unknown[] }).presets).toEqual([]);
  expect(await depth(page)).toBe(d0); // no project change
  expect((await clipJson(page, 'st')).keys!.position).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('favourites persist across a reload (built-in and saved presets)', async ({ page }) => {
  const errors = trackErrors(page);
  await setupAnimated(page);
  await savePreset(page, 'Mine');
  const id = ((await idbGet(page, KEY)) as { presets: { id: string }[] }).presets[0].id;
  await openBrowser(page, 'in');
  await page.getByTestId('preset-fav-fade').click();
  await page.getByTestId('preset-cat-mine').click();
  await page.getByTestId(`preset-fav-user-${id}`).click();
  await expect(page.getByTestId(`preset-fav-user-${id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => ((await idbGet(page, KEY)) as { favourites: unknown[] }).favourites).toEqual([{ slot: 'in', key: 'fade' }, { user: id }]);
  await reload(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-cat-favourites').click();
  await expect(page.getByTestId('preset-tile-fade')).toBeVisible();
  await expect(page.getByTestId(`preset-tile-user-${id}`)).toBeVisible();
  await expect(page.getByTestId('preset-fav-fade')).toHaveAttribute('aria-pressed', 'true');
  // Unstar: it leaves the list and the stored record.
  await page.getByTestId('preset-fav-fade').click();
  await expect(page.getByTestId('preset-tile-fade')).toHaveCount(0);
  await expect.poll(async () => ((await idbGet(page, KEY)) as { favourites: unknown[] }).favourites).toEqual([{ user: id }]);
  expect(errors).toEqual([]);
});

test('a library saved by a newer version is read-only and its stored value is never changed', async ({ page }) => {
  const errors = trackErrors(page);
  await setupAnimated(page);
  const future = { version: 2, presets: [{ anything: 'from the future' }], favourites: [], marker: 'x' };
  await idbSet(page, KEY, future);
  await reload(page);
  await expect(page.getByTestId('preset-save')).toBeDisabled();
  await expect(page.getByTestId('preset-save')).toHaveAttribute('title', /newer version/);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-cat-mine').click();
  await expect(page.getByTestId('preset-library-note')).toContainText('read-only');
  await expect(page.getByTestId('preset-library-note')).toContainText('newer version');
  await expect(userTiles(page)).toHaveCount(0);
  // Favourites still work for this session (memory) but are never written.
  await page.getByTestId('preset-cat-in').click();
  await page.getByTestId('preset-fav-fade').click();
  await expect(page.getByTestId('preset-fav-fade')).toHaveAttribute('aria-pressed', 'true');
  // Built-in presets still apply to the project.
  const d0 = await depth(page);
  await page.getByTestId('preset-tile-slide').click();
  expect(await depth(page)).toBe(d0 + 1);
  await page.waitForTimeout(500);
  expect(await idbGet(page, KEY)).toEqual(future);
  await reload(page);
  expect(await idbGet(page, KEY)).toEqual(future);
  expect(errors).toEqual([]);
});
