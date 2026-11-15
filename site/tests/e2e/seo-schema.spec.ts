import { test, expect, type Page } from '@playwright/test';
import { adminApi, createApp, createWooProduct, resetContent, saveSettings, uploadZip, type Api } from './helpers/wp';

// Structured data: SoftwareApplication on the app page, Organization + WebSite on the home page. Never ratings or reviews.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let api: Api;
test.beforeAll(async () => {
  test.setTimeout(300_000); // seeding goes through the real admin forms and REST on a slow dev server
  api = await adminApi();
  await resetContent(api);
  const product = await createWooProduct(api, 'ClipForge', '24.99');
  const zip = await uploadZip(api, '1.0.0');
  await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser. Your files stay on your device.', platforms: 'Chromium-based desktop browser', wooProductId: product, version: { version: '1.0.0', changelog: 'First release.', attachment: zip } });
  await createApp(api, { title: 'Soon App', delivery: 'coming_soon', tagline: 'Not out yet.' });
});
test.afterAll(async () => { await resetContent(api); });

const jsonLd = (page: Page) =>
  page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? '')));

test('the ClipForge page carries a SoftwareApplication with the real $24.99 offer and no ratings', async ({ page }) => {
  await page.goto('/apps/clipforge/');
  const blocks = await jsonLd(page);
  expect(blocks).toHaveLength(1);
  const app = blocks[0];
  expect(app['@type']).toBe('SoftwareApplication');
  expect(app.name).toBe('ClipForge');
  expect(app.url).toBe('https://ideatoapps.net/apps/clipforge/');
  expect(app.operatingSystem).toBe('Chromium-based desktop browser');
  expect(app.offers).toMatchObject({ '@type': 'Offer', price: '24.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' });
  expect(await page.content()).not.toMatch(/aggregateRating|ratingValue|ratingCount|"review"/i);
});

test('an app that is coming soon has no offer; the home page has no app JSON-LD', async ({ page }) => {
  await page.goto('/apps/soon-app/');
  const app = (await jsonLd(page))[0];
  expect(app.name).toBe('Soon App');
  expect(app).not.toHaveProperty('offers');
  expect(app).not.toHaveProperty('operatingSystem');
});

test('home: Organization and WebSite, no social links until the owner sets the channel, no SearchAction', async ({ page }) => {
  await page.goto('/');
  let nodes = (await jsonLd(page)).flatMap((b) => b['@graph']);
  const org = nodes.find((n) => n['@type'] === 'Organization');
  const site = nodes.find((n) => n['@type'] === 'WebSite');
  expect(org).toMatchObject({ name: 'IdeaToApps', url: 'https://ideatoapps.net/' });
  expect(org.logo).toMatch(/icon-512\.png$/);
  expect(org).not.toHaveProperty('sameAs');
  expect(site).toMatchObject({ name: 'IdeaToApps', url: 'https://ideatoapps.net/' });
  expect(site).not.toHaveProperty('potentialAction');

  await saveSettings(api, { channel: 'https://www.youtube.com/@ideatoapps' });
  await page.goto('/');
  nodes = (await jsonLd(page)).flatMap((b) => b['@graph']);
  expect(nodes.find((n) => n['@type'] === 'Organization').sameAs).toEqual(['https://www.youtube.com/@ideatoapps']);
  await saveSettings(api, {});
});
