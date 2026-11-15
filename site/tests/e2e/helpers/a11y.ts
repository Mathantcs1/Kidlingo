import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * axe reports text it cannot measure (gradients, translucent layers) as `incomplete`, not as a violation, so a plain
 * "no violations" check would silently skip exactly those nodes. Any incomplete colour-contrast node must match this
 * allow-list; each entry is verified another way (pixel-sampled worst-case ratio in contrast.spec.ts).
 */
const PIXEL = 'worst-case ratio pixel-sampled in contrast.spec.ts';
export const INCOMPLETE_CONTRAST_ALLOW: Array<{ selector: RegExp; why: string }> = [
  { selector: /^\.hero__lead$/, why: `hero/404 lead paragraph over the radial glow: ${PIXEL}` },
  { selector: /^h1$/, why: `hero/404 headline (large text) over the glow: ${PIXEL}` },
  // Other eyebrows sit on solid backgrounds (axe resolves them); only the hero one is over the glow. On the populated home
  // page axe qualifies it with its parent because several elements share the class.
  { selector: /^(\.hero__inner > )?\.section-heading__eyebrow$/, why: `hero eyebrow over the glow: ${PIXEL}` },
  { selector: /^\.hero__code$/, why: `404 code over the glow: ${PIXEL}` },
  // Hero "Watch demos" (learn/) is pixel-sampled in home.spec.ts; the about/apps ones in contrast.spec.ts and the 404 page.
  { selector: /^(\.hero__actions > )?\.btn--secondary\.btn\[href\$="(about|apps|learn)\/"\]$/, why: `transparent secondary buttons over the glow: ${PIXEL}` },
  { selector: /^a\[rel="home"\] > span$/, why: `header wordmark "To" gradient-clipped text: stops and background ${PIXEL}` },
  { selector: /^:root > span$/, why: `same header wordmark "To" span, reported by axe with a root-relative selector: ${PIXEL}` },
  { selector: /^\.site-footer__inner > div > \.wordmark > span$/, why: `footer wordmark "To" gradient-clipped text: ${PIXEL}` },
];

export async function axeProblems(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `violation ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`);
  const incomplete = results.incomplete
    .filter((v) => v.id === 'color-contrast')
    .flatMap((v) => v.nodes.map((n) => String(n.target)))
    .filter((target) => !INCOMPLETE_CONTRAST_ALLOW.some((a) => a.selector.test(target)))
    .map((t) => `incomplete color-contrast (unverified): ${t}`);
  return [...bad, ...incomplete];
}
