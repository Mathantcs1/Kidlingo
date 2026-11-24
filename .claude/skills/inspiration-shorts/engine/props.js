// Prop library: original flat-vector illustrations, thick ink outline, simple highlight.
// Each prop: (opts) => { svg, w, h }  -- anchored at bottom-centre by the engine.
// Add new props here; keep one outline weight (7) and one ink colour so the set stays consistent.
(function () {
  const INK = '#241532';
  const O = `stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"`;
  const wrap = (vb, w, h, body) => ({ w, h, svg: `<svg width="${w}" height="${h}" viewBox="${vb}" overflow="visible"><g ${O}>${body}</g></svg>` });
  const P = {};

  // ---- people: one rig, many looks (suit / hoodie / cap / glasses) -------------
  P.person = (o = {}) => {
    const c = Object.assign({ body: '#3a4a9f', body2: '#2c3a80', pants: '#232a55', skin: '#f3b27a', hair: '#5a3a22', hat: null, tie: '#ff5d73', shirt: '#fff', hood: false, glasses: false, brow: 0, band: null, hairStyle: 'short', beard: false, stache: false, mood: 'neutral', sweat: false }, o);
    const hat = c.hat ? `<path d="M-70 30 q4 -58 70 -62 q66 4 70 62 q-34 -22 -70 -22 q-36 0 -70 22Z" fill="${c.hat}"/><path d="M-18 -26 q58 -20 96 24 q14 6 18 16 q-26 -8 -60 -4 q-22 -14 -54 -36Z" fill="${c.hat}" style="filter:brightness(.85)"/>`
      : (c.hairStyle === 'bald' ? '' : c.hairStyle === 'curly' ? [[-52,2],[-28,-22],[0,-30],[28,-22],[52,2],[-62,28],[62,28]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="22" fill="${c.hair}"/>`).join('') : `<path d="M-68 38 q-6 -64 68 -66 q74 2 68 66 q-26 -30 -68 -30 q-42 0 -68 30Z" fill="${c.hair}"/>` + (c.hairStyle === 'bun' ? `<circle cx="0" cy="-40" r="26" fill="${c.hair}"/>` : ''));
    const backHair = c.hairStyle === 'long' && !c.hat ? `<path d="M-74 30 q-14 100 10 150 h128 q24 -50 10 -150 Z" fill="${c.hair}"/>` : '';
    const moodMouth = { worried: 'M-18 80 q9 -9 18 0 q9 9 18 0', shock: 'M-9 70 q9 -14 18 0 q-9 16 -18 0Z', smug: 'M-18 76 q18 6 34 -8', sad: 'M-18 82 q18 -16 36 0', angry: 'M-18 80 q18 -10 36 0', happy: 'M-22 68 q22 26 44 0 q-22 6 -44 0Z', neutral: 'M-18 72 q18 12 36 0' }[c.mood] || 'M-18 72 q18 12 36 0';
    const moodBrow = { worried: 'M-42 24 l24 6M42 24 l-24 6', shock: 'M-42 18 l24 -2M42 18 l-24 -2', angry: 'M-42 22 l24 10M42 22 l-24 10', sad: 'M-42 34 l24 -10M42 34 l-24 -10', smug: 'M-42 28 l24 -4M42 34 l-24 -2', happy: 'M-40 28 q12 -12 22 -4M40 28 q-12 -12 -22 -4' }[c.mood] || null;
    const torso = c.hood
      ? `<path d="M-64 124 q0 -30 32 -30 h64 q32 0 32 30 V268 q0 10 -10 10 H-54 q-10 0 -10 -10Z" fill="${c.body}"/><path d="M-30 96 q30 34 60 0" fill="${c.body2}"/><rect x="-34" y="190" width="68" height="40" rx="12" fill="${c.body2}"/>`
      : `<path d="M-62 120 q0 -26 30 -26 h64 q30 0 30 26 V268 H-62Z" fill="${c.body}"/><path d="M-26 94 L0 168 L26 94 Z" fill="${c.shirt}"/><path d="M-2 120 h4 l5 48 l-7 12 l-7 -12Z" fill="${c.tie}" stroke-width="4"/>`;
    const sleeve = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="40"/><path d="${d}" fill="none" stroke="${c.body}" stroke-width="28"/>`;
    const body = `
 <path d="M-34 250 V332 q0 14 -14 14 h-8 q-14 0 -14 -12 q0 -10 16 -12 V250Z" fill="${c.pants}"/><path d="M34 250 V332 q0 14 14 14 h8 q14 0 14 -12 q0 -10 -16 -12 V250Z" fill="${c.pants}"/>
 <rect x="-62" y="332" width="52" height="24" rx="11" fill="${c.hood ? '#fff' : '#14161f'}"/><rect x="10" y="332" width="52" height="24" rx="11" fill="${c.hood ? '#fff' : '#14161f'}"/>
 ${torso}
 ${sleeve('M-62 130 q-30 40 -22 94')}<circle cx="-84" cy="232" r="17" fill="${c.skin}"/>
 ${backHair}
 <circle cx="0" cy="40" r="68" fill="${c.skin}"/>
${c.beard ? `<path d="M-60 56 q10 64 60 66 q50 -2 60 -66 q-14 28 -60 28 q-46 0 -60 -28Z" fill="${c.hair}"/>` : ''}
 ${hat}
 ${c.band ? `<path d="M-68 22 q68 -24 136 0 l-2 16 q-66 -22 -132 0Z" fill="${c.band}"/>` : ''}
 <circle cx="-24" cy="48" r="7" fill="${INK}" stroke="none"/><circle cx="24" cy="48" r="7" fill="${INK}" stroke="none"/>
 <circle cx="-21" cy="45" r="2.4" fill="#fff" stroke="none"/><circle cx="27" cy="45" r="2.4" fill="#fff" stroke="none"/>
 ${c.glasses ? `<circle cx="-24" cy="48" r="17" fill="none"/><circle cx="24" cy="48" r="17" fill="none"/><path d="M-7 48 h14" />` : ''}
 <path d="${moodBrow || `M-40 ${30 + c.brow} l22 ${-4 - c.brow}M40 ${30 + c.brow} l-22 ${-4 - c.brow}`}" fill="none" stroke-width="6"/>
 ${c.sweat || c.mood === 'worried' ? `<path d="M64 -2 q-14 24 0 30 q14 -6 0 -30Z" fill="#9fdcff" stroke-width="4"/>` : ''}
 ${c.stache ? `<path d="M-30 62 q14 -10 30 0 q16 -10 30 0 q-8 14 -30 6 q-22 8 -30 -6Z" fill="${c.hair}"/>` : ''}
 <ellipse cx="-40" cy="66" rx="9" ry="5" fill="#ff8a8a" stroke="none" opacity=".6"/><ellipse cx="40" cy="66" rx="9" ry="5" fill="#ff8a8a" stroke="none" opacity=".6"/>
 <path class="mouth" data-closed="${moodMouth}" d="${moodMouth}" fill="none" stroke-width="5"/>
 <g class="arm" style="transform-origin:62px 130px">${sleeve('M62 130 q40 18 70 62')}<circle cx="138" cy="198" r="17" fill="${c.skin}"/></g>`;
    return wrap('-110 -60 330 420', 330, 420, body);
  };

  // ---- IT LIFE set: thin-line stick figures + flat locations (own ink, deliberately unlike the Pride Parables people) ----
  const IK = '#14263d';
  const OI = `stroke="${IK}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"`;
  const wrapI = (vb, w, h, body) => ({ w, h, svg: `<svg width="${w}" height="${h}" viewBox="${vb}" overflow="visible"><g ${OI}>${body}</g></svg>` });
  const itMouth = { flat: 'M-18 70 h36', smile: 'M-20 66 q20 16 40 0', worry: 'M-16 76 q16 -12 32 0', shock: 'M-8 68 q8 -12 16 0 q-8 14 -16 0Z', sad: 'M-18 78 q18 -14 36 0', grin: 'M-24 64 q24 24 48 0Z' };
  // stick figure: o.hood (hoodie colour), o.mood, o.sweat, o.raise (arm up), o.tie (manager), o.tablet, o.tall (manager height)
  P.itdev = (o = {}) => {
    const c = Object.assign({ hood: '#4a6a9a', pocket: '#37537d', skin: '#fff3dc', mood: 'flat', sweat: false, raise: false, tie: null, tablet: false, tall: 1, jacket: null, keys: false, sit: false }, o), k = c.tall; if (c.jacket) { c.hood = c.jacket; c.pocket = c.jacket; }
    const arm = (sx, d) => `<path d="M${sx} 128 ${d}" fill="none" stroke="${c.hood}" stroke-width="22"/><path d="M${sx} 128 ${d}" fill="none" stroke-width="30" opacity="0"/>`;
    const limb = (d, w = 14) => `<path d="${d}" fill="none" stroke="${IK}" stroke-width="${w}"/>`;
    const L = 262 * k;
    const legs = c.sit === 'chair' ? `${limb(`M-6 ${L} L74 ${L}`)}${limb(`M74 ${L} L78 ${L + 92}`)}${limb(`M10 ${L + 4} L96 ${L + 4}`)}${limb(`M96 ${L + 4} L100 ${L + 92}`)}${limb(`M78 ${L + 92} h30`)}${limb(`M100 ${L + 92} h30`)}` : c.sit ? `${limb(`M-6 ${L} L92 ${L - 26} L96 ${L + 62}`)}${limb(`M10 ${L} L112 ${L - 10} L120 ${L + 62}`)}${limb(`M96 ${L + 62} h30`)}${limb(`M120 ${L + 62} h30`)}` : `<g class="legL" data-px="-18" data-py="${L}">${limb(`M-18 ${L} L-34 ${L + 120}`)}${limb(`M-34 ${L + 120} h-26`)}</g><g class="legR" data-px="18" data-py="${L}">${limb(`M18 ${L} L34 ${L + 120}`)}${limb(`M34 ${L + 120} h26`)}</g>`;
    const body = `${legs}
 <g class="armL" data-px="-40" data-py="126">${limb(c.raise ? 'M-40 126 q-50 -30 -34 -92' : 'M-40 126 q-34 56 -16 118')}</g>
 ${c.tablet ? '' : `<g class="armR" data-px="40" data-py="126">${limb('M40 126 q34 56 16 118')}</g>`}${c.keys ? `<g transform="translate(56,244)"><circle cx="0" cy="10" r="11" fill="none" stroke-width="5"/><path d="M0 21 v22 h12 M0 33 h10" fill="none" stroke="#ffd21f" stroke-width="7"/></g>` : ''}${c.jacket ? `<path d="M-8 94 L0 150 L8 94" fill="none" stroke-width="5"/>` : ''}
 <path d="M-46 112 q0 -22 26 -22 h40 q26 0 26 22 V${L + 8} q-46 12 -92 0Z" fill="${c.hood}"/>
 <rect x="-28" y="${150 * k + 40}" width="56" height="34" rx="10" fill="${c.pocket}" stroke-width="5"/>
 ${c.tie ? `<path d="M-6 96 h12 l8 70 l-14 18 l-14 -18Z" fill="${c.tie}" stroke-width="4"/>` : ''}
 ${c.tablet ? `${limb('M40 126 q50 20 56 60')}<rect x="62" y="150" width="84" height="110" rx="10" fill="#cfe8ff" transform="rotate(8 100 200)"/>` : ''}
 <g class="head" data-px="0" data-py="100"><path d="M-62 40 q0 -76 62 -76 q62 0 62 76 q-12 -28 -62 -28 q-50 0 -62 28Z" fill="${c.hood}" stroke-width="6"/>
 <circle cx="0" cy="42" r="54" fill="${c.skin}"/>
 <path d="M-54 36 q4 -46 54 -46 q50 0 54 46 q-26 -26 -54 -26 q-28 0 -54 26Z" fill="${c.hood}" stroke-width="5"/>
 <circle cx="-19" cy="46" r="6" fill="${IK}" stroke="none"/><circle cx="19" cy="46" r="6" fill="${IK}" stroke="none"/>
 ${c.sweat ? `<path d="M52 8 q-11 20 0 26 q11 -6 0 -26Z" fill="#9fdcff" stroke-width="4"/>` : ''}
 <path class="mouth" data-closed="${itMouth[c.mood] || itMouth.flat}" d="${itMouth[c.mood] || itMouth.flat}" fill="none" stroke-width="5"/></g>`;
    const WW = c.tablet ? 330 : 240; return wrapI(`-120 -50 ${WW} ${L + 150}`, WW, Math.round(L + 150), body);
  };
  // office / location backdrop: o.h,o.m wall-clock time, o.wall, o.sky, o.sun (bool), o.note (sticky text), o.night
  P.itroom = (o = {}) => {
    const c = Object.assign({ h: 4, m: 45, wall: '#f6e3bd', sky: '#ffd9a0', sun: true, note: 'FRIDAY', desk: '#c7803c', night: false }, o);
    const CX = 250, CY = 110, ha = ((c.h % 12) + c.m / 60) * 30, ma = c.m * 6, rad = a => (a - 90) * Math.PI / 180, hand = (a, l) => `<path d="M${CX} ${CY} L${CX + Math.cos(rad(a)) * l} ${CY + Math.sin(rad(a)) * l}" fill="none" stroke-width="9"/>`;
    const ticks = [...Array(12).keys()].map(i => { const a = rad(i * 30); return `<path d="M${CX + Math.cos(a) * 58} ${CY + Math.sin(a) * 58} L${CX + Math.cos(a) * 68} ${CY + Math.sin(a) * 68}" stroke-width="5"/>`; }).join('');
    return wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1660" fill="${c.wall}" stroke="none"/>
 <rect x="520" y="-10" width="320" height="250" rx="10" fill="${c.sky}"/>${c.sun ? '<circle cx="760" cy="232" r="52" fill="#ff8a3d" stroke-width="6"/>' : ''}${c.night ? '<circle cx="600" cy="70" r="30" fill="#fff6c9" stroke-width="5"/>' : ''}
 <path d="M680 -10 V240 M520 115 H840" fill="none" stroke-width="6"/>
 <circle cx="${CX}" cy="${CY}" r="78" fill="#fff"/>${ticks}${hand(ha, 38)}${hand(ma, 56)}<circle cx="${CX}" cy="${CY}" r="7" fill="${IK}"/>
 <rect x="390" y="70" width="104" height="104" rx="8" fill="#ffd21f" transform="rotate(-4 442 122)"/><text x="442" y="132" font-size="${c.note.length > 7 ? 18 : 26}" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none" transform="rotate(-4 442 122)">${c.note}</text>
 <rect x="-60" y="560" width="1120" height="180" fill="${c.desk}"/><path d="M-60 560 H1060" fill="none"/>
 <path d="M800 560 v-60 h60 v60Z" fill="#fff" /><path d="M860 515 q22 0 22 20 q0 20 -22 20" fill="none" stroke-width="6"/>`);
  };
  // meeting room: o.era '2015' (whiteboard, calendar page, amber) | '2026' (big wall screen with charts, teal); same anchoring as itroom
  P.itmeet = (o = {}) => {
    const old = (o.era || '2015') === '2015';
    const wall = o.wall || (old ? '#f6e3bd' : '#18324d'), table = o.table || (old ? '#c7803c' : '#0f2236');
    const board = old
      ? `<rect x="150" y="-10" width="440" height="260" rx="8" fill="#fff"/><path d="M190 60 h200 M190 110 h260 M190 160 h160" fill="none" stroke-width="7" opacity=".45"/><text x="370" y="215" font-size="30" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">PROJECT</text>
         <rect x="640" y="10" width="200" height="220" rx="10" fill="#fff"/><rect x="640" y="10" width="200" height="60" rx="10" fill="#e0543a"/><text x="740" y="170" font-size="64" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">2015</text>`
      : `<rect x="110" y="-30" width="780" height="290" rx="14" fill="#0b1a2b"/><path d="M110 210 l90 -70 l90 30 l100 -90 l100 50 l110 -60" fill="none" stroke="#2ee6d0" stroke-width="8"/><rect x="620" y="150" width="40" height="70" fill="#1F9CA8" stroke="none"/><rect x="680" y="110" width="40" height="110" fill="#1F9CA8" stroke="none"/><rect x="740" y="70" width="40" height="150" fill="#1F9CA8" stroke="none"/><rect x="800" y="30" width="40" height="190" fill="#2ee6d0" stroke="none"/><text x="250" y="40" font-size="34" font-weight="800" fill="#cfe8ff" stroke="none">2026 · COMPANY · MARKET</text>`;
    return wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1660" fill="${wall}" stroke="none"/>${board}<rect x="-60" y="560" width="1120" height="180" fill="${table}"/><path d="M-60 560 H1060" fill="none"/>`);
  };
  // zoom-out locations behind a fixed-size Dev: o.level 'building' | 'city' | 'planet' | 'space'
  P.itscale = (o = {}) => {
    const lv = o.level || 'building', W = (c) => `<rect x="-60" y="-1100" width="1120" height="1900" fill="${c}" stroke="none"/>`;
    const win = (x, y, w, h, cols, rows) => [...Array(cols * rows).keys()].map(i => `<rect x="${x + (i % cols) * (w / cols) + 5}" y="${y + Math.floor(i / cols) * (h / rows) + 5}" width="${w / cols - 12}" height="${h / rows - 12}" rx="3" fill="${i % 3 === 0 ? '#ffd21f' : '#cfe8ff'}" stroke-width="3"/>`).join('');
    const ground = '<rect x="-60" y="560" width="1120" height="180" fill="#6b7a99"/><path d="M-60 560 H1060" fill="none"/>';
    if (lv === 'building') return wrapI('0 0 1000 720', 1000, 720, `${W('#bfe6ff')}<rect x="360" y="-300" width="300" height="860" fill="#9fb0c4"/>${win(360, -300, 300, 860, 4, 12)}<rect x="130" y="180" width="180" height="380" fill="#b8c4d6"/>${win(130, 180, 180, 380, 3, 6)}${ground}`);
    if (lv === 'city') return wrapI('0 0 1000 720', 1000, 720, `${W('#e8d9ff')}${[[0, 80, 110], [100, 20, 120], [210, 140, 90], [300, -40, 130], [430, 100, 100], [530, 0, 120], [650, 120, 110], [760, 40, 100], [860, 90, 140]].map(([x, y, w]) => `<rect x="${x}" y="${y + 120}" width="${w}" height="${440 - y}" fill="#8f9fc0"/>${win(x, y + 120, w, 440 - y, 3, 8)}`).join('')}${ground}`);
    const stars = o.nostars ? '' : [...Array(46).keys()].map(i => `<circle cx="${(i * 197) % 1000}" cy="${((i * 331) % 900) - 300}" r="${i % 4 === 0 ? 5 : 3}" fill="#fff" stroke="none"/>`).join('');
    if (lv === 'planet') return wrapI('0 0 1000 720', 1000, 720, `${W('#0a1230')}${stars}<circle cx="500" cy="1100" r="760" fill="#2a6fd6"/><path d="M200 520 q120 -60 240 -10 q60 40 20 90 q-120 50 -260 -20Z M600 470 q140 -50 240 30 q-20 60 -140 60 q-90 -10 -100 -90Z" fill="#3ec97a" stroke-width="5"/>`);
    if (o.void) return wrapI('0 0 1000 720', 1000, 720, W('#050914'));
    return wrapI('0 0 1000 720', 1000, 720, `${W('#050914')}${stars}<circle cx="780" cy="120" r="70" fill="#2a6fd6"/><path d="M730 110 q40 -30 80 0 q-20 30 -80 0Z" fill="#3ec97a" stroke-width="4"/><circle cx="170" cy="330" r="22" fill="#e0a030" stroke-width="5"/>`);
  };
  // little planet / moon for animated space scenes: o.kind 'earth' | 'moon'
  P.itplanet = (o = {}) => o.kind === 'moon' ? wrapI('0 0 80 80', 80, 80, '<circle cx="40" cy="40" r="30" fill="#e0a030"/><circle cx="30" cy="32" r="6" fill="#b8801c" stroke-width="3"/><circle cx="50" cy="50" r="4" fill="#b8801c" stroke-width="3"/>') : wrapI('0 0 160 160', 160, 160, '<circle cx="80" cy="80" r="68" fill="#2a6fd6"/><path d="M40 70 q22 -26 46 -6 q10 18 -10 28 q-28 8 -36 -22Z M92 98 q22 -10 34 8 q-10 22 -28 14Z" fill="#3ec97a" stroke-width="4"/>');
  P.itbug = (o = {}) => wrapI('0 0 160 140', 160, 140, `<path d="M40 40 L12 14 M120 40 L148 14 M30 80 H4 M130 80 H156 M40 118 L14 134 M120 118 L146 134" fill="none" stroke-width="7"/><ellipse cx="80" cy="84" rx="44" ry="50" fill="${o.color || '#e0543a'}"/><circle cx="80" cy="34" r="24" fill="${o.color || '#e0543a'}"/><path d="M80 40 V132" fill="none" stroke-width="5"/><circle cx="70" cy="30" r="4" fill="${IK}" stroke="none"/><circle cx="90" cy="30" r="4" fill="${IK}" stroke="none"/>`);
  P.itfolder = (o = {}) => wrapI('0 0 240 190', 240, 190, `<path d="M10 40 h80 l20 -24 h110 v150 H10Z" fill="#f2b84a"/><rect x="10" y="58" width="220" height="110" rx="8" fill="#ffd978"/><text x="120" y="126" font-size="${(o.label || 'PROJECT').length > 8 ? 24 : 32}" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">${o.label || 'PROJECT'}</text>`);
  // ---- IT LIFE set 2 (episode 3): colleagues, offices, pantry, puzzle, badges ----
  // colleague figure: o.kind 'fresher' (shorter, coral tee, backpack, spiky hair) | 'senior' (grey swoosh, glasses, olive cardigan);
  // o.pose 'rest' | 'point' | 'pat' | 'mug' | 'fist' | 'hold' ; o.mood ; o.mug (steaming mug in hand); o.shirt override
  P.itpal = (o = {}) => {
    const fr = (o.kind || 'senior') === 'fresher', ts = o.kind === 'tester';
    const c = Object.assign({ mood: 'smile', pose: 'rest', shirt: fr ? '#ff7a5c' : ts ? '#1F9CA8' : '#7c8f5a', skin: '#fff3dc', hair: fr ? '#2a2233' : ts ? '#1c1c24' : '#c9ced8' }, o), k = fr ? .8 : 1, L = 262 * k;
    const limb = (d, w = 14, col = IK) => `<path d="${d}" fill="none" stroke="${IK}" stroke-width="${w + (col === IK ? 0 : 10)}"/>${col === IK ? '' : `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`}`;
    const arms = { rest: 'M40 126 q34 56 16 118', point: 'M40 126 q70 -4 118 -2', pat: 'M40 126 q60 30 100 70', mug: 'M40 126 q50 10 46 -34', fist: 'M40 126 q70 0 120 -6', hold: 'M40 126 q56 10 70 -40' }[c.pose] || 'M40 126 q34 56 16 118';
    const end = { point: [158, 124], pat: [140, 196], mug: [86, 92], fist: [160, 120], hold: [110, 86] }[c.pose];
    const m = { flat: 'M-16 70 h32', smile: 'M-18 66 q18 16 36 0', grin: 'M-22 62 q22 22 44 0Z', curious: 'M-14 72 q14 -8 28 0', worry: 'M-16 76 q16 -12 32 0' }[c.mood] || 'M-18 66 q18 16 36 0';
    const bag = fr ? `<rect x="-86" y="${100 * k + 20}" width="56" height="${150 * k}" rx="16" fill="#2f6fd6"/><path d="M-30 ${112 * k + 20} q-16 30 0 70" fill="none" stroke="#1f4fa0" stroke-width="10"/>` : '';
    const hair = ts ? `<path d="M-56 36 q2 -64 62 -58 q50 4 52 48 q-18 -26 -52 -22 q-36 0 -62 32Z" fill="${c.hair}" stroke-width="6"/>` : fr ? `<path d="M-56 30 l12 -34 l16 20 l14 -30 l14 28 l14 -26 l14 30 l12 -20 l8 32 q-50 -22 -100 0Z" fill="${c.hair}" stroke-width="6"/>` : `<path d="M-58 34 q4 -62 60 -56 q50 4 58 50 q-22 -30 -56 -26 q-40 -2 -62 32Z" fill="${c.hair}" stroke-width="6"/>`;
    const mug = (c.mug && end) ? `<g transform="translate(${end[0] - 4},${end[1] - 18})"><rect x="-4" y="0" width="34" height="34" rx="6" fill="#fff"/><path d="M30 8 q16 0 16 12 q0 12 -16 12" fill="none" stroke-width="6"/></g>` : '';
    const body = `${bag}<g class="legL" data-px="-18" data-py="${L}">${limb(`M-18 ${L} L-34 ${L + 120}`)}${limb(`M-34 ${L + 120} h-24`)}</g><g class="legR" data-px="18" data-py="${L}">${limb(`M18 ${L} L34 ${L + 120}`)}${limb(`M34 ${L + 120} h24`)}</g>
 <g class="armL" data-px="-40" data-py="126">${limb('M-40 126 q-34 56 -16 118')}</g>
 <path d="M-46 112 q0 -22 26 -22 h40 q26 0 26 22 V${L + 8} q-46 12 -92 0Z" fill="${c.shirt}"/>
 ${fr ? '' : `<path d="M0 100 V${L}" fill="none" stroke-width="5"/><circle cx="-12" cy="${L * .55}" r="4" fill="${IK}" stroke="none"/><circle cx="-12" cy="${L * .7}" r="4" fill="${IK}" stroke="none"/>`}
 <g class="armR" data-px="40" data-py="126">${limb(arms, 14, c.shirt)}${end ? `<circle cx="${end[0]}" cy="${end[1]}" r="${c.pose === 'fist' ? 16 : 12}" fill="${c.skin}"/>` : ''}${mug}</g>
 <g class="head" data-px="0" data-py="100"><circle cx="0" cy="42" r="54" fill="${c.skin}"/>${hair}
 <circle cx="-19" cy="46" r="6" fill="${IK}" stroke="none"/><circle cx="19" cy="46" r="6" fill="${IK}" stroke="none"/>
 ${(fr) ? '' : `<circle cx="-19" cy="46" r="15" fill="none" stroke-width="5"/><circle cx="19" cy="46" r="15" fill="none" stroke-width="5"/><path d="M-4 46 h8" fill="none" stroke-width="5"/>`}
 ${ts ? `<path d="M-58 40 q0 -74 58 -74 q58 0 58 74" fill="none" stroke-width="9"/><rect x="-72" y="28" width="22" height="44" rx="9" fill="#e0543a"/><rect x="50" y="28" width="22" height="44" rx="9" fill="#e0543a"/><path d="M-14 98 L0 150 L14 98" fill="none" stroke="#ffd21f" stroke-width="6"/>` : ''}
 <path class="mouth" data-closed="${m}" d="${m}" fill="none" stroke-width="5"/></g>`;
    return wrapI(`-130 -50 340 ${L + 150}`, 340, Math.round(L + 150), c.flip ? `<g transform="translate(80,0) scale(-1,1)">${body}</g>` : body);
  };
  P.itchair = (o = {}) => wrapI('0 0 160 230', 160, 230, `<path d="M30 10 H100 V110 H30Z" fill="${o.color || '#e0543a'}"/><rect x="14" y="110" width="130" height="26" rx="8" fill="${o.color || '#e0543a'}"/><path d="M40 136 V220 M118 136 V220" fill="none" stroke-width="10"/>`);
  // office backdrop: o.era '2015' (open door, CRT desk, paper) | '2026' (glass wall, plants, dual monitors)
  P.itoffice = (o = {}) => {
    const old = (o.era || '2015') === '2015';
    const back = old
      ? `<rect x="-60" y="-1100" width="1120" height="1700" fill="#f6dfb0" stroke="none"/>
 <rect x="20" y="-40" width="240" height="600" fill="#fff8d8"/><path d="M260 -40 l60 30 v560 l-60 10Z" fill="#b8742f"/><circle cx="296" cy="270" r="9" fill="#ffd21f" stroke-width="4"/>
 <rect x="560" y="300" width="400" height="28" fill="#a86a2c"/><path d="M590 328 v232 M930 328 v232" fill="none" stroke-width="12"/>
 <rect x="640" y="130" width="190" height="165" rx="14" fill="#d8d2c2"/><rect x="658" y="146" width="154" height="116" rx="10" fill="#3a5a40"/><path d="M674 170 h80 M674 196 h110 M674 222 h60" fill="none" stroke="#9fe8a8" stroke-width="7"/><rect x="690" y="295" width="110" height="10" fill="#bfb8a6" stroke-width="4"/>
 <rect x="440" y="150" width="100" height="130" rx="6" fill="#fff"/><path d="M458 180 h64 M458 206 h64 M458 232 h40" fill="none" stroke-width="6" opacity=".45"/>`
      : `<rect x="-60" y="-1100" width="1120" height="1700" fill="#cfe7ea" stroke="none"/>
 <rect x="30" y="-20" width="470" height="470" rx="10" fill="#bfe6ff"/><path d="M265 -20 V450 M30 215 H500" fill="none" stroke-width="7"/><path d="M60 420 h60 v-120 h50 v120 h70 v-190 h60 v190 h120" fill="#9fb8d8" stroke-width="5"/>
 <rect x="540" y="300" width="440" height="24" fill="#4a5568"/><path d="M600 324 v236 M920 324 v236" fill="none" stroke-width="12"/>
 <rect x="560" y="150" width="190" height="140" rx="10" fill="#10273f"/><rect x="570" y="160" width="170" height="110" rx="6" fill="#1F9CA8"/><rect x="770" y="150" width="190" height="140" rx="10" fill="#10273f"/><rect x="780" y="160" width="170" height="110" rx="6" fill="#2ee6d0"/><path d="M590 200 h90 M590 230 h60 M800 200 h110 M800 230 h70" fill="none" stroke="#10273f" stroke-width="7" opacity=".55"/>
 <path d="M520 560 v-70 h70 v70Z" fill="#c76b4a"/><path d="M555 490 q-40 -60 -10 -110 q30 40 10 110Z M555 490 q40 -50 70 -80 q10 50 -70 80Z" fill="#3ec97a" stroke-width="5"/>`;
    return wrapI('0 0 1000 720', 1000, 720, `${back}<rect x="-60" y="560" width="1120" height="200" fill="${old ? '#c7803c' : '#9fb8c4'}"/><path d="M-60 560 H1060" fill="none"/>`);
  };
  // tea corner: shelf of mugs, kettle, fridge
  P.itpantry = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#dff0d8" stroke="none"/>
 <path d="M-60 100 H1060 M-60 300 H1060" fill="none" stroke="#bcd9b4" stroke-width="5"/>
 <rect x="60" y="150" width="440" height="16" fill="#a86a2c"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${90 + i * 82}" y="104" width="46" height="46" rx="8" fill="${['#ff7a5c', '#ffd21f', '#1F9CA8', '#fff', '#a06bff'][i]}"/><path d="M${136 + i * 82} 118 q14 0 14 12 q0 12 -14 12" fill="none" stroke-width="5"/>`).join('')}
 <rect x="560" y="380" width="260" height="180" fill="#a86a2c"/><rect x="600" y="300" width="90" height="82" rx="14" fill="#d9dde6"/><path d="M690 330 q36 0 36 30" fill="none" stroke-width="7"/><rect x="590" y="380" width="110" height="10" fill="#9aa3b5"/>
 <rect x="850" y="120" width="150" height="440" rx="14" fill="#eef2f7"/><path d="M850 330 H1000" fill="none"/><rect x="866" y="190" width="10" height="70" rx="4" fill="#9aa3b5" stroke-width="3"/><rect x="866" y="360" width="10" height="90" rx="4" fill="#9aa3b5" stroke-width="3"/>
 <rect x="-60" y="560" width="1120" height="200" fill="#b8c9a8"/><path d="M-60 560 H1060" fill="none"/>`);
  // soft neutral stage with dots (puzzle / ending): o.wall
  P.itplain = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="${o.wall || '#e8e4f5'}" stroke="none"/>${[...Array(60).keys()].map(i => `<circle cx="${(i % 10) * 110 - 20}" cy="${Math.floor(i / 10) * 110 - 200}" r="5" fill="#c9c2e6" stroke="none"/>`).join('')}<rect x="-60" y="560" width="1120" height="200" fill="${o.floor || '#c9c2e6'}"/><path d="M-60 560 H1060" fill="none"/>`);
  // puzzle half: o.side 'left' (knob on the right edge) | 'right' (socket on the left edge), o.color
  P.itpuzzle = (o = {}) => o.side === 'right'
    ? wrapI('0 0 260 330', 260, 330, `<path d="M20 20 H240 V310 H20 V190 q-34 0 -34 -35 q0 -35 34 -35Z" fill="${o.color || '#1F9CA8'}"/>`)
    : wrapI('0 0 260 330', 260, 330, `<path d="M20 20 H240 V120 q34 0 34 35 q0 35 -34 35 V310 H20Z" fill="${o.color || '#F2A33A'}"/>`);
  // tool badge: o.kind 'gear' | 'chat' | 'cloud' | 'branch' | 'term'
  P.itbadge = (o = {}) => {
    const col = { gear: '#F2A33A', chat: '#1F9CA8', cloud: '#a06bff', branch: '#e0543a', term: '#26334a' }[o.kind || 'gear'];
    const g = { gear: '<circle cx="60" cy="60" r="20" fill="#fff"/><path d="M60 22 v14 M60 84 v14 M22 60 h14 M84 60 h14 M34 34 l10 10 M76 76 l10 10 M86 34 l-10 10 M44 76 l-10 10" fill="none" stroke="#fff" stroke-width="8"/>',
      chat: '<path d="M26 34 h68 v40 h-34 l-18 16 v-16 h-16Z" fill="#fff"/>', cloud: '<path d="M34 80 q-16 0 -16 -16 q0 -14 16 -16 q4 -22 26 -20 q18 2 22 20 q18 0 18 16 q0 16 -18 16Z" fill="#fff"/>',
      branch: '<circle cx="42" cy="34" r="9" fill="#fff"/><circle cx="42" cy="88" r="9" fill="#fff"/><circle cx="82" cy="52" r="9" fill="#fff"/><path d="M42 43 V79 M42 70 q40 0 40 -18" fill="none" stroke="#fff" stroke-width="7"/>', term: '<path d="M30 40 l24 18 l-24 18 M62 82 h30" fill="none" stroke="#2ee6d0" stroke-width="9"/>' }[o.kind || 'gear'];
    return wrapI('-6 -6 132 132', 132, 132, `<rect x="0" y="0" width="120" height="120" rx="26" fill="${col}"/>${g}`);
  };
  P.itcheck = (o = {}) => wrapI('-6 -6 92 92', 92, 92, `<circle cx="40" cy="40" r="36" fill="#3ec97a"/><path d="M22 42 l14 14 l26 -30" fill="none" stroke="#fff" stroke-width="10"/>`);
  P.itnotebook = (o = {}) => wrapI('0 0 170 130', 170, 130, `<path d="M8 12 H84 V118 H8Z M84 12 H160 V118 H84Z" fill="#fff"/><path d="M22 40 h48 M22 62 h48 M22 84 h30 M98 40 h48 M98 62 h40" fill="none" stroke-width="5" opacity=".5"/><path d="M84 12 V118" fill="none"/>`);
  P.itheart = (o = {}) => wrapI('0 0 160 150', 160, 150, `<path d="M80 140 C10 90 0 50 30 24 C54 4 76 20 80 40 C84 20 106 4 130 24 C160 50 150 90 80 140Z" fill="${o.color || '#ff7ab8'}"/>`);
  // ---- IT LIFE set 3 (episode 4): the standup call ----
  // call tile 320x330: o.bg, o.deco ('plant'|'shelf'|'window'|'lamp'|'poster'|'curtain'), o.hair ('bun'|'cap'|'curly'|'bald'|'long'|'beanie'), o.hc hair colour, o.skin, o.shirt, o.mood, o.glasses
  P.ittile = (o = {}) => {
    const c = Object.assign({ bg: '#dff0d8', deco: 'plant', hair: 'bun', hc: '#2a2233', skin: '#fff3dc', shirt: '#7c8f5a', mood: 'flat', glasses: false }, o);
    const deco = { plant: '<rect x="24" y="64" width="40" height="34" rx="6" fill="#c76b4a"/><path d="M44 64 q-26 -40 -6 -58 q22 20 6 58Z M44 64 q26 -34 46 -30 q-6 26 -46 30Z" fill="#3ec97a" stroke-width="5"/>',
      shelf: '<rect x="20" y="70" width="130" height="10" fill="#a86a2c"/><rect x="28" y="28" width="22" height="42" fill="#e0543a" stroke-width="4"/><rect x="54" y="20" width="22" height="50" fill="#1F9CA8" stroke-width="4"/><rect x="80" y="34" width="22" height="36" fill="#ffd21f" stroke-width="4"/>',
      window: '<rect x="200" y="20" width="96" height="78" rx="6" fill="#bfe6ff"/><path d="M248 20 V98 M200 59 H296" fill="none" stroke-width="5"/>',
      lamp: '<path d="M250 98 h40 M270 98 V50 M244 50 l26 -30 l26 30Z" fill="#ffd21f" stroke-width="5"/>',
      poster: '<rect x="30" y="18" width="74" height="86" rx="4" fill="#fff"/><path d="M44 40 h46 M44 60 h46 M44 80 h28" fill="none" stroke-width="5" opacity=".5"/>',
      curtain: '<path d="M0 0 h86 v110 q-43 -24 -86 0Z" fill="#a06bff" opacity=".85" stroke-width="5"/>' }[c.deco] || '';
    const hr = { bun: `<path d="M-52 4 q4 -56 52 -54 q50 0 54 50 q-26 -26 -54 -24 q-30 0 -52 28Z" fill="${c.hc}" stroke-width="6" transform="translate(160,170)"/><circle cx="160" cy="112" r="22" fill="${c.hc}" stroke-width="6"/>`,
      cap: `<path d="M104 160 q4 -60 56 -58 q54 0 58 58Z" fill="${c.hc}" stroke-width="6"/><path d="M104 160 h-40 q0 -14 18 -14 h22Z" fill="${c.hc}" stroke-width="6"/>`,
      curly: [[-44, 4], [-22, -24], [4, -32], [30, -24], [52, 4], [-54, 30], [58, 30]].map(([x, y]) => `<circle cx="${160 + x}" cy="${160 + y}" r="22" fill="${c.hc}" stroke-width="5"/>`).join(''),
      bald: '', long: `<path d="M98 150 q0 -64 62 -64 q62 0 62 64 v70 h-30 v-60 h-64 v60 h-30Z" fill="${c.hc}" stroke-width="6"/>`,
      beanie: `<path d="M100 160 q0 -66 60 -66 q60 0 60 66Z" fill="${c.hc}" stroke-width="6"/><circle cx="160" cy="92" r="14" fill="${c.hc}" stroke-width="5"/>` }[c.hair] || '';
    const m = { flat: 'M144 214 h32', smile: 'M142 208 q18 16 36 0', worry: 'M144 218 q16 -12 32 0', grin: 'M138 206 q22 22 44 0Z' }[c.mood] || 'M144 214 h32';
    return wrapI('-6 -6 332 342', 332, 342, `<rect x="0" y="0" width="320" height="330" rx="26" fill="${c.bg}"/>${deco}
 <path d="M48 330 q0 -86 112 -86 q112 0 112 86Z" fill="${c.shirt}"/>
 ${c.hair === 'long' ? hr : ''}<circle cx="160" cy="178" r="58" fill="${c.skin}"/>${c.hair === 'long' ? '' : hr}
 <circle cx="140" cy="182" r="6" fill="${IK}" stroke="none"/><circle cx="180" cy="182" r="6" fill="${IK}" stroke="none"/>
 ${c.glasses ? `<circle cx="140" cy="182" r="15" fill="none" stroke-width="5"/><circle cx="180" cy="182" r="15" fill="none" stroke-width="5"/><path d="M155 182 h10" fill="none" stroke-width="5"/>` : ''}
 <path d="${m}" fill="none" stroke-width="5"/>`);
  };
  // video-call app window: title bar with o.title, control bar; anchored like the other backdrops (1000x1100)
  P.itapp = (o = {}) => wrapI('0 0 1000 1100', 1000, 1100, `<rect x="-60" y="-1100" width="1120" height="2300" fill="#0d1626" stroke="none"/>
 <rect x="10" y="0" width="980" height="1100" rx="30" fill="#18253d"/><rect x="10" y="0" width="980" height="84" rx="30" fill="#26354f"/><rect x="10" y="40" width="980" height="44" fill="#26354f" stroke="none"/>
 <circle cx="56" cy="42" r="10" fill="#e0543a" stroke-width="3"/><circle cx="90" cy="42" r="10" fill="#ffd21f" stroke-width="3"/><circle cx="124" cy="42" r="10" fill="#3ec97a" stroke-width="3"/>
 <text x="540" y="56" font-size="34" font-weight="800" text-anchor="middle" fill="#cfe8ff" stroke="none">${o.title || 'DAILY STANDUP · 9:15 AM'}</text>
 <circle cx="400" cy="1030" r="34" fill="#3b4a66"/><circle cx="500" cy="1030" r="34" fill="#3b4a66"/><rect x="570" y="996" width="130" height="68" rx="34" fill="#e0543a"/>`);
  // ---- IT LIFE set 4 (episode 5): the test sheet ----
  // 2015 QA corner: amber wall, window, big CRT monitor (screen area x500-880, y50-330) on a desk
  P.itqa = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#f6dfb0" stroke="none"/>
 <rect x="40" y="40" width="300" height="260" rx="8" fill="#ffd9a0"/><path d="M190 40 V300 M40 170 H340" fill="none" stroke-width="6"/><circle cx="270" cy="270" r="40" fill="#ff8a3d" stroke-width="5"/>
 <rect x="480" y="20" width="420" height="330" rx="18" fill="#d8d2c2"/><rect x="500" y="40" width="380" height="290" rx="10" fill="#fff8e8"/><rect x="560" y="350" width="260" height="22" fill="#bfb8a6" stroke-width="5"/>
 <rect x="400" y="400" width="560" height="26" fill="#a86a2c"/><path d="M430 426 v134 M930 426 v134" fill="none" stroke-width="12"/>
 <rect x="-60" y="560" width="1120" height="200" fill="#c7803c"/><path d="M-60 560 H1060" fill="none"/>`);
  // 2026 pipeline wall: navy room with a big dashboard frame (x40-960, y-20..420)
  P.itdash = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#12304a" stroke="none"/>
 <rect x="30" y="-40" width="940" height="460" rx="20" fill="#0b1a2b"/><path d="M30 130 H970 M30 280 H970 M340 -40 V420 M650 -40 V420" fill="none" stroke="#1F9CA8" stroke-width="3" opacity=".35"/>
 <rect x="-60" y="560" width="1120" height="200" fill="#1f4a66"/><path d="M-60 560 H1060" fill="none"/>`);
  P.itmag = (o = {}) => wrapI('0 0 220 240', 220, 240, `<path d="M140 140 L205 220" fill="none" stroke-width="22"/><circle cx="96" cy="96" r="80" fill="#ffffff" fill-opacity=".55"/><text x="96" y="128" font-size="104" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">?</text>`);
  P.itcoffee = (o = {}) => wrapI('0 0 100 100', 100, 100, `<rect x="12" y="24" width="56" height="60" rx="8" fill="#fff"/><rect x="12" y="46" width="56" height="18" fill="#e0543a" stroke-width="4"/><path d="M68 36 q22 0 22 20 q0 20 -22 20" fill="none" stroke-width="7"/>`);
  // ---- IT LIFE set 5 (episode 6): a night at home ----
  // hallway: warm wall, archway to a candle-lit dinner table (left), open front door onto the night (right), coat hook
  P.ithall = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#f1d7b0" stroke="none"/>
 <rect x="50" y="60" width="330" height="500" rx="150" fill="#5a3a30"/><ellipse cx="215" cy="330" rx="150" ry="120" fill="#ffd978" opacity=".45" stroke="none"/><rect x="120" y="400" width="190" height="14" fill="#a86a2c"/><path d="M140 414 v100 M290 414 v100" fill="none" stroke-width="8"/>
 <rect x="160" y="350" width="14" height="50" fill="#fff" stroke-width="4"/><ellipse cx="167" cy="338" rx="7" ry="13" fill="#ffd21f" stroke-width="3"/><rect x="256" y="350" width="14" height="50" fill="#fff" stroke-width="4"/><ellipse cx="263" cy="338" rx="7" ry="13" fill="#ffd21f" stroke-width="3"/>
 <rect x="600" y="20" width="300" height="540" fill="#0e1b30"/><circle cx="800" cy="120" r="30" fill="#fff6c9" stroke-width="4"/><path d="M600 20 H900 V560 H600Z" fill="none" stroke-width="12"/><path d="M600 20 l-70 40 v500 l70 0Z" fill="#b8742f"/><circle cx="560" cy="300" r="8" fill="#ffd21f" stroke-width="3"/>
 <path d="M470 120 v60 M450 120 h40" fill="none" stroke-width="8"/>
 <rect x="-60" y="560" width="1120" height="200" fill="#c7803c"/><path d="M-60 560 H1060" fill="none"/>`);
  // living-room floor at night: lamp glow, window with moon, sofa edge, rug
  P.itlounge = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="${o.wall || '#243049'}" stroke="none"/>
 <rect x="580" y="40" width="320" height="260" rx="10" fill="#0e1b30"/><circle cx="800" cy="110" r="30" fill="#fff6c9" stroke-width="4"/><path d="M740 40 V300 M580 170 H900" fill="none" stroke-width="6"/>
 <ellipse cx="180" cy="300" rx="190" ry="230" fill="#ffd978" opacity="${o.dark ? .08 : .28}" stroke="none"/><path d="M150 420 V300 M120 300 l30 -80 l30 80Z" fill="#ffd21f" stroke-width="5"/>
 <rect x="20" y="380" width="260" height="180" rx="30" fill="#2f6b78"/><rect x="-60" y="560" width="1120" height="200" fill="#5a4636"/><path d="M-60 560 H1060" fill="none"/><ellipse cx="560" cy="640" rx="320" ry="50" fill="#a06bff" opacity=".5" stroke="none"/>`);
  // dining room: candles, table, window; o.dark dims it
  P.itdinner = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#3a2a24" stroke="none"/>
 <rect x="640" y="40" width="280" height="240" rx="10" fill="#0e1b30"/><circle cx="740" cy="110" r="26" fill="#fff6c9" stroke-width="4"/><path d="M780 40 V280 M640 160 H920" fill="none" stroke-width="6"/>
 <ellipse cx="400" cy="330" rx="330" ry="210" fill="#ffd978" opacity=".35" stroke="none"/>
 <rect x="60" y="400" width="700" height="28" fill="#a86a2c"/><path d="M110 428 v132 M710 428 v132" fill="none" stroke-width="12"/>
 <rect x="200" y="340" width="16" height="60" fill="#fff" stroke-width="4"/><ellipse cx="208" cy="326" rx="9" ry="16" fill="#ffd21f" stroke-width="3"/><rect x="560" y="340" width="16" height="60" fill="#fff" stroke-width="4"/><ellipse cx="568" cy="326" rx="9" ry="16" fill="#ffd21f" stroke-width="3"/>
 <ellipse cx="400" cy="396" rx="70" ry="12" fill="#fff" stroke-width="4"/><path d="M850 440 v90 M820 530 h60 M840 440 q10 -40 20 0Z" fill="none" stroke-width="6"/>
 <rect x="-60" y="560" width="1120" height="200" fill="#6b4a36"/><path d="M-60 560 H1060" fill="none"/>`);
  P.itphone = (o = {}) => wrapI('0 0 160 290', 160, 290, `<rect x="8" y="8" width="144" height="274" rx="26" fill="#26334a"/><rect x="20" y="40" width="120" height="206" rx="10" fill="${o.screen || '#2ee6d0'}"/><circle cx="80" cy="262" r="9" fill="#14263d" stroke="none"/><path d="M60 24 h40" fill="none" stroke-width="6"/>`);
  // foil-covered plate with a little steam-free dome
  P.itfoil = (o = {}) => wrapI('0 0 240 160', 240, 160, `<ellipse cx="120" cy="120" rx="108" ry="24" fill="#fff"/><path d="M30 118 q0 -78 90 -78 q90 0 90 78Z" fill="#cfd6e2"/><path d="M60 100 l30 -40 M120 94 l0 -50 M180 100 l-30 -40" fill="none" stroke="#fff" stroke-width="6" opacity=".7"/>`);
  // ---- IT LIFE set 6 (episode 7): the bench ----
  // waiting room (no clock; add a `clockface` item): o.era '2015' (amber) | '2026' (cool, dim), door with sign, wall calendar with a circled date, plant
  P.itwait = (o = {}) => {
    const old = (o.era || '2015') === '2015', wall = o.wall || (old ? '#f6dfb0' : '#35506a'), floor = old ? '#c7803c' : '#223a50', door = old ? '#b8742f' : '#26384c';
    return wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="${wall}" stroke="none"/>
 <rect x="130" y="60" width="170" height="210" rx="10" fill="#fff"/><rect x="130" y="60" width="170" height="54" rx="10" fill="${old ? '#e0543a' : '#4a5a74'}"/>
 ${[...Array(15).keys()].map(i => `<text x="${150 + (i % 5) * 30}" y="${150 + Math.floor(i / 5) * 36}" font-size="21" font-weight="800" fill="${IK}" stroke="none">${i + 8}</text>`).join('')}
 <circle cx="${150 + 2 * 30 + 9}" cy="${150 + 36 - 7}" r="20" fill="none" stroke="#e0543a" stroke-width="5"/>${old ? '<path d="M190 250 q14 14 28 0" fill="none" stroke-width="5"/><circle cx="192" cy="240" r="3" fill="#14263d" stroke="none"/><circle cx="216" cy="240" r="3" fill="#14263d" stroke="none"/>' : ''}
 <rect x="590" y="60" width="270" height="500" fill="${door}"/><rect x="620" y="96" width="210" height="116" rx="8" fill="#fff"/><text x="725" y="140" font-size="27" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">RESOURCE</text><text x="725" y="180" font-size="27" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">MANAGEMENT</text><circle cx="612" cy="340" r="9" fill="#ffd21f" stroke-width="3"/>
 <rect x="480" y="480" width="56" height="80" rx="8" fill="#c76b4a"/><path d="M508 480 q-40 -70 -8 -128 q38 50 8 128Z M508 480 q44 -60 74 -80 q10 56 -74 80Z" fill="#3ec97a" stroke-width="5"/>
 <rect x="-60" y="560" width="1120" height="200" fill="${floor}"/><path d="M-60 560 H1060" fill="none"/>`);
  };
  // seated silhouette checking a phone (grey, faceless): o.c colour
  P.itsil = (o = {}) => {
    const col = o.c || '#5a6a86', v = o.v || 1;
    const head = v === 2 ? `<circle cx="102" cy="62" r="38" fill="${col}"/><path d="M64 56 q4 -44 40 -44 q36 0 38 44Z M140 52 h34" fill="${col}" stroke-width="6"/>` : `<circle cx="102" cy="66" r="38" fill="${col}"/><path d="M58 76 q-6 -58 46 -58 q50 0 44 58 q-10 -30 -44 -30 q-34 0 -46 30Z" fill="${col}" stroke-width="6"/>`;
    const arms = v === 2 ? `<path d="M118 140 L168 150" fill="none" stroke="${col}" stroke-width="22"/><path d="M110 150 L158 166" fill="none" stroke="${col}" stroke-width="20"/><rect x="150" y="128" width="40" height="56" rx="8" fill="#cfe8ff" transform="rotate(10 170 156)"/>` : `<path d="M112 150 L128 190" fill="none" stroke="${col}" stroke-width="22"/><rect x="100" y="176" width="46" height="34" rx="7" fill="#cfe8ff"/>`;
    return wrapI('-20 -10 280 330', 280, 330, `<rect x="30" y="200" width="150" height="26" rx="8" fill="#8a97ae"/><path d="M50 226 V310 M160 226 V310" fill="none" stroke-width="9"/><rect x="26" y="100" width="40" height="110" rx="10" fill="#8a97ae"/>
 <path d="M58 200 L176 190 L184 270" fill="none" stroke="${col}" stroke-width="30"/>
 <rect x="62" y="${v === 2 ? 96 : 110}" width="62" height="${v === 2 ? 110 : 96}" rx="22" fill="${col}"/>${head}${arms}`);
  };
  P.itbook = (o = {}) => wrapI('0 0 160 120', 160, 120, `<rect x="10" y="30" width="140" height="80" rx="6" fill="#1F9CA8"/><rect x="10" y="30" width="140" height="22" rx="6" fill="#fff"/><path d="M10 64 h140 M10 84 h140" fill="none" stroke="#fff" stroke-width="5" opacity=".5"/>`);
  // ---- IT LIFE set 7 (episode 8): the client demo ----
  // conference room: wall TV (screen x274-726,y44-306 holds a little app with a GO button), five audience busts behind the table (o.lean = leaning forward), plant
  P.itconf = (o = {}) => {
    const lean = !!o.lean, cols = ['#4b5a74', '#6a5a7a', '#3f6a78', '#7a6a5a'], bust = (x, i) => { const dx = lean ? -14 : 0, dy = lean ? 22 : 0, c = i === 4 ? '#7a8aa6' : cols[i % 4]; return `<path d="M${x - 48 + dx} ${462 + dy} q0 -72 48 -72 q48 0 48 72Z" fill="${c}"/><circle cx="${x + dx}" cy="${360 + dy}" r="36" fill="${c}"/>${i === 4 ? `<path d="M${x + dx - 6} ${392 + dy} h12 l6 44 l-12 12 l-12 -12Z" fill="#e0543a" stroke-width="4"/><path d="M${x + dx - 15} ${366 + dy} q15 15 30 0" fill="none" stroke="#fff" stroke-width="5"/>` : ''}`; };
    return wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#cfd8e3" stroke="none"/>
 <rect x="260" y="30" width="480" height="290" rx="14" fill="#0f1722"/><rect x="274" y="44" width="452" height="262" rx="6" fill="#16263d"/><rect x="274" y="44" width="452" height="36" rx="6" fill="#1F9CA8"/><rect x="300" y="100" width="150" height="70" rx="8" fill="#26456b" stroke-width="4"/><rect x="300" y="190" width="400" height="14" rx="6" fill="#26456b" stroke-width="3"/><rect x="300" y="218" width="300" height="14" rx="6" fill="#26456b" stroke-width="3"/><rect x="560" y="120" width="120" height="50" rx="25" fill="#2f6fd6" stroke-width="4"/><text x="620" y="155" font-size="30" font-weight="800" text-anchor="middle" fill="#fff" stroke="none">GO</text>
 <rect x="470" y="320" width="60" height="40" fill="#8a97ae"/>
 ${[470, 560, 650, 740, 830].map((x, i) => bust(x, i)).join('')}
 <rect x="-60" y="450" width="1120" height="30" fill="#a86a2c"/><rect x="-60" y="480" width="1120" height="80" fill="#8a5a24"/>
 <rect x="-60" y="560" width="1120" height="200" fill="#5a6a86"/><path d="M-60 560 H1060" fill="none"/>`);
  };
  // two islands (my laptop / the client) with a dotted bridge; green tick on the left, red flag on the right
  P.itmap = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1900" fill="#7fd0e6" stroke="none"/>
 <path d="M-60 120 q100 -40 200 0 t200 0" fill="none" stroke="#fff" stroke-width="10" opacity=".6"/><path d="M500 60 q100 -40 200 0 t200 0" fill="none" stroke="#fff" stroke-width="10" opacity=".6"/>
 <path d="M60 520 q-10 -140 150 -150 q170 -10 200 130 q10 70 -120 90 q-180 14 -230 -70Z" fill="#9be08a"/><path d="M560 540 q-20 -150 150 -160 q190 -10 220 130 q8 70 -130 90 q-190 12 -240 -60Z" fill="#e8c88a"/>
 <path d="M410 470 q80 -40 150 0" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="4 16"/>
 <circle cx="220" cy="400" r="46" fill="#3ec97a"/><path d="M198 402 l16 16 l30 -34" fill="none" stroke="#fff" stroke-width="10"/>
 <path d="M760 340 V470" fill="none" stroke-width="9"/><path d="M760 340 l80 24 l-80 24Z" fill="#e0543a" stroke-width="6"/>`);
  P.itflame = (o = {}) => wrapI('0 0 90 120', 90, 120, `<path d="M45 8 C60 34 84 52 76 84 C70 108 50 116 40 114 C22 112 8 98 12 74 C16 54 34 48 45 8Z" fill="#ff7a2b"/><path d="M46 46 C54 62 66 72 60 90 C56 102 46 106 40 104 C30 102 24 92 28 80 C32 68 42 66 46 46Z" fill="#ffd21f" stroke-width="5"/>`);
  // ---- IT LIFE set 8 (episode 9): hats and a platform tower ----
  // role hat, anchored bottom-centre so hats stack: o.kind 'cap' | 'hard' | 'db' | 'cloud' | 'pipe' | 'shield' | 'wizard', o.c colour
  P.ithat = (o = {}) => {
    const c = o.c || '#e0543a', k = o.kind || 'cap';
    const g = {
      cap: `<path d="M30 100 q0 -66 70 -66 q70 0 70 66Z" fill="${c}"/><path d="M150 100 q36 -4 40 12 h-80 q4 -12 40 -12Z" fill="${c}"/><circle cx="100" cy="30" r="8" fill="${c}"/>`,
      hard: `<path d="M26 104 q0 -78 74 -78 q74 0 74 78Z" fill="${c}"/><path d="M12 104 h176 v14 h-176Z" fill="${c}"/><path d="M100 26 v78" fill="none" stroke-width="10"/>`,
      db: `<ellipse cx="100" cy="30" rx="56" ry="16" fill="${c}"/><path d="M44 30 v70 q56 30 112 0 v-70" fill="${c}"/><path d="M44 52 q56 28 112 0 M44 76 q56 28 112 0" fill="none" stroke-width="6"/><ellipse cx="100" cy="30" rx="56" ry="16" fill="${c}"/>`,
      cloud: `<path d="M44 108 q-30 0 -30 -26 q0 -22 28 -24 q6 -34 44 -32 q30 0 40 24 q40 -4 48 24 q4 34 -30 34Z" fill="${c}"/>`,
      pipe: `<path d="M44 108 L100 14 L156 108Z" fill="${c}"/><path d="M80 80 h44 l-12 -12 M124 80 l-12 12" fill="none" stroke="#fff" stroke-width="8"/><rect x="26" y="108" width="148" height="12" rx="6" fill="${c}"/>`,
      shield: `<path d="M26 104 q0 -76 74 -76 q74 0 74 76Z" fill="${c}"/><rect x="14" y="104" width="172" height="14" rx="7" fill="${c}"/><path d="M100 44 l24 10 v22 q0 18 -24 28 q-24 -10 -24 -28 v-22Z" fill="#ffd21f" stroke-width="5"/>`,
      wizard: `<path d="M40 112 L96 4 Q108 -6 112 10 L168 112Z" fill="${c}"/><rect x="18" y="108" width="164" height="14" rx="7" fill="${c}"/><path d="M92 62 l6 14 l15 2 l-11 10 l3 15 l-13 -8 l-13 8 l3 -15 l-11 -10 l15 -2Z" fill="#ffd21f" stroke-width="4"/>` }[k];
    return wrapI('0 0 200 126', 200, 126, g);
  };
  // stick-style platform tower with a name plate: o.label
  P.ittower = (o = {}) => wrapI('0 0 240 520', 240, 520, `<rect x="40" y="40" width="160" height="470" fill="#9fb0c4"/><rect x="40" y="40" width="160" height="16" fill="#7d8da6"/>
 ${[...Array(6).keys()].map(r => [0, 1, 2].map(cx => `<rect x="${58 + cx * 48}" y="${74 + r * 62}" width="32" height="40" rx="4" fill="${(r + cx) % 3 === 0 ? '#ffd21f' : '#cfe8ff'}" stroke-width="4"/>`).join('')).join('')}
 <path d="M120 40 V8" fill="none" stroke-width="8"/><circle cx="120" cy="8" r="9" fill="#e0543a" stroke-width="4"/>
 <rect x="20" y="446" width="200" height="56" rx="10" fill="#fff"/><text x="120" y="484" font-size="${(o.label || 'PLATFORM').length > 9 ? 26 : 32}" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">${o.label || 'PLATFORM'}</text>`);
  // video-call grid: o.tiles = [{c:'#colour', f:'smile'|'q'|'flat'|'mgr'}] up to 4
  P.itcall = (o = {}) => {
    const tiles = o.tiles || [{ c: '#bfe6ea', f: 'mgr' }, { c: '#d9d2f0', f: 'q' }, { c: '#d9d2f0', f: 'q' }, { c: '#d9d2f0', f: 'q' }];
    const face = (f, x, y) => f === 'q' ? `<text x="${x}" y="${y + 40}" font-size="120" font-weight="800" text-anchor="middle" fill="${IK}" stroke="none">?</text>`
      : `<circle cx="${x}" cy="${y}" r="52" fill="#fff3dc"/><circle cx="${x - 18}" cy="${y - 6}" r="6" fill="${IK}" stroke="none"/><circle cx="${x + 18}" cy="${y - 6}" r="6" fill="${IK}" stroke="none"/><path d="${f === 'smile' || f === 'mgr' ? `M${x - 22} ${y + 18} q22 18 44 0` : `M${x - 20} ${y + 22} h40`}" fill="none" stroke-width="5"/>${f === 'mgr' ? `<path d="M${x - 8} ${y + 52} h16 l8 40 l-16 14 l-16 -14Z" fill="#e0543a" stroke-width="4"/>` : ''}`;
    return wrapI('0 0 960 620', 960, 620, tiles.slice(0, 4).map((t, i) => { const x = (i % 2) * 490, y = Math.floor(i / 2) * 320; return `<rect x="${x}" y="${y}" width="470" height="300" rx="22" fill="${t.c}"/>${face(t.f, x + 235, y + 120)}`; }).join(''));
  };
  P.itcloud = (o = {}) => wrapI('0 0 420 220', 420, 220, `<path d="M70 190 q-60 0 -60 -50 q0 -46 56 -48 q10 -70 96 -68 q60 0 84 46 q96 -14 118 52 q40 4 40 50 q0 18 -26 18Z" fill="${o.color || '#6b7a99'}"/><path d="M190 150 l-26 42 h26 l-14 36 l46 -52 h-28 l20 -26Z" fill="#ffd21f" stroke-width="5"/>`);
  P.itlaptop = (o = {}) => wrapI('-60 -60 480 360', 480, 360, `${o.glow ? `<ellipse cx="180" cy="90" rx="230" ry="170" fill="${o.glow}" opacity=".28" stroke="none"/><ellipse cx="180" cy="90" rx="170" ry="120" fill="${o.glow}" opacity=".3" stroke="none"/>` : ''}<rect x="40" y="0" width="280" height="180" rx="14" fill="${o.lid || '#26334a'}"/><rect x="58" y="16" width="244" height="148" rx="6" fill="${o.screen || '#cfe8ff'}"/>${o.lines === false ? '' : '<path d="M78 46 h140 M78 76 h190 M78 106 h110" fill="none" stroke-width="7" opacity=".55"/>'}<path d="M0 196 H360 L340 226 H20Z" fill="#9fb0c4"/>`);

  // ---- places & things -----------------------------------------------------
  P.stand = (o = {}) => {
    const label = o.label || 'LEMON', main = o.color || '#ff5d73';
    const scallops = [0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M${10 + i * 44.3} 70 q22.1 34 44.3 0" fill="${i % 2 ? '#fff' : main}"/>`).join('');
    const stripes = [0, 2, 4, 6].map(i => `<path d="M${10 + i * 44.3 + 6} 66 L${44 + i * 35.7} 12 H${44 + i * 35.7 + 24} L${10 + (i + 1) * 44.3 - 4} 66Z" fill="${main}" stroke="none"/>`).join('');
    return wrap('-10 -40 350 360', 350, 360, `
 <rect x="26" y="150" width="278" height="170" rx="6" fill="#fff"/><rect x="26" y="262" width="278" height="58" rx="6" fill="#ececf4" stroke="none"/><rect x="26" y="150" width="278" height="170" rx="6" fill="none"/>
 <rect x="44" y="70" width="242" height="112" rx="10" fill="url(#glass)"/><path d="M60 80 L110 80 L80 176 L60 176Z" fill="#fff" opacity=".35" stroke="none"/>
 <rect x="10" y="176" width="310" height="30" rx="8" fill="#b98a4e"/><rect x="14" y="180" width="302" height="9" rx="4" fill="#dbb078" stroke="none"/>
 <ellipse cx="165" cy="160" rx="46" ry="11" fill="#f2c36b"/>
 <path d="M10 70 L40 8 H290 L320 70 Z" fill="#fff"/>${scallops}${stripes}<path d="M10 70 L40 8 H290 L320 70" fill="none"/>
 <rect x="82" y="-24" width="166" height="40" rx="8" fill="#ffd21f"/>
 <text x="165" y="7" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="26" fill="${INK}" stroke="none">${label}</text>`);
  };

  P.tower = (o = {}) => {
    const c = o.color || '#6f7bd9', rows = o.rows || 9;
    let wins = '';
    for (let r = 0; r < rows; r++) for (let k = 0; k < 4; k++) wins += `<rect x="${34 + k * 56}" y="${40 + r * 40}" width="34" height="24" rx="4" fill="${(r * 3 + k) % 5 === 0 ? '#ffe45c' : '#cfe8ff'}" stroke-width="4"/>`;
    const h = 60 + rows * 40;
    return wrap(`-10 -30 280 ${h + 40}`, 280, h + 40, `<rect x="10" y="10" width="240" height="${h}" rx="10" fill="${c}"/><rect x="20" y="-20" width="220" height="40" rx="8" fill="${c}" style="filter:brightness(.9)"/>${wins}<rect x="104" y="${h - 36}" width="52" height="46" rx="6" fill="#241532"/>
 ${o.label ? `<rect x="40" y="-4" width="180" height="34" rx="8" fill="#fff"/><text x="130" y="21" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="22" fill="${INK}" stroke="none">${o.label}</text>` : ''}`);
  };

  P.phone = (o = {}) => wrap('-10 -10 200 380', 200, 380, `<rect x="0" y="0" width="180" height="360" rx="32" fill="#1b1730"/><rect x="14" y="30" width="152" height="300" rx="14" fill="${o.screen || '#3ee0b0'}"/>
 <circle cx="90" cy="182" r="42" fill="#fff" opacity=".9"/><path d="M90 150 l0 32 l22 14" fill="none" stroke="${INK}" stroke-width="8"/><rect x="62" y="10" width="56" height="9" rx="4" fill="#3a355a" stroke="none"/>
 ${o.label ? `<text x="90" y="300" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="26" fill="${INK}" stroke="none">${o.label}</text>` : ''}`);

  P.box = (o = {}) => wrap('-10 -50 260 230', 260, 230, `<path d="M120 20 V-34" fill="none"/><circle cx="120" cy="-38" r="9" fill="#ff5d73"/>
 <rect x="0" y="20" width="240" height="150" rx="16" fill="${o.color || '#8c93a8'}"/><rect x="18" y="40" width="130" height="40" rx="6" fill="#2c2f45"/><circle cx="190" cy="60" r="14" fill="#ffd21f"/>
 ${[0, 1, 2, 3, 4].map(i => `<rect x="${20 + i * 40}" y="110" width="28" height="30" rx="5" fill="#cfd3e6" stroke-width="4"/>`).join('')}
 ${o.label ? `<text x="120" y="162" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="22" fill="#fff" stroke="none">${o.label}</text>` : ''}`);

  P.truck = (o = {}) => wrap('-10 -10 420 230', 420, 230, `<rect x="0" y="20" width="260" height="140" rx="12" fill="${o.color || '#fff'}"/><path d="M260 60 h70 l50 50 v50 h-120Z" fill="${o.cab || '#ff5d73'}"/><path d="M280 76 h40 l30 30 h-70Z" fill="url(#glass)"/>
 <circle cx="70" cy="170" r="30" fill="#2c2f45"/><circle cx="70" cy="170" r="12" fill="#cfd3e6" stroke-width="4"/><circle cx="310" cy="170" r="30" fill="#2c2f45"/><circle cx="310" cy="170" r="12" fill="#cfd3e6" stroke-width="4"/>
 ${o.label ? `<text x="130" y="105" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="34" fill="${INK}" stroke="none">${o.label}</text>` : ''}`);

  P.letter = (o = {}) => wrap('-10 -10 360 250', 360, 250, `<rect x="0" y="0" width="340" height="230" rx="16" fill="#fff"/><path d="M0 14 L170 130 L340 14" fill="none"/>
 ${o.lines ? o.lines.map((t, i) => `<text x="170" y="${170 + i * 26}" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="24" fill="${o.color || INK}" stroke="none">${t}</text>`).join('') : ''}`);

  P.doc = (o = {}) => wrap('-10 -10 200 250', 200, 250, `<rect x="0" y="0" width="180" height="230" rx="10" fill="#fff"/><text x="90" y="40" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="30" fill="${INK}" stroke="none">${o.label || 'DEAL'}</text>
 ${[0, 1, 2].map(i => `<path d="M24 ${70 + i * 16} h132" stroke="#c9c6dd" stroke-width="5"/>`).join('')}<path d="M26 190 l16 -22 l14 30 l16 -34 l14 26 l16 -18 l16 14" fill="none" stroke="#3b5bdb" stroke-width="6"/>`);

  P.bill = (o = {}) => wrap('-10 -10 270 150', 270, 150, `<rect x="6" y="6" width="238" height="118" rx="14" fill="#3ec97a"/><rect x="20" y="20" width="210" height="90" rx="8" fill="none" stroke="#b6f5cf" stroke-width="4"/><circle cx="125" cy="65" r="36" fill="#2ba35f"/>
 <text x="125" y="80" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="44" fill="#eafff2" stroke="none">${o.label || '$20'}</text>`);

  P.coin = (o = {}) => wrap('-6 -6 64 64', 54, 54, `<circle cx="27" cy="27" r="23" fill="#ffd21f" stroke-width="5"/><circle cx="27" cy="27" r="14" fill="none" stroke="#f59a00" stroke-width="4"/><text x="27" y="35" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="22" fill="#b86a00" stroke="none">$</text>`);

  P.bottle = (o = {}) => wrap('-10 -10 120 200', 90, 150, `<rect x="30" y="0" width="40" height="28" rx="6" fill="#fff"/><path d="M20 28 h60 v40 q20 14 20 40 v50 q0 14 -14 14 h-72 q-14 0 -14 -14 v-50 q0 -26 20 -40Z" fill="url(#glass)"/><path d="M6 110 h88 v54 q0 14 -14 14 h-60 q-14 0 -14 -14Z" fill="url(#gold)" stroke="none"/>`);

  P.pot = (o = {}) => wrap('-10 -40 280 240', 280, 240, `<path d="M40 70 H220 V150 Q220 200 170 200 H90 Q40 200 40 150Z" fill="${o.color || '#9aa3b8'}"/><rect x="28" y="52" width="204" height="26" rx="12" fill="#c9d0e0"/><path d="M28 100 H6 M232 100 H254" fill="none" stroke-width="12" stroke-linecap="round"/><path d="M90 40 q-14 -18 0 -34 M130 40 q-14 -18 0 -34 M170 40 q-14 -18 0 -34" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="7" stroke-linecap="round"/><text x="130" y="150" text-anchor="middle" font-size="40" font-weight="800" fill="#232a55" stroke="none">${o.label || ''}</text>`);
  P.cup = (o = {}) => wrap('-10 -10 120 150', 100, 130, `<path d="M6 0 H94 L80 126 H20Z" fill="${o.color || '#fff'}"/><path d="M12 36 H88 L80 126 H20Z" fill="url(#gold)" stroke="none"/><path d="M6 0 H94 L80 126 H20Z" fill="none"/>`);

  P.hotdog = (o = {}) => wrap('-10 -10 340 190', 340, 190, `
 <path d="M10 120 q0 -50 150 -50 q150 0 150 50 q0 40 -150 40 q-150 0 -150 -40Z" fill="#e8b46a"/>
 <rect x="0" y="60" width="320" height="64" rx="32" fill="${o.meat || '#c4553a'}"/><path d="M24 78 q30 -10 60 0" fill="none" stroke="#e98a73" stroke-width="6"/>
 <path d="M20 96 q20 -22 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#ffd21f" stroke-width="9"/>
 <path d="M10 112 q0 36 150 36 q150 0 150 -36 q0 56 -150 56 q-150 0 -150 -56Z" fill="#d79a4e"/>`);

  // "Pride": a small smug shadow that whispers bad advice (original character)
  P.pride = (o = {}) => { const c = o.color || '#5b3aa8'; return wrap('-10 -30 190 230', 190, 230, `
 <path d="M26 24 l-18 -38 l42 22Z M144 24 l18 -38 l-42 22Z" fill="${c}"/>
 <path d="M20 84 q0 -74 65 -74 q65 0 65 74 q0 62 -18 104 q-8 16 -26 16 h-42 q-18 0 -26 -16 q-18 -42 -18 -104Z" fill="${c}"/>
 <path d="M40 78 q18 -16 36 0 q-18 8 -36 0Z M94 78 q18 -16 36 0 q-18 8 -36 0Z" fill="#ffd21f" stroke-width="5"/>
 <path d="M46 78 h24 M100 78 h24" stroke-width="6"/>
 <path d="M48 124 q37 36 76 0 q-38 -12 -76 0Z" fill="#1c1233"/><path d="M62 128 l6 8 l6 -8 M96 128 l6 8 l6 -8" fill="#fff" stroke-width="3"/>`); };
  P.laptop = (o = {}) => wrap('-10 -10 330 230', 330, 230, `<rect x="30" y="0" width="250" height="160" rx="12" fill="#2c2f45"/><rect x="44" y="14" width="222" height="132" rx="6" fill="${o.screen || '#cfe8ff'}"/>
 ${[0,1,2,3].map(i => `<path d="M60 ${40 + i * 24} h${150 - i * 20}" stroke="#7aa0d8" stroke-width="7"/>`).join('')}<path d="M0 172 h310 l-14 28 h-282Z" fill="#b9bfd6"/>`);
  P.carton = (o = {}) => wrap('-10 -50 290 270', 290, 270, `<path d="M40 30 l-30 -30 M230 30 l30 -30" fill="none"/><path d="M10 40 l40 -34 h170 l40 34Z" fill="#d9a35f"/>
 <path d="M110 40 q-4 -60 40 -70 q4 30 -10 70Z" fill="#46c27a"/><rect x="170" y="-4" width="46" height="52" rx="8" fill="#fff"/><path d="M216 8 q22 4 0 28" fill="none"/>
 <rect x="10" y="40" width="250" height="170" rx="6" fill="#e7b570"/><rect x="100" y="40" width="70" height="26" fill="#c98a45" stroke-width="5"/>
 <text x="135" y="140" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="30" fill="${INK}" stroke="none">${o.label || 'DESK'}</text>`);


  // ---- IT LIFE set 10 (episode 10): the only one who remembers ----
  P.itnight = (o = {}) => wrapI('0 0 1000 720', 1000, 720, `<rect x="-60" y="-1100" width="1120" height="1700" fill="#0f1a2e" stroke="none"/><path d="M640 120 L330 560 H950 Z" fill="#ffd98a" opacity=".16" stroke="none"/><rect x="-60" y="600" width="1120" height="200" fill="#1a2a44" stroke="none"/><path d="M-60 600 H1060" fill="none" stroke="#3c5478" stroke-width="6"/><g opacity=".9"><rect x="70" y="150" width="150" height="190" fill="#16283f" stroke="#3c5478" stroke-width="6"/><path d="M145 150 V340 M70 245 H220" fill="none" stroke="#3c5478" stroke-width="5"/><circle cx="170" cy="210" r="5" fill="#fff" stroke="none"/><circle cx="105" cy="280" r="4" fill="#fff" stroke="none"/></g><rect x="500" y="500" width="440" height="40" fill="#8a5a2c"/><path d="M540 540 V620 M900 540 V620" fill="none" stroke-width="14"/><rect x="640" y="380" width="200" height="120" rx="8" fill="#243a5a"/><rect x="654" y="394" width="172" height="92" fill="#143a52" stroke-width="4"/><path d="M670 412 h60 M670 432 h90 M670 452 h50" fill="none" stroke="#62f0c8" stroke-width="6"/><path d="M740 500 v14 M700 514 h80" fill="none" stroke-width="10"/><path d="M880 500 l20 -110 l50 -40" fill="none" stroke="#c9d3e6" stroke-width="10"/><path d="M930 350 l-30 -22 l-34 36 l34 22Z" fill="#ffd21f"/>`);
  // rules graph: boxes + arrows. o.order: 'wrong' (A,C,B chain flagged) | 'right' ; o.hot index flagged
  P.itrules = (o = {}) => {
    const cols = o.order === 'right' ? ['#fff', '#fff', '#fff', '#fff'] : ['#fff', '#fff', '#fff', '#fff'];
    const lab = o.order === "right" ? ["A","B","C","D"] : ["A","C","B","D"]; if (o.order !== "right") cols[1] = "#ffb0a0", cols[2] = "#ffb0a0", cols[0] = "#fff";
    const box = (x, y, i) => `<rect x="${x}" y="${y}" width="90" height="70" rx="10" fill="${cols[i]}"/><text x="${x + 45}" y="${y + 48}" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="36" fill="${INK}" stroke="none">${lab[i]}</text>`;
    const xs = [10, 150, 290, 430];
    return wrapI('0 0 540 120', 540, 120, xs.map((x, i) => box(x, 20, i)).join('') + [0, 1, 2].map(i => `<path d="M${xs[i] + 98} 55 H${xs[i + 1] - 8} M${xs[i + 1] - 20} 45 l12 10 l-12 10" fill="none" stroke-width="6"/>`).join(''));
  };
  P.itboard = (o = {}) => wrapI('0 0 300 220', 300, 220, `<rect x="8" y="8" width="284" height="170" rx="8" fill="#fff"/><rect x="8" y="8" width="284" height="170" rx="8" fill="none" stroke="#9fb0c4" stroke-width="10"/><path d="M60 178 v40 M240 178 v40" fill="none" stroke-width="10"/><rect x="32" y="40" width="62" height="44" rx="6" fill="#ffe3b0" stroke-width="5"/><rect x="118" y="40" width="62" height="44" rx="6" fill="#bfe6ff" stroke-width="5"/><rect x="204" y="40" width="62" height="44" rx="6" fill="#cfeed6" stroke-width="5"/><path d="M96 62 h18 M182 62 h18" fill="none" stroke-width="5"/><path d="M40 118 q40 -20 80 0 t90 0" fill="none" stroke="#e0543a" stroke-width="6"/><path d="M40 146 h120" fill="none" stroke-width="5" opacity=".5"/>`);
  P.itbrain = (o = {}) => wrapI('0 0 240 200', 240, 200, `<path d="M120 22 C90 -6 40 8 38 50 C10 56 4 98 26 112 C16 140 40 168 72 160 C86 188 118 184 120 164 C122 184 154 188 168 160 C200 168 224 140 214 112 C236 98 230 56 202 50 C200 8 150 -6 120 22Z" fill="${o.color || '#ff9ec7'}"/><path d="M120 24 V164 M70 70 q22 6 30 28 M170 70 q-22 6 -30 28 M62 124 q20 -6 34 8 M178 124 q-20 -6 -34 8" fill="none" stroke-width="6" opacity=".55"/>`);
  P.itdoc = (o = {}) => wrapI('0 0 160 200', 160, 200, `<path d="M12 8 H110 L148 46 V192 H12Z" fill="#fff"/><path d="M110 8 V46 H148" fill="#e5ebf5"/><path d="M34 80 h92 M34 106 h92 M34 132 h60" fill="none" stroke-width="7" opacity=".4"/>${o.x ? '<path d="M44 150 l70 30 M114 150 l-70 30" fill="none" stroke="#e0543a" stroke-width="10"/>' : ''}`);
  P.itwiki = (o = {}) => wrapI('0 0 200 200', 200, 200, `<rect x="14" y="20" width="172" height="160" rx="10" fill="#e8dcc0"/><path d="M14 52 H186" fill="none" stroke-width="6"/><circle cx="34" cy="36" r="6" fill="#e0543a" stroke="none"/><circle cx="54" cy="36" r="6" fill="#ffd21f" stroke="none"/><text x="100" y="128" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="46" fill="${INK}" stroke="none">WIKI</text><path d="M50 150 q10 -10 20 0 M90 150 q10 -10 20 0 M130 150 q10 -10 20 0" fill="none" stroke-width="4" opacity=".4"/>`);


  // ---- IT LIFE set 11 (episode 11): the interview door ----
  // door 300x520: o.c colour, o.w width (default 300), o.knob; closed lock icons are separate (itlock)
  P.itdoor = (o = {}) => { const w = o.w || 300, c = o.c || '#c7803c';
    return wrapI(`-20 -20 ${w + 40} 560`, w + 40, 560, `<rect x="-14" y="-14" width="${w + 28}" height="548" fill="#8a97ae"/><rect x="0" y="0" width="${w}" height="520" fill="${c}"/><rect x="22" y="26" width="${w - 44}" height="190" rx="8" fill="${c}" stroke-width="5" opacity=".9"/><rect x="22" y="250" width="${w - 44}" height="240" rx="8" fill="${c}" stroke-width="5" opacity=".9"/><circle cx="${w - 34}" cy="270" r="14" fill="#ffd21f"/>${o.sign ? `<rect x="${w / 2 - 70}" y="-70" width="140" height="44" rx="8" fill="#fff"/><text x="${w / 2}" y="-38" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="26" fill="${INK}" stroke="none">${o.sign}</text>` : ''}`); };
  P.itlock = (o = {}) => wrapI('0 0 90 110', 90, 110, `<path d="M20 50 V34 q0 -28 25 -28 q25 0 25 28 V50" fill="none" stroke-width="10"/><rect x="6" y="48" width="78" height="58" rx="10" fill="${o.c || '#ffd21f'}"/><circle cx="45" cy="72" r="8" fill="${INK}" stroke="none"/><path d="M45 76 v16" fill="none" stroke-width="7"/>`);
  P.itpaper = (o = {}) => wrapI('0 0 240 170', 240, 170, `<path d="M10 150 L40 10 H230 L200 150Z" fill="#fff"/><rect x="70" y="40" width="46" height="34" rx="5" fill="#ffe3b0" stroke-width="4"/><rect x="140" y="40" width="46" height="34" rx="5" fill="#bfe6ff" stroke-width="4"/><path d="M116 57 h24 M93 74 v26 M163 74 v26" fill="none" stroke-width="4"/><rect x="70" y="100" width="46" height="30" rx="5" fill="#cfeed6" stroke-width="4"/><rect x="140" y="100" width="46" height="30" rx="5" fill="#cfeed6" stroke-width="4"/>`);

  P.defs = `<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be7ff"/><stop offset="1" stop-color="#3a86e0"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45c"/><stop offset="1" stop-color="#f5a800"/></linearGradient>`;
  window.PROPS = P;
})();
