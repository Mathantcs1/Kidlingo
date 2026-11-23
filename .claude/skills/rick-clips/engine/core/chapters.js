// Long-form films are rendered as chapters so a revision or a crash re-renders one chapter, not the film. Node-side only.
import { createHash } from 'node:crypto';

/** shots: {id,t0,t1,...}[] → [{id:'chapter-NN', t0, t1, shots}]. Cuts only on shot boundaries; each chapter ≈ equal length,
 *  ≤ max whenever no single shot is longer than max - (the longest shot). A film ≤ max is one chapter. */
export function splitChapters(shots, { min = 20, max = 40 } = {}) {
  const total = shots.at(-1).t1 - shots[0].t0;
  const longest = Math.max(...shots.map(s => s.t1 - s.t0));
  const cap = Math.max(min, max - longest);
  const n = total <= max ? 1 : Math.ceil(total / cap), target = total / n;
  const chapters = []; let cur = [];
  for (const s of shots) {
    cur.push(s);
    if (chapters.length < n - 1 && s.t1 - cur[0].t0 >= target) { chapters.push(cur); cur = []; }
  }
  if (cur.length) chapters.push(cur);
  return chapters.map((c, i) => ({ id: `chapter-${String(i + 1).padStart(2, '0')}`, t0: c[0].t0, t1: c.at(-1).t1, shots: c }));
}

/** Content hash of a chapter plus a salt (size, fps, code version): a chapter is re-rendered only when this changes. */
export function chapterHash(chapter, salt = '') {
  return createHash('sha1').update(JSON.stringify(chapter)).update('\0').update(salt).digest('hex').slice(0, 16);
}
