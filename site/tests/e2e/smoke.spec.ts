import { test, expect } from '@playwright/test';

test('home page responds 200 with the IdeaToApps title', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/IdeaToApps/);
});
