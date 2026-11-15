import type { Locator, Page } from '@playwright/test';

export type RGB = [number, number, number];

/** Parse a computed CSS colour (rgb()/rgba()) into [r,g,b] 0-255. Alpha is ignored; callers pass opaque colours. */
export function parseColor(css: string): RGB {
  const m = css.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if (!m) throw new Error(`Unparseable colour: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two opaque colours. */
export function ratio(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Screenshot an element with its text (and any text-clipped gradient fill) hidden, and return the lightest and darkest
 * background pixels behind it. Worst-case text contrast is the lower of the ratios against those two extremes.
 */
export async function sampleBackground(page: Page, el: Locator): Promise<{ lightest: RGB; darkest: RGB }> {
  await page.evaluate(() => document.fonts.ready); // fallback font -> Inter swap changes layout and the glow position
  await el.evaluate((node) => node.setAttribute('data-sample', ''));
  const style = await page.addStyleTag({
    content: '[data-sample],[data-sample] *{color:transparent!important;-webkit-text-fill-color:transparent!important;background:none!important;text-shadow:none!important;border-color:transparent!important;outline:none!important;box-shadow:none!important}',
  });
  const png = await el.screenshot({ animations: 'disabled' });
  await style.evaluate((n) => n.remove());
  await el.evaluate((node) => node.removeAttribute('data-sample'));
  await page.waitForTimeout(400); // colour transitions (150-250ms) restart from transparent once the override is gone
  const url = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let lo = [0, 0, 0], hi = [0, 0, 0], loL = Infinity, hiL = -1;
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d[i], d[i + 1], d[i + 2]);
      if (l < loL) { loL = l; lo = [d[i], d[i + 1], d[i + 2]]; }
      if (l > hiL) { hiL = l; hi = [d[i], d[i + 1], d[i + 2]]; }
    }
    return { lightest: hi as [number, number, number], darkest: lo as [number, number, number] };
  }, url);
}

export const worstRatio = (text: RGB, bg: { lightest: RGB; darkest: RGB }): number =>
  Math.min(ratio(text, bg.lightest), ratio(text, bg.darkest));
