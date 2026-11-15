import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open } from './helpers';
import { SHOWN, openSettings, saveKey, stubApi } from './ai-settings-helpers';

const consentDb = (page: Page, op: 'set' | 'get'): Promise<unknown> =>
  page.evaluate(
    (o) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('clipforge-ai-secrets');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const store = r.result.transaction('secrets', 'readwrite').objectStore('secrets');
          if (o === 'set') {
            const q = store.put(true, 'consent');
            q.onsuccess = () => res(true);
          } else {
            const q = store.get('consent');
            q.onsuccess = () => res(q.result ?? false);
          }
        };
      }),
    op,
  );

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test('Remove clears the stored consent and moves focus to the key input', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await consentDb(page, 'set');
  expect(await consentDb(page, 'get')).toBe(true);
  await page.getByTestId('eleven-key-remove').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  expect(await consentDb(page, 'get')).toBe(false);
  await expect(page.getByTestId('eleven-key-input')).toBeFocused();
});

test('Done closes the dialog and returns focus to the Settings button', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await page.getByTestId('btn-settings').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.getByTestId('settings-done').click();
  await expect(page.getByTestId('settings-dialog')).toBeHidden();
  await expect(page.getByTestId('btn-settings')).toBeFocused();
});

test('closing during Test aborts the request, shows no stale success, and Save/Remove are disabled while testing', async ({ page }) => {
  await stubApi(page, { delayMs: 1500 });
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-test').click();
  await expect(page.getByTestId('eleven-key-remove')).toBeDisabled();
  await expect(page.getByTestId('eleven-key-save')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toBeHidden();
  await openSettings(page);
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('settings-dialog')).not.toContainText('Key works');
  expect(failed.some((u) => u.includes('/v1/voices'))).toBe(true);
});

test('a rejected key is announced as an alert, success is not', async ({ page }) => {
  await stubApi(page, { status: 401 });
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-test').click();
  await expect(page.getByTestId('settings-dialog').getByRole('alert')).toContainText('did not accept');
});
