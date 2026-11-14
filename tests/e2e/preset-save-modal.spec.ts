// Plan 5B final review I1: the "Save as preset" dialog is a real modal. While it is open the editor's global shortcuts
// do nothing (Delete, Backspace, S, Space, Ctrl+Z/C/V/D pressed on its buttons), the background is inert, Tab stays
// inside, focus returns to the opener on close, and the dialog still works afterwards.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';
import { depth, setupOverlay } from './presets-ui-helpers';

test.setTimeout(60_000);

const lin = { kind: 'linear' as const };
const snapshot = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(() => { const s = window.__clipforge!.getState(); return JSON.stringify({ p: s.history.present, n: s.history.past.length, f: s.history.future.length, sel: s.selection }); });

test('Save as preset is modal: shortcuts on its buttons change nothing, Tab is trapped, focus returns, it still saves', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await page.evaluate((lin) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => t.id !== 'v1' ? t : { ...t, clips: t.clips.map((c) => ({ ...c, keys: { opacity: [{ t: 0, v: 0, ease: lin }, { t: 1, v: 1, ease: lin }] } })) }) }));
  }, lin);
  const save = page.getByTestId('preset-save');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId('preset-save-dialog')).toBeVisible();
  await expect(page.getByTestId('app')).toHaveAttribute('inert', '');
  // A refusal toast (empty name) leaves focus on the Save button of the dialog.
  await page.getByTestId('preset-save-confirm').click();
  await expect(page.getByTestId('error-toast')).toContainText('name');
  await expect(page.getByTestId('preset-save-confirm')).toBeFocused();
  const before = await snapshot(page);
  const d0 = await depth(page);
  for (const chord of ['Delete', 'Backspace', 'Shift+Delete', 's', 'Control+z', 'Control+Shift+z', 'Control+c', 'Control+v', 'Control+d', 'Control+Alt+v', '[', ']']) {
    await page.keyboard.press(chord);
    expect(await snapshot(page), chord).toBe(before);
  }
  await page.getByTestId('preset-save-category').focus();
  await page.getByTestId('preset-save-cancel').focus();
  for (const chord of ['Delete', 'Backspace', 's', 'Control+z']) {
    await page.keyboard.press(chord);
    expect(await snapshot(page), `cancel ${chord}`).toBe(before);
  }
  await page.getByTestId('preset-save-confirm').focus();
  await page.keyboard.press('Space'); // activates Save natively (empty name: refused); must not toggle playback
  expect(await snapshot(page)).toBe(before);
  await expect(page.getByTestId('preset-save-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.__clipforge!.getState().playing)).toBeFalsy();
  // Tab is trapped: forward from the last control wraps to the first, backward from the first wraps to the last.
  await page.getByTestId('preset-save-confirm').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('preset-save-name')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('preset-save-confirm')).toBeFocused();
  // Still works: name it, save, the dialog closes, focus is back on the opener, no undo step, shortcuts are live again.
  await page.getByTestId('preset-save-name').fill('Modal check');
  await page.getByTestId('preset-save-confirm').click();
  await expect(page.getByTestId('preset-save-dialog')).toHaveCount(0);
  await expect(save).toBeFocused();
  await expect(page.getByTestId('app')).not.toHaveAttribute('inert', '');
  expect(await depth(page)).toBe(d0);
  expect(await snapshot(page)).toBe(before);
  await page.keyboard.press('Delete'); // the editor shortcuts work again
  expect(await page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).some((c) => c.id === 'st'))).toBe(false);
  expect(errors).toEqual([]);
});
