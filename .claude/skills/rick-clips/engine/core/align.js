// Put the SCRIPT's words (correct spelling, punctuation, numbers) onto the speech check's timings.
// asr: [[word, start, end], ...] from asr_check words.json (start may be negative on a line's first word).
const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const round = x => Math.round(x * 1e6) / 1e6;

/** → {text,start,end}[]. Punctuation-only tokens ("—") are dropped. Equal counts map one to one. Otherwise tokens that match a heard word
 *  (same letters/digits) are anchored to its exact time, and only the unmatched stretches between anchors share their span of speech
 *  (by token length), so pauses between anchors are kept. onFallback(message) is called when any token had to be spread. */
export function alignWords(text, asr, onFallback) {
  const tokens = text.trim().split(/\s+/).filter(t => t && !PUNCT_ONLY.test(t));
  if (!asr.length || !tokens.length) return [];
  const a = asr.map(([w, s, e]) => ({ n: norm(w), s: Math.max(0, s), e: Math.max(0, e) }));
  if (tokens.length === a.length) return tokens.map((t, i) => ({ text: t, start: a[i].s, end: a[i].e }));

  const tn = tokens.map(norm), n = tn.length, m = a.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));   // longest common subsequence of normalised words
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = tn[i] && tn[i] === a[j].n ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const match = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (tn[i] && tn[i] === a[j].n && L[i][j] === L[i + 1][j + 1] + 1) match[i++] = j++;
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const out = new Array(n), spread = [];
  let ti = 0, aj = 0;
  const flush = (ti1, aj1) => {   // tokens [ti, ti1) share heard words [aj, aj1)
    if (ti1 <= ti) return;
    const prevEnd = ti > 0 ? out[ti - 1].end : a[0].s;
    const start = aj < aj1 ? a[aj].s : prevEnd, end = aj < aj1 ? a[aj1 - 1].e : Math.min(prevEnd + 0.15 * (ti1 - ti), aj1 < m ? Math.max(prevEnd, a[aj1].s) : Infinity);
    const total = tokens.slice(ti, ti1).reduce((k, t) => k + t.length, 0); let at = start;
    for (let i = ti; i < ti1; i++) { const e = at + (end - start) * (tokens[i].length / total); out[i] = { text: tokens[i], start: round(at), end: round(e) }; at = e; spread.push(tokens[i]); }
  };
  for (let i = 0; i < n; i++) if (match[i] >= 0) { flush(i, match[i]); out[i] = { text: tokens[i], start: a[match[i]].s, end: a[match[i]].e }; ti = i + 1; aj = match[i] + 1; }
  flush(n, m);
  if (spread.length && onFallback) onFallback(`could not match to speech, timing spread: ${spread.map(t => `"${t}"`).join(', ')}`);
  return out;
}
