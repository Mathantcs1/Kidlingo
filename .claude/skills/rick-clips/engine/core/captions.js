// Word-by-word captions. Input words come from the speech check, aligned to the script's own words (align.js).
export const MIN_HOLD = 0.25;

/** words: {text,start,end}[] sorted by start → {text,t0,t1}[].
 *  A caption appears exactly at its word's start (never delayed), holds at least MIN_HOLD when nothing follows it closely,
 *  and is cut short by the next word's start or by the next shot cut (opts.cuts), so captions never overlap or cross a cut. */
export function buildCaptionTrack(words, { cuts = [] } = {}) {
  return words.map((w, i) => {
    const t0 = w.start;
    let t1 = Math.max(w.end, t0 + MIN_HOLD);
    if (words[i + 1]) t1 = Math.min(t1, Math.max(words[i + 1].start, t0));
    const cut = cuts.find(c => c > t0 + 1e-9);
    if (cut !== undefined) t1 = Math.min(t1, cut);
    return { text: w.text, t0, t1 };
  });
}

/** The caption text visible at time t, or null (pause or outside the film). */
export function captionAt(track, t) {
  const c = track.find(x => t >= x.t0 && t < x.t1);
  return c ? c.text : null;
}
