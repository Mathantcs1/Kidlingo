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
  // SVG figure text: axe cannot resolve the rect painted under an SVG <text>, so it reports "incomplete". blog-figures.spec.ts computes
  // each text's fill against the shape underneath and requires 4.5:1 in both themes. Not scoped to .ita-figure: axe prints the shortest
  // unique selector (often a bare text[y="38"]), so the ancestors are not reliably in the string; no other SVG text exists on the site.
  { selector: /(?:^|> )text\[[^>]*\]$/, why: 'blog figure text over its box: ratio computed in blog-figures.spec.ts' },
  { selector: /^a\[rel="home"\] > span$/, why: `header wordmark "To" gradient-clipped text: stops and background ${PIXEL}` },
  { selector: /^:root > span$/, why: `same header wordmark "To" span, reported by axe with a root-relative selector: ${PIXEL}` },
  { selector: /^\.site-footer__inner > div > \.wordmark > span$/, why: `footer wordmark "To" gradient-clipped text: ${PIXEL}` },
  // Article tables scroll inside themselves on a phone, so axe sees the clipped cells (and the caption once scrolled) as "partially
  // obscured". The table test in content.spec.ts computes every caption/th/td colour against its painted background (>= 4.5:1).
  { selector: /^(?:tr:nth-child\(\d+\) > )?(?:td|th)(?::nth-child\(\d+\)|\[scope="(?:row|col)"\])?$|^caption$/, why: 'cells of a scrolling article table: ratio computed in content.spec.ts' },
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
