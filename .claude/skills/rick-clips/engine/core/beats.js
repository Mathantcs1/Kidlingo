// Beat placement: turn "this narration line should be N shots" into the word indices where the new shots start.
// Pure. words = aligned script tokens of ONE narration line [{text,start,end}] (times relative or absolute, consistently).
const PUNCT_END = /[,.;:!?]$/;

/** → ascending token indices (>= 1) where shots 2..N begin. Spreads the shots evenly in time, prefers a cut right after punctuation,
 *  and never leaves a shot shorter than minGap (so it may return fewer than shots-1 indices: the line is just too short for N shots). */
export function placeBeats(words, shots, { minGap = 0.55 } = {}) {
  if (!words.length || shots < 2) return [];
  const t0 = words[0].start, t1 = words.at(-1).end + 0.15;
  for (let n = shots; n >= 2; n--) {
    const picked = []; let prev = t0, ok = true;
    for (let k = 1; k < n; k++) {
      const ideal = t0 + (t1 - t0) * k / n, remaining = n - k;   // shots still to fit after this cut
      let best = -1, bestCost = Infinity;
      for (let i = 1; i < words.length; i++) {
        const s = words[i].start;
        if (s - prev < minGap || t1 - s < minGap * remaining || picked.includes(i)) continue;
        const cost = Math.abs(s - ideal) - (PUNCT_END.test(words[i - 1].text) ? 0.25 : 0);
        if (cost < bestCost) { bestCost = cost; best = i; }
      }
      if (best < 0) { ok = false; break; }
      picked.push(best); prev = words[best].start;
    }
    if (ok) return picked;
  }
  return [];
}
