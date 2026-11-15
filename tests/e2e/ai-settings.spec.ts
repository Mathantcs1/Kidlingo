import { test, expect } from '@playwright/test';
import { open } from './helpers';

import { KEY, SHOWN, domLeaks, openSettings, projectDbLeaks, saveKey, stubApi } from './ai-settings-helpers';

test.beforeEach(async ({ page }) => {
  // Block anything else that is not the dev server, so a stray call to the real API can never succeed.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test('Settings opens from the top bar, explains privacy, and closes with Escape returning focus', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await page.getByTestId('btn-settings').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByTestId('settings-dialog');
  await expect(dialog).toBeVisible();
  const note = page.getByTestId('eleven-privacy-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('only in this browser');
  await expect(note).toContainText('your key and the text you generate are sent straight to ElevenLabs');
  await expect(note).toContainText('own terms');
  await expect(note).toContainText('no server');
  const input = page.getByTestId('eleven-key-input');
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  // Focus is trapped inside the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.querySelector('[data-testid="settings-dialog"]')?.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('btn-settings')).toBeFocused();
});

test('Save validates, masks the key, clears the input and never renders the full key', async ({ page }) => {
  const seen = await stubApi(page);
  await open(page);
  await openSettings(page);
  await page.getByTestId('eleven-key-input').fill('   ');
  await page.getByTestId('eleven-key-save').click();
  await expect(page.getByTestId('settings-dialog')).toContainText('Enter your ElevenLabs API key.');
  await saveKey(page);
  await expect(page.getByTestId('eleven-key-input')).toHaveValue('');
  expect(await domLeaks(page)).toEqual([]);
  // Nothing contacts ElevenLabs until Test key is pressed.
  expect(seen).toEqual([]);
  await page.getByTestId('eleven-key-save').click(); // empty input again: still masked, error shown
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
  await page.keyboard.press('Escape');
  expect(await domLeaks(page)).toEqual([]);
});

test('the key survives a reload, shown masked, and is in no project data', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-input').fill('typing-in-progress');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await openSettings(page);
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
  await expect(page.getByTestId('eleven-key-input')).toHaveValue('');
  expect(await domLeaks(page)).toEqual([]);
  await page.evaluate(() => window.__clipforge?.flushAutosave());
  const { scanned, hits } = await projectDbLeaks(page);
  expect(scanned.length).toBeGreaterThan(0);
  expect(hits).toEqual([]);
});

test('Test key reports a working key with the remaining characters, and only xi-api-key to api.elevenlabs.io carries the key', async ({ page }) => {
  const seen = await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  expect(seen).toEqual([]);
  await page.getByTestId('eleven-key-test').click();
  const status = page.getByTestId('eleven-key-status');
  await expect(status).toContainText('Key works');
  await expect(status).toContainText('8,800');
  expect(await domLeaks(page)).toEqual([]);
  const real = seen.filter((s) => s.url.startsWith('https://api.elevenlabs.io/'));
  expect(real.length).toBeGreaterThan(0);
  for (const s of seen) {
    expect(new URL(s.url).origin).toBe('https://api.elevenlabs.io');
    expect(s.url).not.toContain(KEY);
    for (const [name, value] of Object.entries(s.headers)) {
      if (value.includes(KEY)) expect(name).toBe('xi-api-key');
    }
  }
  expect(real.some((s) => s.headers['xi-api-key'] === KEY)).toBe(true);
});

test('Test key shows the plain-English message for a rejected key', async ({ page }) => {
  await stubApi(page, { status: 401 });
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-test').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('did not accept your API key');
  expect(await domLeaks(page)).toEqual([]);
});

test('Remove clears the key and consent, and a reload shows no key', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-remove').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  await expect(page.getByTestId('eleven-key-remove')).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await openSettings(page);
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  await page.getByTestId('eleven-key-test').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('Add your ElevenLabs API key');
});
