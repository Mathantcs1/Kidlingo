import { test, expect } from '@playwright/test';
import { open } from './helpers';

for (const width of [700, 1024]) {
  test(`the top bar fits without sideways page scroll at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    await expect(page.getByTestId('btn-settings')).toBeVisible();
    await expect(page.getByTestId('link-licenses')).toBeVisible();
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.topbar') as HTMLElement;
      const link = document.querySelector('[data-testid="link-licenses"]') as HTMLElement;
      return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth, barScroll: bar.scrollWidth, barClient: bar.clientWidth, linkRight: link.getBoundingClientRect().right };
    });
    expect(m.scroll).toBeLessThanOrEqual(m.inner);
    expect(m.barScroll).toBeLessThanOrEqual(m.barClient);
    expect(m.linkRight).toBeLessThanOrEqual(m.inner);
  });
}
