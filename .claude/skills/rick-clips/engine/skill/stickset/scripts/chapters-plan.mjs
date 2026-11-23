// chapters-plan.mjs <timeline.json> <min> <max> <salt> <fps> → lines "id from to hash" (boundaries snapped to the frame grid).
// The hash covers the chapter's shots AND words, plus the film page and every .js module it loads (symlinked core included),
// so editing a set, the rig, the caption style or the voice invalidates the chapters it affects.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { splitChapters, chapterHash } from '../../../core/chapters.js';

const [file, min, max, salt, fps] = process.argv.slice(2);
const filmDir = dirname(file);
const { shots, words = [] } = JSON.parse(readFileSync(file, 'utf8'));
const snap = t => +(Math.round(t * +fps) / +fps).toFixed(6);

const walk = d => existsSync(d) ? readdirSync(d).sort().flatMap(n => { const p = join(d, n), st = statSync(p); return st.isDirectory() ? walk(p) : n.endsWith('.js') ? [p] : []; }) : [];
const code = createHash('sha1');
for (const f of [join(filmDir, 'index.html'), ...walk(join(filmDir, 'stickset'))]) if (existsSync(f)) code.update(f.slice(filmDir.length)).update(readFileSync(f));
const codeHash = code.digest('hex').slice(0, 12);

for (const c of splitChapters(shots, { min: +min, max: +max })) {
  const inChapter = { ...c, words: words.filter(w => w.start >= c.t0 && w.start < c.t1) };
  console.log(`${c.id} ${snap(c.t0)} ${snap(c.t1)} ${chapterHash(inChapter, `${salt}-${codeHash}`)}`);
}
