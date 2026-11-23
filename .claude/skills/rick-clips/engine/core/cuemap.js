// Cue-map check: every cut must land within one frame of a word start.
/** cues: {t,type}[], words: {text,start,end}[] → violation strings (empty = ok). */
export function checkCueMap(cues, words, fps) {
  const tol = 1 / fps + 1e-9, out = [];
  for (const c of cues) {
    if (c.type !== 'cut') continue;
    const near = words.reduce((m, w) => Math.min(m, Math.abs(w.start - c.t)), Infinity);
    if (near > tol) out.push(`cut at ${c.t} is ${near.toFixed(3)} s from the nearest word start`);
  }
  return out;
}
