import { test, expect, type Page } from '@playwright/test';
import { parseColor, ratio, sampleBackground, worstRatio } from './helpers/contrast';

const settle = (page: Page) => page.waitForTimeout(450); // longer than the 150-250ms transitions

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme}: button state contrast`, () => {
    test.use({ colorScheme: theme, viewport: { width: 1440, height: 900 } });

    async function colours(page: Page, selector: string) {
      const s = await page.locator(selector).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { fg: cs.color, bg: cs.backgroundColor };
      });
      return { fg: parseColor(s.fg), bg: parseColor(s.bg) };
    }

    test('primary button keeps white text >= 4.5:1 at rest, hover, active and focus', async ({ page }) => {
      await page.goto('/');
      const btn = page.locator('.hero .btn--primary');
      const sel = '.hero .btn--primary';
      let c = await colours(page, sel);
      expect(ratio(c.fg, c.bg), 'rest').toBeGreaterThanOrEqual(4.5);

      await btn.hover(); await settle(page);
      c = await colours(page, sel);
      expect(ratio(c.fg, c.bg), 'hover').toBeGreaterThanOrEqual(4.5);

      await page.mouse.down(); await settle(page);
      c = await colours(page, sel);
      expect(ratio(c.fg, c.bg), 'active').toBeGreaterThanOrEqual(4.5);
      await page.mouse.move(0, 0); // release off the link so it does not navigate
      await page.mouse.up();

      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab'); // skip link
      await btn.evaluate((el) => (el as HTMLElement).focus()); await settle(page);
      await expect(btn).toBeFocused();
      c = await colours(page, sel);
      expect(ratio(c.fg, c.bg), 'focus').toBeGreaterThanOrEqual(4.5);
    });

    test('secondary button text stays >= 4.5:1 on hover (opaque bg) and focus (over the hero)', async ({ page }) => {
      await page.goto('/');
      const sel = '.hero .btn--secondary';
      const btn = page.locator(sel);
      await btn.hover(); await settle(page);
      const c = await colours(page, sel);
      expect(ratio(c.fg, c.bg), 'hover').toBeGreaterThanOrEqual(4.5);

      await page.mouse.move(0, 0);
      await btn.evaluate((el) => (el as HTMLElement).focus()); await settle(page);
      const fg = parseColor(await btn.evaluate((el) => getComputedStyle(el).color));
      const bg = await sampleBackground(page, btn);
      expect(worstRatio(fg, bg), 'focus').toBeGreaterThanOrEqual(4.5);
    });

    test('disabled buttons stay readable (>= 4.5:1)', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        for (const v of ['primary', 'secondary']) {
          const b = document.createElement('button');
          b.className = `btn btn--${v}`; b.disabled = true; b.id = `dis-${v}`; b.textContent = 'Disabled';
          document.querySelector('.hero__actions')!.appendChild(b);
        }
      });
      for (const v of ['primary', 'secondary']) {
        const c = await colours(page, `#dis-${v}`);
        const bg = c.bg[0] + c.bg[1] + c.bg[2] === 0 && v === 'secondary'
          ? await sampleBackground(page, page.locator(`#dis-${v}`))
          : { lightest: c.bg, darkest: c.bg };
        expect(worstRatio(c.fg, bg), v).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  test.describe(`${theme}: text over gradients (pixel sampled)`, () => {
    test.use({ colorScheme: theme });
    const pages: Array<{ path: string; checks: Array<[string, string, number]> }> = [
      {
        path: '/',
        checks: [
          ['hero eyebrow', '.hero .section-heading__eyebrow', 4.5],
          ['hero lead', '.hero__lead', 4.5],
          ['hero h1 (large)', '.hero h1', 3],
          ['hero secondary button', '.hero .btn--secondary', 4.5],
          ['footer tagline', '.site-footer__tagline', 4.5],
        ],
      },
      {
        path: '/this-page-does-not-exist/',
        checks: [
          ['404 code', '.hero__code', 4.5],
          ['404 lead', '.hero__lead', 4.5],
          ['404 h1 (large)', '.hero h1', 3],
          ['404 secondary button', '.hero .btn--secondary', 4.5],
        ],
      },
    ];
    for (const { path, checks } of pages) {
      for (const width of [1440, 390]) {
        test(`${path} gradient text contrast at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          await settle(page);
          const fgOf = async (sel: string) => parseColor(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).color));
          // Wordmarks: "Idea"/"Apps" use the ink colour; "To" is a violet-to-blue gradient fill, so test both stops. 20px/800 counts as large text.
          const stops = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            return [cs.getPropertyValue('--violet').trim(), cs.getPropertyValue('--blue').trim()];
          });
          // Sample the translucent sticky header before anything scrolls underneath it.
          for (const sel of ['.site-header .wordmark', '.site-footer .wordmark']) {
            const wm = page.locator(sel);
            const bg = await sampleBackground(page, wm);
            for (const [name, colour] of [['ink', await fgOf(sel)], ['violet', parseHex(stops[0])], ['blue', parseHex(stops[1])]] as const) {
              expect(worstRatio(colour, bg), `${sel} ${name}`).toBeGreaterThanOrEqual(3);
            }
          }
          for (const [name, sel, min] of checks) {
            const bg = await sampleBackground(page, page.locator(sel).first());
            expect(worstRatio(await fgOf(sel), bg), name).toBeGreaterThanOrEqual(min);
          }
        });
      }
    }
  });
}

function parseHex(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
