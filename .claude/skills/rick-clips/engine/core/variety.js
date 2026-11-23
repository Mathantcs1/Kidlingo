// Storyboard lint: the pictures must follow the narration, not recycle two places. Returns a list of problems (empty = fine).
// Rules: enough different scenes for the length, no scene taking over, the camera changes every cut, and the same scene+camera
// is not repeated within 4 shots. Short test films (< 20 s) are only held to the camera rule.
export function checkVariety(shots, { window = 4, sizeOf = null } = {}) {
  const out = [], n = shots.length, dur = n ? shots.at(-1).t1 - shots[0].t0 : 0;
  const key = s => `${s.set}|${s.look || ''}|${s.cam}`;
  for (let i = 1; i < n; i++) if (shots[i].cam === shots[i - 1].cam) out.push(`${shots[i - 1].id} and ${shots[i].id} use the same camera "${shots[i].cam}": change it every cut`);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < Math.min(n, i + window); j++) if (key(shots[i]) === key(shots[j]) && !(j === i + 1 && shots[i].cam === shots[j].cam)) out.push(`${shots[i].id} and ${shots[j].id} repeat the same scene and camera (${shots[i].set}${shots[i].look ? '/' + shots[i].look : ''}, ${shots[i].cam}) within ${window} shots`);
  if (dur >= 20) {
    const sets = new Set(shots.map(s => s.set)), need = Math.max(5, Math.round(dur / 7));
    if (sets.size < need) out.push(`only ${sets.size} different scenes in ${dur.toFixed(0)} s (need at least ${need}): show what the voice is saying; give each idea its own scene`);
    const cams = new Set(shots.map(s => s.cam)); if (cams.size < Math.min(6, need + 1)) out.push(`only ${cams.size} different cameras; use more (${[...cams].join(', ')} so far)`);
    for (const set of sets) { const share = shots.filter(s => s.set === set).length / n; if (share > 0.4) out.push(`"${set}" fills ${Math.round(share * 100)}% of the shots: no scene may take over`); }
  }
  if (sizeOf && n >= 4) {   // coverage: a mix of wide / medium / close, never four of one size in a row
    for (let i = 0; i + 3 < n; i++) if ([1, 2, 3].every(j => sizeOf(shots[i + j].cam) === sizeOf(shots[i].cam))) { out.push(`${shots[i].id}..${shots[i + 3].id}: 4 shots in a row are all "${sizeOf(shots[i].cam)}": mix wide, medium and close`); break; }
    if (dur >= 20) { const sizes = new Set(shots.map(s => sizeOf(s.cam))); if (sizes.size < 3) out.push(`only ${sizes.size} shot size${sizes.size > 1 ? 's' : ''} (${[...sizes].join(', ')}): use wide, medium and close shots`); }
  }
  return out;
}
