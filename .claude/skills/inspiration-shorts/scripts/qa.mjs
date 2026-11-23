// Layout QA: samples the page every 0.2s and fails on text off-frame, overlapping text, text over props, long dead air.
import { openProject } from './common.mjs';
const proj = process.argv[2];
const { browser, page } = await openProject(proj);
const dur = await page.evaluate(() => window.DURATION);
const TEXT = new Set(['chip', 'gold', 'banner', 'caption', 'counter', 'stamp', 'source']);
const errors = [], warns = []; const seen = new Set();
const add = (arr, key, msg) => { if (!seen.has(key)) { seen.add(key); arr.push(msg); } };
const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
let quiet = 0;
for (let t = 0; t < dur; t += 0.2) {
  const els = (await page.evaluate(t => window.qa(t), t)).filter(e => e.settled);
  const texts = els.filter(e => TEXT.has(e.kind)), props = els.filter(e => e.kind === 'prop' || e.kind === 'bars');
  for (const e of texts) if (e.x0 < 24 || e.x1 > 1056 || e.y0 < 60 || e.y1 > 1860) add(errors, `frame|${e.kind}|${e.text}`, `t=${t.toFixed(1)}s ${e.kind} "${e.text}" leaves the safe area (x ${e.x0 | 0}-${e.x1 | 0}, y ${e.y0 | 0}-${e.y1 | 0})`);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { const a = texts[i], b = texts[j]; if (a.kind === 'gold' && b.kind === 'gold') continue; if (ov(a, b) > 200) add(errors, `tt|${a.text}|${b.text}`, `t=${t.toFixed(1)}s text overlaps text: "${a.text}" / "${b.text}"`); }
  for (const a of texts) for (const p of props) { const o = ov(a, p); if (o > 600) add(a.kind === 'stamp' ? warns : errors, `tp|${a.kind}|${a.text}`, `t=${t.toFixed(1)}s ${a.kind} "${a.text}" covers a prop (${o | 0}px²)`); }
  const visibleNonCaption = texts.some(e => e.kind !== 'caption') || props.length > 0;
  quiet = visibleNonCaption ? 0 : quiet + 0.2; if (quiet >= 2.4) add(warns, 'dead' + (t | 0), `t=${t.toFixed(1)}s: ${quiet.toFixed(1)}s with nothing on screen but the caption (dead air)`);
}
await browser.close();
console.log(`QA: ${errors.length} error(s), ${warns.length} warning(s)`);
errors.forEach(e => console.log('  ERROR ', e)); warns.forEach(w => console.log('  warn  ', w));
process.exit(errors.length ? 1 : 0);
