import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WIDTHS = [360, 390, 768, 1024, 1440];
const themeOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('desktop shell', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('header has Apps, Blog, About, Sign in and a theme toggle (no Learn yet)', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'IdeaToApps' })).toBeVisible();
    const nav = header.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link')).toHaveText(['Apps', 'Blog', 'About']);
    await expect(nav.getByRole('link', { name: 'Apps' })).toHaveAttribute('href', /\/apps\/$/);
    await expect(nav.getByRole('link', { name: 'Learn' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', /\/my-account\/$/);
    await expect(header.getByTestId('theme-toggle')).toBeVisible();
    await expect(header.getByTestId('menu-button')).toBeHidden();
  });

  test('footer lists the eight legal and content links', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    const links = footer.getByRole('link');
    await expect(links).toHaveText(['Apps', 'Learn', 'Blog', 'About', 'Contact', 'Privacy', 'Terms', 'Refund']);
    const hrefs = await links.evaluateAll((els) => els.map((e) => new URL((e as HTMLAnchorElement).href).pathname));
    expect(hrefs).toEqual(['/apps/', '/learn/', '/blog/', '/about/', '/contact/', '/privacy/', '/terms/', '/refund-policy/']);
    await expect(footer).toContainText('Useful apps. Brilliant ideas. One place.');
  });

  test('landmarks: lang, one main, skip link is the first focusable element', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    await expect(page.locator('main')).toHaveCount(1);
    await page.keyboard.press('Tab');
    const first = page.locator(':focus');
    await expect(first).toHaveText('Skip to content');
    await expect(first).toHaveAttribute('href', '#main');
    await expect(first).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('theme toggle sets html[data-theme], survives reload, defaults to the OS scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await themeOf(page)).toBe('dark');
    await page.getByTestId('theme-toggle').click();
    expect(await themeOf(page)).toBe('light');
    await page.reload();
    expect(await themeOf(page)).toBe('light');
    expect(await page.evaluate(() => localStorage.getItem('ideatoapps-theme'))).toBe('light');
    await page.getByTestId('theme-toggle').click();
    await page.reload();
    expect(await themeOf(page)).toBe('dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    expect(await themeOf(page)).toBe('light');
  });

  test('renders correctly and toggles with storage blocked', async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: boom });
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await themeOf(page)).toBe('dark');
    await page.getByTestId('theme-toggle').click();
    expect(await themeOf(page)).toBe('light');
    expect(errors).toEqual([]);
  });

  test('requests no third-party hosts and self-hosts Inter', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (r) => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).host); });
    const fonts: string[] = [];
    page.on('response', (r) => { if (r.url().endsWith('.woff2')) fonts.push(r.url()); });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect([...hosts]).toEqual(['localhost:8888']);
    expect(fonts.some((u) => u.includes('inter'))).toBe(true);
  });
});

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('nav collapses into a labelled drawer, traps focus and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const button = page.getByTestId('menu-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName('Open menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const drawer = page.getByTestId('nav-drawer');
    await expect(drawer).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link')).toHaveText(['Apps', 'Blog', 'About', 'Sign in']);

    // focus moves inside and stays inside while tabbing
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="nav-drawer"]'))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="nav-drawer"]'))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('drawer closes from its close button; the theme toggle stays in the header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner').getByTestId('theme-toggle')).toBeVisible();
    await page.getByTestId('menu-button').click();
    await page.getByTestId('nav-close').click();
    await expect(page.getByTestId('nav-drawer')).toBeHidden();
    await expect(page.getByTestId('menu-button')).toBeFocused();
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const w of WIDTHS) {
      test(`no horizontal overflow at ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 800 });
        for (const path of ['/', '/this-page-does-not-exist/']) {
          await page.goto(path);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(over, path).toBeLessThanOrEqual(0);
        }
      });
    }

    for (const w of [360, 1440]) {
      for (const path of ['/', '/this-page-does-not-exist/']) {
        test(`axe: no serious/critical violations on ${path} at ${w}px`, async ({ page }) => {
          await page.setViewportSize({ width: w, height: 800 });
          const res = await page.goto(path);
          expect(res?.status()).toBe(path === '/' ? 200 : 404);
          expect(await themeOf(page)).toBe(theme);
          const results = await new AxeBuilder({ page }).analyze();
          const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
          expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([]);
        });
      }
    }
  });
}
