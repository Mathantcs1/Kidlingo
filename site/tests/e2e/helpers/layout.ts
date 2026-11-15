import type { Page } from '@playwright/test';

/** Pixels the page is wider than the viewport (<= 0 means no horizontal overflow). */
export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
