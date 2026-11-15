import { test, expect, type Page } from '@playwright/test';
import { adminApi, cleanup, createApp, resetContent, uploadFile, zipBytes, type Api } from './helpers/wp';

// The classic "Product details" and "Versions" meta boxes of an app, driven in the real block editor: FAQ rows (add, remove,
// remove the LAST row) and the wp.media file picker (assets/admin-app.js). Both the JS and the save handler are exercised
// together: the saved FAQ is read back from the real database through the edit screen.
test.describe.configure({ mode: 'serial' });

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterEach(async () => { await cleanup(api); });
test.afterAll(async () => { await resetContent(api); });

async function openEditor(page: Page, id: number) {
  await page.context().addCookies((await api.ctx.storageState()).cookies);
  await page.goto(`/wp-admin/post.php?post=${id}&action=edit`);
  // The block editor opens a welcome guide for a new user and keeps the classic boxes in a panel at the bottom.
  await page.waitForFunction(() => Boolean((window as unknown as { wp?: { data?: unknown } }).wp?.data));
  await page.evaluate(() => {
    const w = window as unknown as { wp: { data: { dispatch: (s: string) => Record<string, (...a: unknown[]) => void> } } };
    try { w.wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false); } catch { /* older editors */ }
    try { w.wp.data.dispatch('core/preferences').set('core/edit-post', 'fullscreenMode', false); } catch { /* optional */ }
  });
  // The classic boxes live in a collapsed "Meta Boxes" region. Its toggle counts as not visible to Playwright (zero-size
  // presenter), so a normal click times out; focusing it and pressing Enter is what a keyboard user does and works.
  const toggle = page.locator('.edit-post-meta-boxes-main button[aria-expanded]').first();
  await toggle.waitFor({ state: 'attached' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#ita-faq-add')).toBeVisible();
}

/** Click the editor's save button (labelled "Save" in this WordPress, "Update" in older ones) and wait for the classic-box form post. */
async function update(page: Page) {
  const boxes = page.waitForResponse((r) => r.url().includes('meta-box-loader') && r.request().method() === 'POST', { timeout: 60_000 });
  await page.locator('.editor-post-publish-button').click();
  await boxes;
  await expect(page.locator('.editor-post-publish-button')).toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
}

test('FAQ rows: add, remove, and removing the last row really empties the FAQ', async ({ page }) => {
  test.setTimeout(150_000);
  const id = await createApp(api, { title: 'Box Test App', faq: [{ q: 'First?', a: 'One.' }, { q: 'Second?', a: 'Two.' }] });
  await openEditor(page, id);
  const rows = page.locator('#ita-faq-rows .ita-faq-row');
  await expect(rows, 'the classic Product details box is on the page').toHaveCount(2);

  // Add: a new empty row appears from the template; fill it.
  await page.locator('#ita-faq-add').click();
  await expect(rows).toHaveCount(3);
  await rows.nth(2).locator('input[name="ita_faq_q[]"]').fill('Third?');
  await rows.nth(2).locator('textarea[name="ita_faq_a[]"]').fill('Three.');

  // Remove the first row.
  await rows.nth(0).locator('.ita-faq-remove').click();
  await expect(rows).toHaveCount(2);
  await update(page);
  await openEditor(page, id);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('input[name="ita_faq_q[]"]')).toHaveValue('Second?');
  await expect(rows.nth(1).locator('input[name="ita_faq_q[]"]')).toHaveValue('Third?');

  // Remove every row, including the last one, then save: the FAQ must be empty afterwards (it used to come back).
  await rows.nth(0).locator('.ita-faq-remove').click();
  await rows.nth(0).locator('.ita-faq-remove').click();
  await expect(rows).toHaveCount(0);
  await update(page);
  await openEditor(page, id);
  await expect(rows, 'one blank row is shown for an empty FAQ').toHaveCount(1);
  await expect(rows.nth(0).locator('input[name="ita_faq_q[]"]')).toHaveValue('');
  await expect(rows.nth(0).locator('textarea[name="ita_faq_a[]"]')).toHaveValue('');
  const faqOnPage = await (await api.ctx.get(`/?p=${id}&post_type=app`)).text();
  expect(faqOnPage).not.toContain('First?');
  expect(faqOnPage).not.toContain('Third?');
});

test('the Choose file picker puts the chosen zip on the version form', async ({ page }) => {
  test.setTimeout(150_000);
  const zip = await uploadFile(api, 'ClipForge-9.9.9.zip', 'application/zip', zipBytes('picker test'));
  const id = await createApp(api, { title: 'Picker Test App' });
  await openEditor(page, id);
  const box = page.locator('#ideatoapps_versions');
  await expect(box).toBeVisible();
  await box.locator('.ita-pick').click();
  const modal = page.locator('.media-modal');
  await expect(modal).toBeVisible();
  await modal.getByRole('tab', { name: 'Media Library' }).click().catch(() => undefined);
  await modal.locator(`li.attachment[data-id="${zip}"]`).click();
  await modal.getByRole('button', { name: 'Choose file' }).or(modal.locator('.media-button-select')).first().click();
  await expect(modal).toBeHidden();
  await expect(box.locator('input[name="ita_new_attachment"]')).toHaveValue(String(zip));
  await expect(box.locator('.ita-file-name')).toContainText('.zip');
});
