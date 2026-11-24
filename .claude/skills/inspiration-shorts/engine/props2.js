// Batch 2 props: rigged actors (Pride Parables look), expressive Pride, and per-episode locations/props.
// Same conventions as props.js: (opts) => { svg, w, h }, anchored bottom-centre, ink outline 7. Rig groups: .armL .armR .legL .legR .head (data-px/py = pivot) and .mouth for talk.
(function () {
  const P = window.PROPS, INK = '#241532';
  const O = `stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"`;
  const wrap = (vb, w, h, body, extra = '') => ({ w, h, svg: `<svg width="${w}" height="${h}" viewBox="${vb}" overflow="visible">${extra}<g ${O}>${body}</g></svg>` });
  const sh = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join(''); };
  let uid = 0; const id = p => p + (++uid);

  // ---------- hand-held things (drawn in arm-local coords, hand at ~ (0,0) pointing down) ----------
  const HOLD = {
    phone: (g) => `<g transform="translate(-4,-30) rotate(-8)"><rect x="-17" y="-34" width="38" height="66" rx="8" fill="#20222e"/><rect x="-12" y="-28" width="28" height="52" rx="4" fill="${g || '#7fe3ff'}" stroke-width="0"/></g>`,
    pad: () => `<g transform="translate(6,-26) rotate(6)"><rect x="-28" y="-40" width="56" height="76" rx="6" fill="#f6ecd6"/><rect x="-14" y="-48" width="28" height="14" rx="4" fill="#9a8a6a" stroke-width="5"/><path d="M-18 -18 h36 M-18 -4 h36 M-18 10 h24" stroke-width="4" fill="none"/></g>`,
    mug: () => `<g transform="translate(0,-18)"><rect x="-20" y="-24" width="38" height="42" rx="8" fill="#fff"/><path d="M18 -14 q22 2 0 22" fill="none" stroke-width="6"/></g>`,
    case: () => `<g transform="translate(0,6)"><rect x="-44" y="-4" width="88" height="62" rx="8" fill="#8a5a2b"/><rect x="-14" y="-16" width="28" height="14" rx="5" fill="none" stroke-width="6"/><rect x="-6" y="14" width="12" height="9" fill="#ffd21f" stroke-width="3"/></g>`,
    paper: () => `<g transform="translate(6,-20) rotate(10)"><rect x="-26" y="-44" width="52" height="68" rx="3" fill="#fff"/><path d="M-14 -26 h28 M-14 -12 h28 M-14 2 h18" stroke-width="4" fill="none"/></g>`,
    bag: () => `<g transform="translate(0,8)"><path d="M-30 0 h60 l8 50 h-76Z" fill="#e0a85c"/><path d="M-14 0 q14 -30 28 0" fill="none" stroke-width="6"/></g>`,
    loaf: () => `<g transform="translate(0,-8)"><ellipse cx="0" cy="0" rx="40" ry="24" fill="#d9a35f"/><path d="M-20 -12 l12 14 M0 -16 l12 16 M18 -10 l10 12" stroke-width="5" fill="none"/></g>`,
    wand: () => `<g transform="translate(0,-10)"><rect x="-6" y="-70" width="12" height="90" rx="5" fill="#e0a85c"/><circle cx="0" cy="-76" r="10" fill="#ffd21f"/></g>`,
    spoon: () => `<g transform="translate(0,-10) rotate(-20)"><rect x="-5" y="-60" width="10" height="80" rx="5" fill="#cfd3e0"/><ellipse cx="0" cy="-66" rx="16" ry="20" fill="#cfd3e0"/></g>`,
    candle: () => `<g transform="translate(0,-6)"><rect x="-14" y="-44" width="28" height="56" rx="6" fill="#ffd9a0"/><path d="M0 -50 q-12 -16 0 -34 q12 18 0 34Z" fill="#ff9a2e" stroke-width="4"/></g>`
  };

  // ---------- face (shared by actor) ----------
  const moodMouth = { worried: 'M-18 80 q9 -9 18 0 q9 9 18 0', shock: 'M-10 68 q10 -16 20 0 q-10 20 -20 0Z', smug: 'M-18 76 q18 6 34 -8', sad: 'M-18 82 q18 -16 36 0', angry: 'M-18 80 q18 -10 36 0', happy: 'M-22 68 q22 26 44 0 q-22 6 -44 0Z', neutral: 'M-18 72 q18 12 36 0', tired: 'M-16 78 h32', cheer: 'M-26 64 q26 34 52 0Z', flat: 'M-16 76 h32' };
  const moodBrow = { worried: 'M-42 24 l24 6M42 24 l-24 6', shock: 'M-42 14 l24 -4M42 14 l-24 -4', angry: 'M-42 22 l24 10M42 22 l-24 10', sad: 'M-42 34 l24 -10M42 34 l-24 -10', smug: 'M-42 28 l24 -4M42 34 l-24 -2', happy: 'M-40 28 q12 -12 22 -4M40 28 q-12 -12 -22 -4', tired: 'M-42 30 l24 4M42 30 l-24 4', cheer: 'M-40 24 q12 -14 22 -4M40 24 q-12 -14 -22 -4' };
  function face(c) {
    const hat = c.hat ? `<path d="M-70 30 q4 -58 70 -62 q66 4 70 62 q-34 -22 -70 -22 q-36 0 -70 22Z" fill="${c.hat}"/>`
      : (c.hairStyle === 'bald' ? '' : c.hairStyle === 'curly' ? [[-52, 2], [-28, -22], [0, -30], [28, -22], [52, 2], [-62, 28], [62, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="22" fill="${c.hair}"/>`).join('') : c.hairStyle === 'grey' ? `<path d="M-68 38 q-6 -64 68 -66 q74 2 68 66 q-26 -30 -68 -30 q-42 0 -68 30Z" fill="${c.hair}"/><circle cx="0" cy="-44" r="30" fill="${c.hair}"/>` : `<path d="M-68 38 q-6 -64 68 -66 q74 2 68 66 q-26 -30 -68 -30 q-42 0 -68 30Z" fill="${c.hair}"/>` + (c.hairStyle === 'bun' ? `<circle cx="0" cy="-40" r="26" fill="${c.hair}"/>` : ''));
    const backHair = c.hairStyle === 'long' && !c.hat ? `<path d="M-74 30 q-18 70 -4 130 h30 q-6 -60 6 -110Z M74 30 q18 70 4 130 h-30 q6 -60 -6 -110Z" fill="${c.hair}"/>` : '';
    const eyes = c.mood === 'tired' ? `<path d="M-34 50 q10 6 20 0 M14 50 q10 6 20 0" fill="none" stroke-width="6"/><path d="M-32 62 q8 8 18 2 M14 64 q10 6 18 -2" fill="none" stroke="${INK}" stroke-width="3" opacity=".5"/>` : c.mood === 'shock' ? `<circle cx="-24" cy="48" r="10" fill="#fff" stroke-width="4"/><circle cx="24" cy="48" r="10" fill="#fff" stroke-width="4"/><circle cx="-24" cy="48" r="4" fill="${INK}" stroke="none"/><circle cx="24" cy="48" r="4" fill="${INK}" stroke="none"/>`
      : `<circle cx="-24" cy="48" r="7" fill="${INK}" stroke="none"/><circle cx="24" cy="48" r="7" fill="${INK}" stroke="none"/><circle cx="-21" cy="45" r="2.4" fill="#fff" stroke="none"/><circle cx="27" cy="45" r="2.4" fill="#fff" stroke="none"/>`;
    const m = moodMouth[c.mood] || moodMouth.neutral;
    return `${backHair}<circle cx="0" cy="40" r="68" fill="${c.skin}"/>${c.beard ? `<path d="M-60 56 q10 64 60 66 q50 -2 60 -66 q-14 28 -60 28 q-46 0 -60 -28Z" fill="${c.hair}"/>` : ''}${hat}
 ${c.band ? `<path d="M-68 22 q68 -24 136 0 l-2 16 q-66 -22 -132 0Z" fill="${c.band}"/>` : ''}${eyes}
 ${c.glasses ? `<circle cx="-24" cy="48" r="17" fill="none"/><circle cx="24" cy="48" r="17" fill="none"/><path d="M-7 48 h14"/>` : ''}
 <path d="${moodBrow[c.mood] || 'M-40 30 l22 -4M40 30 l-22 -4'}" fill="none" stroke-width="6"/>
 ${c.sweat || c.mood === 'worried' ? `<path d="M64 -2 q-14 24 0 30 q14 -6 0 -30Z" fill="#9fdcff" stroke-width="4"/>` : ''}
 ${c.stache ? `<path d="M-30 62 q14 -10 30 0 q16 -10 30 0 q-8 14 -30 6 q-22 8 -30 -6Z" fill="${c.hair}"/>` : ''}
 <ellipse cx="-40" cy="66" rx="9" ry="5" fill="#ff8a8a" stroke="none" opacity=".6"/><ellipse cx="40" cy="66" rx="9" ry="5" fill="#ff8a8a" stroke="none" opacity=".6"/>
 <path class="mouth" data-closed="${m}" d="${m}" fill="none" stroke-width="5"/>`;
  }

  // ---------- rigged person ----------
  P.actor = (o = {}) => {
    const c = Object.assign({ body: '#3a4a9f', body2: '#2c3a80', pants: '#232a55', skin: '#f3b27a', hair: '#5a3a22', hat: null, tie: null, shirt: '#fff', hood: false, glasses: false, hairStyle: 'short', beard: false, stache: false, mood: 'neutral', sweat: false, band: null, apron: null, hold: null, holdL: null, glow: null, shoe: '#14161f', skirt: null, scarf: null }, o);
    const torso = c.hood
      ? `<path d="M-64 124 q0 -30 32 -30 h64 q32 0 32 30 V268 q0 10 -10 10 H-54 q-10 0 -10 -10Z" fill="${c.body}"/><path d="M-30 96 q30 34 60 0" fill="${c.body2}"/><rect x="-34" y="190" width="68" height="40" rx="12" fill="${c.body2}"/>`
      : `<path d="M-62 120 q0 -26 30 -26 h64 q30 0 30 26 V268 H-62Z" fill="${c.body}"/><path d="M-26 94 L0 168 L26 94 Z" fill="${c.shirt}"/>${c.tie ? `<path d="M-2 120 h4 l5 48 l-7 12 l-7 -12Z" fill="${c.tie}" stroke-width="4"/>` : ''}`;
    const apron = c.apron ? `<path d="M-46 150 h92 l8 118 H-54Z" fill="${c.apron}"/><path d="M-30 150 L-26 108 M30 150 L26 108" stroke-width="5" fill="none"/>` : '';
    const skirt = c.skirt ? `<path d="M-62 250 h124 l22 100 h-168Z" fill="${c.skirt}"/>` : '';
    const sleeve = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="42"/><path d="${d}" fill="none" stroke="${c.body}" stroke-width="29"/>`;
    const leg = (x, cls) => `<g class="${cls}" data-px="${x}" data-py="252"><path d="M${x} 252 V334" fill="none" stroke="${INK}" stroke-width="44"/><path d="M${x} 252 V334" fill="none" stroke="${c.pants}" stroke-width="31"/><rect x="${x - 28}" y="326" width="56" height="28" rx="12" fill="${c.shoe}"/></g>`;
    const arm = (sx, cls, d, hx, hy, hold) => `<g class="${cls}" data-px="${sx}" data-py="130">${sleeve(d)}<circle cx="${hx}" cy="${hy}" r="17" fill="${c.skin}"/><g transform="translate(${hx},${hy})">${hold ? (HOLD[hold] ? HOLD[hold](c.glow) : '') : ''}</g></g>`;
    const body = `${leg(-30, 'legL')}${leg(30, 'legR')}${skirt}${torso}${apron}${c.scarf ? `<path d="M-46 104 q46 34 92 0 l4 22 q-50 34 -100 0Z" fill="${c.scarf}"/>` : ''}
 ${arm(-56, 'armL', 'M-56 130 q-34 36 -26 94', -82, 232, c.holdL)}${arm(56, 'armR', 'M56 130 q34 36 26 94', 82, 232, c.hold)}
 <g class="head" data-px="0" data-py="104">${face(c)}</g>`;
    return wrap('-170 -70 340 440', 340, 440, body);
  };

  // ---------- Pride: the petty purple shadow, with moods and arms ----------
  P.pride2 = (o = {}) => {
    const c = o.color || '#5b3aa8', m = o.mood || 'smug', Y = '#ffd21f';
    const eyes = { smug: `<path d="M40 78 q18 -16 36 0 q-18 8 -36 0Z M94 78 q18 -16 36 0 q-18 8 -36 0Z" fill="${Y}" stroke-width="5"/><path d="M46 78 h24 M100 78 h24" stroke-width="6"/>`,
      wide: `<circle cx="58" cy="74" r="17" fill="${Y}" stroke-width="5"/><circle cx="112" cy="74" r="17" fill="${Y}" stroke-width="5"/><circle cx="58" cy="76" r="6" fill="${INK}" stroke="none"/><circle cx="112" cy="76" r="6" fill="${INK}" stroke="none"/>`,
      happy: `<path d="M40 82 q18 -26 36 0 M94 82 q18 -26 36 0" fill="none" stroke="${Y}" stroke-width="10"/><path d="M40 82 q18 -26 36 0 M94 82 q18 -26 36 0" fill="none" stroke-width="4"/>`,
      sulk: `<path d="M40 70 q18 6 36 18 q-18 4 -36 -18Z M130 70 q-18 6 -36 18 q18 4 36 -18Z" fill="${Y}" stroke-width="5"/>`,
      sly: `<path d="M40 82 h36 q-18 -22 -36 0Z M94 82 h36 q-18 -22 -36 0Z" fill="${Y}" stroke-width="5"/><path d="M36 64 l44 10 M134 64 l-44 10" stroke-width="7"/>` }[m === 'cackle' ? 'happy' : m === 'gasp' ? 'wide' : m === 'offended' ? 'sulk' : m === 'hiss' ? 'sly' : m === 'smirk' ? 'smug' : m] || '';
    const mouth = { smug: `<path d="M48 124 q37 36 76 0 q-38 -12 -76 0Z" fill="#1c1233"/><path d="M62 128 l6 8 l6 -8 M96 128 l6 8 l6 -8" fill="#fff" stroke-width="3"/>`, smirk: `<path d="M54 128 q40 10 64 -14" fill="none" stroke-width="7"/>`, gasp: `<ellipse cx="86" cy="132" rx="16" ry="22" fill="#1c1233"/>`, sulk: `<path d="M56 140 q30 -26 60 0" fill="none" stroke-width="7"/>`, offended: `<path d="M56 140 q30 -26 60 0" fill="none" stroke-width="7"/>`, cackle: `<path d="M46 118 q40 56 80 0Z" fill="#1c1233"/><path d="M62 140 q24 -14 48 0 q-24 20 -48 0Z" fill="#ff6a8a" stroke-width="3"/>`, hiss: `<path d="M50 126 l12 -10 l12 10 l12 -10 l12 10 l12 -10 l12 10" fill="none" stroke-width="7"/>`, happy: `<path d="M48 124 q37 36 76 0 q-38 -12 -76 0Z" fill="#1c1233"/>` }[m] || '';
    const arm = (sx, cls, d, hx, hy) => `<g class="${cls}" data-px="${sx}" data-py="120"><path d="${d}" fill="none" stroke="${INK}" stroke-width="26"/><path d="${d}" fill="none" stroke="${c}" stroke-width="14"/><circle cx="${hx}" cy="${hy}" r="13" fill="${c}"/></g>`;
    const hold = o.hold === 'popcorn' ? `<g transform="translate(160,180)"><path d="M-22 -30 h44 l-8 56 h-28Z" fill="#fff" /><path d="M-22 -30 l10 56 M0 -30 v56 M22 -30 l-10 56" stroke="#e0543a" stroke-width="5"/><circle cx="-12" cy="-40" r="12" fill="#fff6c9" stroke-width="4"/><circle cx="6" cy="-46" r="12" fill="#fff6c9" stroke-width="4"/><circle cx="18" cy="-38" r="10" fill="#fff6c9" stroke-width="4"/></g>`
      : o.hold === 'tea' ? `<g transform="translate(162,176)"><rect x="-16" y="-24" width="32" height="34" rx="7" fill="#fff"/><path d="M16 -16 q16 2 0 16" fill="none" stroke-width="5"/><path d="M-6 -34 q-6 -10 0 -18 M6 -34 q-6 -10 0 -18" fill="none" stroke-width="3"/></g>`
      : o.hold === 'flag' ? `<g transform="translate(160,170)"><rect x="-3" y="-90" width="6" height="110" fill="${INK}"/><path d="M3 -90 h54 l-12 16 l12 16 h-54Z" fill="#ffd21f" stroke-width="4"/></g>` : '';
    const body = `<path d="M26 24 l-18 -38 l42 22Z M144 24 l18 -38 l-42 22Z" fill="${c}"/>
 ${arm(30, 'armL', 'M30 130 q-34 14 -30 58', 0, 192)}${arm(140, 'armR', 'M140 130 q34 14 30 58', 170, 192)}
 <path d="M20 84 q0 -74 65 -74 q65 0 65 74 q0 62 -18 104 q-8 16 -26 16 h-42 q-18 0 -26 -16 q-18 -42 -18 -104Z" fill="${c}"/>
 ${eyes}${mouth}${hold}`;
    return wrap('-40 -40 260 260', 260, 260, body);
  };

  // ======================================================================================
  // EPISODE 1: One More Reel (night bedroom, dawn kitchenette, the big phone)
  // ======================================================================================
  P.bedroom = (o = {}) => { const g = id('bg'), w = id('wn');
    return wrap('0 0 1080 900', 1080, 900, `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171a4a"/><stop offset="1" stop-color="#2b2467"/></linearGradient><linearGradient id="${w}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1038"/><stop offset="1" stop-color="#3a3f8f"/></linearGradient></defs>
 <rect x="0" y="0" width="1080" height="760" fill="url(#${g})" stroke="none"/><rect x="0" y="740" width="1080" height="160" fill="#2a1f55" stroke="none"/><path d="M0 740 H1080" stroke-width="8"/>
 <rect x="80" y="70" width="330" height="400" rx="14" fill="url(#${w})"/><circle cx="300" cy="190" r="54" fill="#fff6c9"/><circle cx="318" cy="176" r="46" fill="#0b1038" stroke="none"/>
 <path d="M80 470 V400 h40 v-50 h46 v70 h50 v-110 h56 v90 h44 v-60 h54 v130Z" fill="#141a4a" stroke-width="5"/>${[[130,140],[220,110],[360,300],[170,260]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff6c9" stroke="none"/>`).join('')}
 <path d="M245 70 V470 M80 270 H410" stroke-width="8" fill="none"/>
 <rect x="560" y="120" width="200" height="140" rx="10" fill="#3d3aa8"/><path d="M590 230 l40 -60 l34 40 l26 -28 l50 48Z" fill="#6a63e0" stroke-width="5"/><circle cx="680" cy="170" r="14" fill="#ffd21f" stroke-width="5"/>
 <rect x="820" y="520" width="200" height="220" rx="12" fill="#3a2f78"/><path d="M820 600 H1020" stroke-width="6"/><circle cx="920" cy="560" r="9" fill="#ffd21f" stroke-width="4"/><circle cx="920" cy="670" r="9" fill="#ffd21f" stroke-width="4"/>
 <path d="M880 520 l-16 -80 h112 l-16 80Z" fill="#ffd9a0"/><rect x="916" y="500" width="8" height="24" fill="${INK}"/><circle cx="920" cy="470" r="150" fill="#ffd9a0" opacity=".10" stroke="none"/>
 <rect x="836" y="480" width="64" height="40" rx="8" fill="#20222e"/><text x="868" y="510" font-size="28" font-family="Poppins" font-weight="800" fill="#7fe3ff" stroke="none" text-anchor="middle">2:14</text>`); };
  P.bed = (o = {}) => wrap('0 0 760 340', 760, 340, `<rect x="0" y="20" width="60" height="320" rx="14" fill="#5a3a22"/><rect x="40" y="130" width="720" height="210" rx="26" fill="#3b2a6e"/>
 <rect x="40" y="150" width="720" height="40" fill="#7a52d9"/><path d="M40 236 H760" stroke-width="5" opacity=".5"/><path d="M200 150 V340 M380 150 V340 M560 150 V340" stroke="${INK}" stroke-width="4" opacity=".25"/>
 <rect x="600" y="100" width="130" height="70" rx="34" fill="#f6ecd6"/><rect x="60" y="102" width="130" height="64" rx="30" fill="#f6ecd6"/>
 <rect x="30" y="300" width="60" height="40" rx="6" fill="#5a3a22"/><rect x="700" y="300" width="60" height="40" rx="6" fill="#5a3a22"/>`);
  P.kitchenette = (o = {}) => { const g = id('kg'), w = id('kw');
    return wrap('0 0 1080 900', 1080, 900, `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0d6"/><stop offset="1" stop-color="#ffd7a8"/></linearGradient><linearGradient id="${w}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb3ff"/><stop offset=".6" stop-color="#ffb08a"/><stop offset="1" stop-color="#ffe29a"/></linearGradient></defs>
 <rect x="0" y="0" width="1080" height="900" fill="url(#${g})" stroke="none"/>
 <rect x="560" y="70" width="400" height="330" rx="14" fill="url(#${w})"/><path d="M760 70 V400 M560 235 H960" stroke-width="8"/><circle cx="700" cy="330" r="46" fill="#ffe29a" stroke-width="5"/>
 <rect x="30" y="150" width="250" height="750" rx="18" fill="#e9eef7"/><path d="M30 440 H280" stroke-width="7"/><rect x="236" y="270" width="12" height="90" rx="6" fill="#9aa4c0" stroke-width="3"/><rect x="236" y="500" width="12" height="150" rx="6" fill="#9aa4c0" stroke-width="3"/>
 <rect x="330" y="560" width="750" height="340" fill="#4a7f8c"/><path d="M330 560 H1080" stroke-width="8"/><rect x="330" y="540" width="750" height="30" fill="#d9d2c4"/>
 ${[0,1,2,3].map(i => `<rect x="${350 + i * 180}" y="600" width="160" height="270" rx="8" fill="#5b95a3" stroke-width="5"/><circle cx="${420 + i * 180}" cy="640" r="8" fill="#ffd21f" stroke-width="3"/>`).join('')}
 <rect x="330" y="150" width="200" height="180" rx="10" fill="#d9a35f"/><path d="M430 150 V330" stroke-width="5"/><circle cx="410" cy="240" r="7" fill="${INK}" stroke="none"/><circle cx="450" cy="240" r="7" fill="${INK}" stroke="none"/>`); };
  P.kettle = (o = {}) => wrap('0 0 200 220', 200, 220, `<path d="M30 190 q-6 -90 40 -110 h60 q46 20 40 110Z" fill="${o.color || '#cfd6e6'}"/><rect x="60" y="62" width="80" height="22" rx="10" fill="#9aa4c0"/><path d="M168 150 q40 -14 20 -50 l-30 -2" fill="none" stroke-width="9"/><path d="M30 130 q-30 -14 -18 -46 q16 -14 30 8" fill="none" stroke-width="9"/><circle cx="100" cy="46" r="10" fill="${INK}" stroke="none"/><path d="M60 192 h80" stroke-width="9"/>${o.steam ? `<path d="M80 30 q-10 -18 0 -34 M120 30 q-10 -18 0 -34" fill="none" stroke="#fff" stroke-width="6" opacity=".7"/>` : ''}`);
  // the big phone: screen = reel1 (cat) | reel2 (stairs) | sleep | slides | chat | feed | replies | call
  P.bigphone = (o = {}) => { const s = o.screen || 'reel1', W = 560, H = 1000;
    const scr = {
      reel1: `<rect x="40" y="60" width="480" height="880" fill="#ffd9a0"/><circle cx="280" cy="500" r="150" fill="#f2a45a"/><path d="M160 400 l-10 -110 l80 60Z M400 400 l10 -110 l-80 60Z" fill="#f2a45a"/><circle cx="230" cy="480" r="16" fill="${INK}" stroke="none"/><circle cx="330" cy="480" r="16" fill="${INK}" stroke="none"/><path d="M255 530 q25 22 50 0" fill="none" stroke-width="6"/><path d="M180 520 h-70 M180 545 l-64 20 M380 520 h70 M380 545 l64 20" stroke-width="5"/><circle cx="280" cy="520" r="9" fill="#ff7a8a" stroke-width="4"/>`,
      reel2: `<rect x="40" y="60" width="480" height="880" fill="#cfe8ff"/><path d="M80 800 h100 v-90 h100 v-90 h100 v-90 h100 v-90 h-20" fill="#d9a35f" stroke-width="7"/><path d="M80 800 H500 V900 H80Z" fill="#8a5a2b"/><circle cx="170" cy="560" r="34" fill="#f3b27a"/><rect x="130" y="598" width="80" height="110" rx="18" fill="#3a4a9f"/><rect x="214" y="560" width="22" height="90" rx="8" fill="#e0a85c" transform="rotate(30 214 560)"/>`,
      sleep: `<rect x="40" y="60" width="480" height="880" fill="#14184a"/><circle cx="280" cy="330" r="110" fill="#fff6c9"/><circle cx="326" cy="300" r="96" fill="#14184a" stroke="none"/><rect x="90" y="560" width="380" height="150" rx="20" fill="#fff"/><path d="M130 610 h300 M130 660 h200" stroke-width="12" fill="none"/><text x="280" y="840" font-size="64" font-family="Poppins" font-weight="800" fill="#fff" stroke="none" text-anchor="middle">Zzz</text>`,
      chat: `<rect x="40" y="60" width="480" height="880" fill="#f4efe6"/><rect x="70" y="120" width="360" height="150" rx="30" fill="#fff"/><path d="M110 170 h280 M110 218 h200" stroke-width="12" fill="none"/><rect x="130" y="320" width="330" height="120" rx="30" fill="#7a52d9"/><path d="M170 366 h240 M170 406 h120" stroke="#fff" stroke-width="12" fill="none"/><rect x="70" y="500" width="360" height="110" rx="30" fill="#fff"/><path d="M110 556 h200" stroke-width="12" fill="none"/>`,
      feed: `<rect x="40" y="60" width="480" height="880" fill="#f6f7fb"/><circle cx="110" cy="140" r="34" fill="#c9b8a0"/><path d="M164 130 h200 M164 162 h120" stroke-width="12" fill="none"/><rect x="70" y="210" width="420" height="330" rx="20" fill="#f2c27a"/><ellipse cx="280" cy="400" rx="150" ry="90" fill="#d9a35f"/><path d="M190 370 l22 30 M260 350 l22 34 M330 366 l20 30" stroke-width="7" fill="none"/><path d="M70 590 h330 M70 640 h250" stroke-width="12" fill="none"/><path d="M100 760 q-30 -34 0 -52 q16 0 20 14 q4 -14 20 -14 q30 18 0 52 l-20 18Z" fill="#ff5d73" stroke-width="5"/>`,
      replies: `<rect x="40" y="60" width="480" height="880" fill="#f6f7fb"/>${[0,1,2,3,4].map(i => `<circle cx="96" cy="${130 + i * 160}" r="28" fill="${['#ff9a9a','#9ac4ff','#ffd27a','#b9f0c4','#d9b8ff'][i]}"/><rect x="144" y="${100 + i * 160}" width="${340 - (i % 2) * 40}" height="100" rx="26" fill="#fff"/><path d="M174 ${134 + i * 160} h${240 - (i % 2) * 30} M174 ${170 + i * 160} h${150 - (i % 2) * 20}" stroke-width="10" fill="none"/>`).join('')}`,
      call: `<rect x="40" y="60" width="480" height="880" fill="#1c1233"/><circle cx="280" cy="330" r="96" fill="#7a8399"/><path d="M180 520 q100 -60 200 0 V600 H180Z" fill="#7a8399"/><rect x="120" y="680" width="130" height="130" rx="65" fill="#ff5d73"/><rect x="310" y="680" width="130" height="130" rx="65" fill="#32c88a"/><path d="M160 745 h50" stroke="#fff" stroke-width="12"/>`,
      blank: `<rect x="40" y="60" width="480" height="880" fill="#111426"/>` }[s];
    return wrap(`0 0 ${W} ${H}`, W, H, `<rect x="0" y="0" width="${W}" height="${H}" rx="64" fill="#20222e"/>${scr}<rect x="190" y="20" width="180" height="22" rx="11" fill="#0c0d16" stroke="none"/>`); };
  P.slidecard = (o = {}) => wrap('0 0 300 190', 300, 190, `<rect x="6" y="6" width="288" height="178" rx="12" fill="#fff"/><rect x="26" y="26" width="140" height="22" rx="6" fill="${o.c || '#7a52d9'}" stroke="none"/><path d="M26 76 h200 M26 106 h160 M26 136 h110" stroke-width="9" fill="none" opacity=".7"/>`);
})();
