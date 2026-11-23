// Where the cast stands on the figure plane (px), pure so it can be tested in both formats. Sizes follow the frame's SHORT side
// (portrait 1080 wide, landscape 1080 high) so a figure's head stays in frame; x positions spread across the width.
export const unit = (W, H) => Math.min(W, H / 1.78);
const NEIGH = [['bea', 0.48, 0.83, 0.3], ['tomas', 0.2, 0.8, 0.27], ['mina', 0.78, 0.81, 0.3]];
// Per scene: where a single lead stands (x fraction, feet y fraction, size) and how a crowd is arranged there.
const STAGE = {
  bakery: { x: 0.5, y: 0.8, s: 0.34 }, street: { x: 0.5, y: 0.82, s: 0.3 }, shopfront: { x: 0.5, y: 0.86, s: 0.3 }, bench: { x: 0.72, y: 0.8, s: 0.34 },
  desk: { x: 0.28, y: 0.82, s: 0.32 }, clock: { x: 0.5, y: 0.82, s: 0.34 }, calendar: { x: 0.2, y: 0.86, s: 0.3 }, queue: { x: 0.3, y: 0.9, s: 0.34 },
  promise: { x: 0.5, y: 0.88, s: 0.3 }, talk: { x: 0.5, y: 0.84, s: 0.3 }, finale: { x: 0.5, y: 0.86, s: 0.3 },
};
export const CROWD = ['bea', 'tomas', 'mina', 'omar', 'lila', 'sam', 'nora'];

/** shot {id,set,cast,t0} → [{who,x,y,s,lead,pop?}] sorted back to front. The camera follows the one with lead:true (first of the cast). */
export function layout(shot, W, H, appearOf = () => shot.t0) {
  const U = unit(W, H), spread = Math.min(1, U * 1.9 / W), X = xf => W * (0.5 + (xf - 0.5) * spread), st = STAGE[shot.set] || STAGE.street;
  const leads = shot.cast.filter(c => c === 'rosa' || c === 'dario'), neigh = shot.cast.includes('neighbours'), crowd = shot.cast.includes('crowd');
  if (leads.length > 1 && (neigh || crowd)) throw new Error(`${shot.id}: too many characters (${leads.join(' and ')} with the neighbours); use at most one lead with them`);
  const first = shot.cast.find(c => c !== 'none'), out = [];
  leads.forEach((who, i) => out.push({ who, x: X(leads.length === 2 ? (i ? 0.72 : 0.28) : (neigh || crowd) ? 0.8 : st.x), y: H * st.y, s: U * st.s, lead: first === who }));
  if (neigh) NEIGH.forEach(([who, xf, y, s], i) => out.push({ who, x: X(leads.length ? 0.08 + (xf - 0.2) / 0.58 * 0.47 : xf), y: H * y, s: U * s, pop: appearOf('neighbours') + 0.15 + i * 0.3, lead: first === 'neighbours' && i === 0 }));
  if (crowd) CROWD.forEach((who, i) => {
    if (shot.set === 'queue') { const f = i / (CROWD.length - 1); out.push({ who, x: X(0.3 + 0.58 * f), y: H * (0.9 - 0.34 * f), s: U * (0.34 - 0.2 * f), pop: appearOf('crowd') + 0.1 + i * 0.22, lead: first === 'crowd' && i === 0 }); }   // a line receding into the distance
    else { const row = (i % 5) / 4; out.push({ who, x: X(0.14 + 0.72 * row), y: H * (st.y - 0.03 * (i % 2)), s: U * (st.s - 0.03 * (i % 2)) * 0.95, pop: appearOf('crowd') + 0.1 + i * 0.2, lead: first === 'crowd' && i === 0 }); }
  });
  return out.sort((a, b) => a.y - b.y);
}
