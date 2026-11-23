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
    const c = Object.assign({ body: '#3a4a9f', body2: '#2c3a80', pants: '#232a55', skin: '#f3b27a', hair: '#5a3a22', hat: null, tie: '#ff5d73', shirt: '#fff', hood: false, glasses: false, brow: 0 }, o);
    const hat = c.hat ? `<path d="M-70 30 q4 -58 70 -62 q66 4 70 62 q-34 -22 -70 -22 q-36 0 -70 22Z" fill="${c.hat}"/><path d="M-18 -26 q58 -20 96 24 q14 6 18 16 q-26 -8 -60 -4 q-22 -14 -54 -36Z" fill="${c.hat}" style="filter:brightness(.85)"/>`
      : `<path d="M-68 38 q-6 -64 68 -66 q74 2 68 66 q-26 -30 -68 -30 q-42 0 -68 30Z" fill="${c.hair}"/>`;
    const torso = c.hood
      ? `<path d="M-64 124 q0 -30 32 -30 h64 q32 0 32 30 V268 q0 10 -10 10 H-54 q-10 0 -10 -10Z" fill="${c.body}"/><path d="M-30 96 q30 34 60 0" fill="${c.body2}"/><rect x="-34" y="190" width="68" height="40" rx="12" fill="${c.body2}"/>`
      : `<path d="M-62 120 q0 -26 30 -26 h64 q30 0 30 26 V268 H-62Z" fill="${c.body}"/><path d="M-26 94 L0 168 L26 94 Z" fill="${c.shirt}"/><path d="M-2 120 h4 l5 48 l-7 12 l-7 -12Z" fill="${c.tie}" stroke-width="4"/>`;
    const sleeve = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="40"/><path d="${d}" fill="none" stroke="${c.body}" stroke-width="28"/>`;
    const body = `
 <path d="M-34 250 V332 q0 14 -14 14 h-8 q-14 0 -14 -12 q0 -10 16 -12 V250Z" fill="${c.pants}"/><path d="M34 250 V332 q0 14 14 14 h8 q14 0 14 -12 q0 -10 -16 -12 V250Z" fill="${c.pants}"/>
 <rect x="-62" y="332" width="52" height="24" rx="11" fill="${c.hood ? '#fff' : '#14161f'}"/><rect x="10" y="332" width="52" height="24" rx="11" fill="${c.hood ? '#fff' : '#14161f'}"/>
 ${torso}
 ${sleeve('M-62 130 q-30 40 -22 94')}<circle cx="-84" cy="232" r="17" fill="${c.skin}"/>
 <circle cx="0" cy="40" r="68" fill="${c.skin}"/>
 ${hat}
 <circle cx="-24" cy="48" r="7" fill="${INK}" stroke="none"/><circle cx="24" cy="48" r="7" fill="${INK}" stroke="none"/>
 <circle cx="-21" cy="45" r="2.4" fill="#fff" stroke="none"/><circle cx="27" cy="45" r="2.4" fill="#fff" stroke="none"/>
 ${c.glasses ? `<circle cx="-24" cy="48" r="17" fill="none"/><circle cx="24" cy="48" r="17" fill="none"/><path d="M-7 48 h14" />` : ''}
 <path d="M-40 ${30 + c.brow} l22 ${-4 - c.brow}M40 ${30 + c.brow} l-22 ${-4 - c.brow}" fill="none" stroke-width="6"/>
 <ellipse cx="-40" cy="66" rx="9" ry="5" fill="#ff8a8a" stroke="none" opacity=".6"/><ellipse cx="40" cy="66" rx="9" ry="5" fill="#ff8a8a" stroke="none" opacity=".6"/>
 <path class="mouth" d="M-18 72 q18 12 36 0" fill="none" stroke-width="5"/>
 <g class="arm" style="transform-origin:62px 130px">${sleeve('M62 130 q40 18 70 62')}<circle cx="138" cy="198" r="17" fill="${c.skin}"/></g>`;
    return wrap('-110 -60 330 420', 330, 420, body);
  };

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

  P.cup = (o = {}) => wrap('-10 -10 120 150', 100, 130, `<path d="M6 0 H94 L80 126 H20Z" fill="${o.color || '#fff'}"/><path d="M12 36 H88 L80 126 H20Z" fill="url(#gold)" stroke="none"/><path d="M6 0 H94 L80 126 H20Z" fill="none"/>`);

  P.hotdog = (o = {}) => wrap('-10 -10 340 190', 340, 190, `
 <path d="M10 120 q0 -50 150 -50 q150 0 150 50 q0 40 -150 40 q-150 0 -150 -40Z" fill="#e8b46a"/>
 <rect x="0" y="60" width="320" height="64" rx="32" fill="${o.meat || '#c4553a'}"/><path d="M24 78 q30 -10 60 0" fill="none" stroke="#e98a73" stroke-width="6"/>
 <path d="M20 96 q20 -22 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#ffd21f" stroke-width="9"/>
 <path d="M10 112 q0 36 150 36 q150 0 150 -36 q0 56 -150 56 q-150 0 -150 -56Z" fill="#d79a4e"/>`);

  P.defs = `<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be7ff"/><stop offset="1" stop-color="#3a86e0"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45c"/><stop offset="1" stop-color="#f5a800"/></linearGradient>`;
  window.PROPS = P;
})();
