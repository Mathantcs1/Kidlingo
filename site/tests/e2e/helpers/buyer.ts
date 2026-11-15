import { expect, type Browser } from '@playwright/test';

/** Shared by the purchase specs: registering a buyer through the real My account form. */
const slow = expect.configure({ timeout: 30_000 });
export const PASSWORD = 'Zq!7-purchase-Test#2026';
const stamp = Date.now();
export const emailOf = (tag: string) => `buyer-${tag}-${stamp}@example.org`;
export const base = `http://localhost:${process.env.WP_PORT ?? '8888'}`;
export const bytesOf = async (res: { body(): Promise<Buffer> }) => (await res.body()).toString('latin1');

export async function registerAt(browser: Browser, tag: string) {
  const ctx = await browser.newContext({ baseURL: base });
  const page = await ctx.newPage();
  await page.goto('/my-account/');
  await page.locator('#reg_email').fill(emailOf(tag));
  await page.locator('#reg_password').pressSequentially(PASSWORD); // real keystrokes: WooCommerce's strength meter blocks submit until it has rated the password
  await slow(page.locator('.woocommerce-password-strength')).toHaveClass(/strong|good/);
  await page.locator('#reg_email').focus();
  await page.getByRole('button', { name: 'Register' }).click();
  await slow(page.getByTestId('library').or(page.locator('.woocommerce-MyAccount-content'))).toBeVisible();
  return { ctx, page };
}

