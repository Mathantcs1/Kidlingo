// inspiration-shorts engine: window.init(spec, words) then window.renderAt(t) draws the frame at time t (deterministic).
// spec + words.json come from the project folder; see references/spec-format.md.
(function () {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const eOut = x => 1 - Math.pow(1 - x, 3);
  const eBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const eInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lerp = (a, b, x) => a + (b - a) * x;
  const pop = (t, t0, d = .38) => t < t0 ? 0 : eBack(clamp((t - t0) / d));

  const DEFAULT_KIT = {
    ink: '#241532',
    font: 'Poppins',
    gold: ['#fff4a8', '#ffd21f', '#f59a00'],
    caption: { hl: '#ffc928', bg: 'rgba(30,20,40,.80)', size: 74, y: 1262, words: 3 },
    layout: { counterY: 150 },
    rail: null,
    // Original background system: diagonal gradient + drifting colour glows + faint dot texture + layered hills.
    // (No spotlight rays, no star field, no flat ground band.)
    bgs: {
      night:  { angle: 155, stops: ['#0b1026', '#1b1f5e', '#3a1f6e'], dots: { o: .07 },
                blobs: [ { c: '#7b5cff', x: 160, y: 300, r: 540, s: .35, dx: 80, dy: 60, o: .5 }, { c: '#00c2ff', x: 930, y: 1260, r: 580, s: .28, dx: 70, dy: 50, o: .26 } ] },
      mint:   { angle: 170, stops: ['#e9fff7', '#aef3dc', '#4fd1b4', '#17897c'], dots: { c: '#ffffff', o: .22, s: 52 },
                blobs: [ { c: '#ffffff', x: 880, y: 260, r: 520, s: .3, dx: 60, dy: 40, o: .6 } ], hills: { y: 1110, colors: ['#35b3a1', '#1f8f80', '#0f6358'] } },
      amber:  { angle: 160, stops: ['#fff6dc', '#ffd9a0', '#ffab6b', '#e2723a'], dots: { c: '#ffffff', o: .22, s: 52 },
                blobs: [ { c: '#fff2c4', x: 200, y: 300, r: 520, s: .3, dx: 70, dy: 40, o: .7 } ], hills: { y: 1110, colors: ['#f28c52', '#d96a33', '#a8481f'] } },
      violet: { angle: 165, stops: ['#9a7cf5', '#7456d6', '#43308f', '#271a5f'], dots: { o: .08 },
                blobs: [ { c: '#ff7ad9', x: 900, y: 320, r: 500, s: .33, dx: 70, dy: 50, o: .38 }, { c: '#5ad1ff', x: 120, y: 1240, r: 520, s: .27, dx: 60, dy: 40, o: .25 } ] },
      sunset: { angle: 175, stops: ['#ffc98a', '#ff8c6b', '#c9467a', '#34205e'], dots: { c: '#ffffff', o: .1 },
                blobs: [ { c: '#fff0b8', x: 540, y: 220, r: 600, s: .25, dx: 90, dy: 30, o: .55 } ] },
      ink:    { angle: 160, stops: ['#16122c', '#100e24', '#0a0919'], dots: { o: .05 },
                blobs: [ { c: '#5b4bd6', x: 540, y: 700, r: 640, s: .22, dx: 90, dy: 80, o: .22 } ] },
      paper:  { angle: 165, stops: ['#fffaf0', '#f6ecd6', '#e9dab8'], blobs: [], hills: { y: 1110, colors: ['#e2cf9f', '#cbb583', '#a89462'] } },
      steel:  { angle: 168, stops: ['#eef4ff', '#bcd3f7', '#7fa7e0', '#41679f'], dots: { c: '#ffffff', o: .2, s: 52 },
                blobs: [ { c: '#ffffff', x: 220, y: 280, r: 520, s: .3, dx: 70, dy: 40, o: .6 } ], hills: { y: 1110, colors: ['#4f78b3', '#365d93', '#244470'] } }
    }
  };
  const deepMerge = (a, b) => { const o = Object.assign({}, a); for (const k in (b || {})) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k]) ? deepMerge(a[k], b[k]) : b[k]; return o; };

  let flashEl, S, WORDS = [], KIT, stage, ACTS = [], ITEMS = [], EV = [], CH = [], capEl, railEl, counterEl, svgDefs;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9']/g, '');

  // "word", "word#2" (2nd occurrence, 1-based), "word@end", optional +/-offset; or a number of seconds
  function R(ref) {
    if (typeof ref === 'number') return ref;
    const m = /^([a-z0-9']+)(?:#(\d+))?(@end)?([+-]\d*\.?\d+)?$/i.exec(String(ref).trim());
    if (!m) throw new Error('bad time ref: ' + ref);
    const want = norm(m[1]), nth = m[2] ? +m[2] : 1; let n = 0, hit = null;
    for (const w of WORDS) if (norm(w.w) === want && ++n === nth) { hit = w; break; }
    if (!hit) throw new Error('word not found in voiceover: ' + ref);
    return (m[3] ? hit.e : hit.s) + (m[4] ? parseFloat(m[4]) : 0);
  }
  const speaking = t => WORDS.some(w => t >= w.s && t <= w.e);

  const el = (cls, html, style = '', parent = stage) => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; d.style.cssText = style; parent.appendChild(d); return d; };
  const money = (v, mode) => {
    if (mode === 'usd2') return '$' + v.toFixed(2);
    if (mode === 'usdb') return '$' + (v / 1e9).toFixed(1) + 'B';
    if (mode === 'pct1') return v.toFixed(1) + '%';
    if (mode === 'pct0') return Math.round(v) + '%';
    if (mode === 'plain') return Math.round(v).toLocaleString('en-US');
    if (mode === 'short') { const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(a < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(a < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'K'; return String(Math.round(v)); }
    return Math.round(v).toLocaleString('en-US');
  };
  const interp = (keys, t) => { // keys: [[ref,val],...] resolved
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], eInOut((t - keys[i][0]) / Math.max(1e-6, keys[i + 1][0] - keys[i][0])));
    return keys[keys.length - 1][1];
  };
  const resolveKeys = ks => ks.map(k => [R(k[0]), k[1]]);

  // ---------- backgrounds ----------
  function hillPath(y0, amp, wl, phase, w = 1400) {
    let d = `M0 1920 L0 ${y0 + amp * Math.sin(phase)}`;
    for (let x = 20; x <= w; x += 20) d += ` L${x} ${(y0 + amp * Math.sin(x / wl + phase)).toFixed(1)}`;
    return d + ` L${w} 1920 Z`;
  }
  function buildBg(name) {
    const b = KIT.bgs[name]; if (!b) throw new Error('unknown bg ' + name);
    const wrap = el('bgl', '', 'position:absolute;inset:0;overflow:hidden');
    el('', '', `position:absolute;inset:0;background:linear-gradient(${b.angle ?? 165}deg,${b.stops.join(',')})`, wrap);
    const blobs = (b.blobs || []).map((o, i) => ({ o, i, d: el('', '', `position:absolute;left:0;top:0;width:${o.r * 2}px;height:${o.r * 2}px;border-radius:50%;background:radial-gradient(circle,${o.c} 0,transparent 68%);opacity:${o.o ?? .5}`, wrap) }));
    if (b.dots) el('', '', `position:absolute;inset:0;background-image:radial-gradient(${b.dots.c || '#fff'} 2.5px,transparent 3px);background-size:${b.dots.s || 44}px ${b.dots.s || 44}px;opacity:${b.dots.o ?? .1};-webkit-mask-image:linear-gradient(180deg,#000,transparent 75%)`, wrap);
    const hills = b.hills ? b.hills.colors.map((c, i) => {
      const d = el('', `<svg width="1400" height="1920" viewBox="0 0 1400 1920" style="display:block"><path d="${hillPath(b.hills.y + i * 46, 26 + i * 10, 150 + i * 70, i * 1.9)}" fill="${c}"/></svg>`, 'position:absolute;left:-160px;top:0', wrap); return { d, i }; }) : [];
    const rp = b.ripples ? Array.from({ length: b.ripples.n || 4 }, (_, i) => el('', '', `position:absolute;left:0;top:0;border-radius:50%;border:${b.ripples.w || 4}px solid ${b.ripples.c || '#fff'}`, wrap)) : [];
    wrap._anim = (t) => {
      rp.forEach((d, i) => { const n = rp.length, per = b.ripples.period || 6, f = ((t / per) + i / n) % 1, r = 120 + f * (b.ripples.max || 1100); d.style.width = d.style.height = r * 2 + 'px'; d.style.transform = `translate(${(b.ripples.x ?? 540) - r}px,${(b.ripples.y ?? 1000) - r}px)`; d.style.opacity = String((b.ripples.o ?? .22) * (1 - f) * Math.min(1, f * 6)); });
      blobs.forEach(({ o, i, d }) => d.style.transform = `translate(${o.x - o.r + Math.sin(t * (o.s || .3) + i * 2) * (o.dx || 60)}px,${o.y - o.r + Math.cos(t * (o.s || .3) * .8 + i) * (o.dy || 40)}px)`);
      hills.forEach(({ d, i }) => d.style.transform = `translateX(${Math.sin(t * (.25 + i * .12) + i) * (30 + i * 16)}px)`);
    };
    return wrap;
  }

  // ---------- items ----------
  const goldCss = () => `background:linear-gradient(${KIT.gold.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 8px 0 #3a1f08) drop-shadow(0 0 3px #3a1f08) drop-shadow(0 0 3px #3a1f08);font-weight:800;line-height:1;white-space:nowrap`;
  const chipCss = (bg, color, size, pad) => `display:inline-block;white-space:nowrap;font-weight:800;border:6px solid ${KIT.ink};box-shadow:0 10px 0 rgba(0,0,0,.28);text-transform:uppercase;letter-spacing:.5px;border-radius:30px;background:${bg};color:${color};font-size:${size}px;padding:${pad}`;
  const row = (y, extra = '') => { const d = el('it', '', `position:absolute;left:0;width:1080px;top:${y}px;display:flex;justify-content:center;transform-origin:50% 50%;will-change:transform,opacity;${extra}`); d.dataset.d = 'flex'; return d; };

  const MAKERS = {
    gold(it) {
      const w = row(it.y); const sp = document.createElement('div'); sp.style.cssText = `font-size:${it.size || 128}px;white-space:nowrap;display:flex;gap:${it.gap || 18}px;align-items:center`; sp.className = 'qa'; sp.dataset.kind = 'gold'; w.appendChild(sp);
      // gradient + outline live on each span: background-clip:text ignores a child's transform, so a per-part pop needs its own clip
      const parts = it.parts.map(p => { const s = document.createElement('span'); s.textContent = p.t; s.style.cssText = p.c ? `display:inline-block;font-weight:800;line-height:1;color:${p.c};filter:drop-shadow(0 8px 0 #3a1f08) drop-shadow(0 0 3px #3a1f08)` : `display:inline-block;${goldCss()}`; sp.appendChild(s); return { s, at: R(p.at) }; });
      parts.forEach(p => EV.push({ t: p.at, type: 'pop' }));
      return { el: w, base: it, update(t) { parts.forEach(p => { const k = pop(t, p.at, .45); p.s.style.transform = `scale(${k})`; p.s.style.opacity = clamp(k * 2); }); } };
    },
    chip(it) {
      const w = row(it.y); const c = document.createElement('div'); c.className = 'qa'; c.dataset.kind = 'chip'; c.style.cssText = chipCss(it.bg || '#fff', it.color || KIT.ink, it.size || 60, it.pad || '12px 40px') + (it.border ? `;border-color:${it.border}` : ''); w.appendChild(c);
      const parts = (it.parts || [{ t: it.text, at: it.at }]).map(p => ({ t: p.t, c: p.c, at: R(p.at === undefined ? it.at : p.at) }));
      parts.forEach((p, i) => EV.push({ t: p.at, type: i === 0 ? 'pop' : 'pop2' }));
      return { el: w, base: it, update(t) {
        const shown = parts.filter(p => t >= p.at);
        c.innerHTML = shown.map(p => `<span style="${p.c ? 'color:' + p.c : ''}">${p.t}</span>`).join(' ');
        const t0 = parts[0].at, lastIdx = shown.length - 1;
        let k = pop(t, t0, .35); if (lastIdx > 0) k *= 1 + .1 * Math.sin(clamp((t - shown[lastIdx].at) / .3) * Math.PI);
        w.style.transform = `scale(${k})`;
      } };
    },
    stamp(it) {
      const w = row(it.y, `transform:rotate(${it.rot ?? -6}deg)`); const c = document.createElement('div'); c.className = 'qa'; c.dataset.kind = 'stamp'; c.style.cssText = chipCss('#fff', it.color || '#e11d48', it.size || 64, '10px 36px') + `;border-color:${it.color || '#e11d48'}`; c.textContent = it.text; w.appendChild(c);
      const at = R(it.at); EV.push({ t: at, type: 'thud' }); (it.hit !== false) && HITS.push({ t: at, shake: it.shake ?? .35, flash: .35 });
      return { el: w, base: it, update(t) { const f = clamp((t - at) / .25); w.style.transform = `rotate(${it.rot ?? -6}deg) scale(${t < at ? 0 : 1 + (1 - eOut(f)) * 1.6})`; } };
    },
    banner(it) {
      const w = row(it.y); const c = document.createElement('div'); c.className = 'qa'; c.dataset.kind = 'banner'; c.style.cssText = chipCss('#fff', it.color || KIT.ink, it.size || 46, '12px 28px') + ';border-radius:16px;border-width:5px'; c.textContent = it.text; w.appendChild(c);
      const at = R(it.at); EV.push({ t: at, type: 'whoosh2' });
      return { el: w, base: it, update(t) { w.style.transform = `translateX(${(1 - eOut(clamp((t - at) / .4))) * 1200}px)`; } };
    },
    prop(it) {
      const mk = window.PROPS[it.id]; if (!mk) throw new Error('unknown prop ' + it.id);
      const p = mk(it.opts || {}); const w = el('it', p.svg, `position:absolute;left:0;top:0;width:${p.w}px;height:${p.h}px;transform-origin:0 0;will-change:transform,opacity`);
      const at = R(it.at), gray = it.grayAt ? R(it.grayAt) : null, pourA = it.armAt ? R(it.armAt) : null, pourB = it.armUntil ? R(it.armUntil) : 1e9;
      const mouth = w.querySelector('.mouth'), arm = w.querySelector('.arm');
      const qaEl = w.firstChild; qaEl.classList.add('qa'); qaEl.dataset.kind = 'prop';
      if (it.enter !== 'none') EV.push({ t: at, type: 'whoosh2' });
      return { el: w, base: it, update(t) {
        const d = it.enter === 'pop' ? .45 : .55; const k = it.enter === 'none' ? 1 : pop(t, at, d);
        const sc = it.scale ?? 1; let ox = 0, oy = 0, s = 1;
        const dist = it.dist || 600;
        if (it.enter === 'slide-left') ox = -(1 - k) * dist; else if (it.enter === 'slide-right') ox = (1 - k) * dist; else if (it.enter === 'rise') oy = (1 - k) * dist; else if (it.enter === 'drop') oy = -(1 - k) * dist; else if (it.enter !== 'none') s = k;
        oy += it.bob ? Math.sin(t * 3 + (it.phase || 0)) * 8 * it.bob : 0;
        const rot = it.rot ? it.rot + Math.sin(t * 2) * 3 : 0;
        w.style.transform = `translate(${it.x + ox}px,${it.y + oy}px) rotate(${rot}deg) scale(${sc * s}) translate(${-p.w / 2}px,${-p.h}px)`;
        w.style.opacity = t < at ? 0 : 1; qaEl.dataset.settled = (it.enter === 'none' || k >= .995) ? '1' : '0';
        if (mouth) mouth.setAttribute('d', (it.talk && speaking(t) && Math.sin(t * 22) > -.25) ? 'M-20 70 q20 26 40 0 q-20 -7 -40 0Z' : 'M-18 72 q18 12 36 0');
        if (arm) arm.style.transform = `rotate(${(t > pourA && t < pourB) ? Math.sin(t * 6) * 10 - 8 : Math.sin(t * 2) * 4}deg)`;
        if (gray !== null) { const g = clamp((t - gray) / .6); w.style.filter = `grayscale(${g * .85}) brightness(${1 - g * .25})`; }
      } };
    },
    coins(it) {
      const at = R(it.at), n = it.n || 9; const cs = Array.from({ length: n }, () => el('it', window.PROPS.coin().svg, 'position:absolute;left:0;top:0'));
      EV.push({ t: at, type: 'coin' }); EV.push({ t: at + .3, type: 'coin' });
      return { el: null, base: it, extra: cs, update(t) { cs.forEach((c, i) => { const f = clamp((t - (at + i * .09)) / .55); const x = it.x + Math.sin(i * 2.1) * 50, y = lerp(it.y0, it.y1, f * f); c.style.transform = `translate(${x}px,${y}px) rotate(${f * 360}deg)`; c.style.opacity = (f > 0 && f < 1) ? 1 : 0; }); } };
    },
    tug(it) { // two money counters + a split bar that shows who is winning
      const at = R(it.at); const w = el('it', '', `position:absolute;left:0;width:1080px;top:${it.y}px`);
      const side = (s, align) => `<div class="qa" data-kind="gold" style="position:absolute;${align}:50px;width:470px;text-align:${align};top:30px"><div style="display:inline-block;font-size:30px;font-weight:800;color:#fff;letter-spacing:1px;padding:2px 18px;border-radius:14px;border:5px solid ${KIT.ink};background:${s.color};margin-bottom:10px;box-shadow:0 6px 0 rgba(0,0,0,.28)">${s.label}</div><div class="v" style="${goldCss()};font-size:${it.size || 96}px">$0</div></div>`;
      w.innerHTML = side(it.left, 'left') + side(it.right, 'right') + `<div style="position:absolute;left:60px;width:960px;top:${it.barY || 190}px;height:46px;border-radius:23px;border:6px solid ${KIT.ink};background:${it.right.color || '#ffd21f'};overflow:hidden;box-shadow:0 10px 0 rgba(0,0,0,.28)"><div class="fill" style="height:100%;background:${it.left.color || '#ff5d73'}"></div></div>`;
      const lk = resolveKeys(it.left.keys), rk = resolveKeys(it.right.keys), vl = w.querySelectorAll('.v'), fill = w.querySelector('.fill');
      lk.concat(rk).forEach(k => EV.push({ t: k[0], type: 'tick' }));
      return { el: w, base: it, update(t) {
        const a = interp(lk, t), b = interp(rk, t); vl[0].textContent = '$' + money(a, it.fmt || 'short'); vl[1].textContent = '$' + money(b, it.fmt || 'short');
        fill.style.width = (a / (a + b) * 100) + '%'; const k = pop(t, at, .5); w.style.transform = `scale(${k})`; w.style.opacity = clamp(k * 2); w.style.transformOrigin = '50% 0';
      } };
    },
    source(it) { // small attribution pill for sourced figures; `estimate:true` adds an "ESTIMATE" tag. Keep inside the safe area (y <= 1560).
      const w = row(it.y ?? 1440); const c = document.createElement('div'); c.className = 'qa'; c.dataset.kind = 'source';
      c.style.cssText = `display:inline-block;white-space:nowrap;font-weight:600;font-size:${it.size || 30}px;color:#fff;background:rgba(10,14,24,.72);border:3px solid rgba(255,255,255,.55);border-radius:999px;padding:8px 26px`;
      c.innerHTML = (it.estimate ? `<b style="color:#ffd21f;margin-right:10px">ESTIMATE</b>` : '') + `Source: ${it.text}`; w.appendChild(c);
      const at = R(it.at); EV.push({ t: at, type: 'pop2' });
      return { el: w, base: it, update(t) { const k = pop(t, at, .3); w.style.transform = `translateY(${(1 - k) * 30}px) scale(${.9 + .1 * k})`; w.style.opacity = clamp(k * 2); } };
    },
    bars(it) { // growing share/metric bars: items:[{label,value,at,c?}], base (baseline y), h (max bar height), max, fmt
      const n = it.items.length, gap = it.gap ?? 26, bw = (960 - gap * (n - 1)) / n, base = it.base ?? 1200, H = it.h ?? 380, top = base - H - 80, max = it.max ?? Math.max(...it.items.map(x => x.value));
      const w = el('it', '', `position:absolute;left:0;top:${top}px;width:1080px;height:${H + 80}px`); w.classList.add('qa'); w.dataset.kind = 'bars';
      const bs = it.items.map((x, i) => { const at = R(x.at), c = x.c || (i === n - 1 ? (it.accent || '#ff7a5c') : (it.color || '#9bb4d8'));
        const b = document.createElement('div'); b.style.cssText = `position:absolute;left:${60 + i * (bw + gap)}px;width:${bw}px;bottom:0;border:6px solid ${KIT.ink};border-radius:18px 18px 6px 6px;background:${c};box-shadow:0 10px 0 rgba(0,0,0,.28);display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;box-sizing:border-box`;
        b.innerHTML = `<span style="font-weight:800;font-size:${it.labelSize || 30}px;color:${KIT.ink};white-space:nowrap">${x.label}</span>`;
        const v = document.createElement('div'); v.style.cssText = `position:absolute;left:${60 + i * (bw + gap) - 20}px;width:${bw + 40}px;text-align:center;${goldCss()};font-size:${it.valueSize || 52}px`; w.appendChild(b); w.appendChild(v); EV.push({ t: at, type: 'pop' }); return { b, v, at, val: x.value }; });
      return { el: w, base: it, update(t) { bs.forEach(o => { const g = eOut(clamp((t - o.at) / .7)), h = Math.max(0, o.val / max * H * g); o.b.style.height = h + 'px'; o.b.style.opacity = g > 0 ? 1 : 0; o.v.style.bottom = (h + 10) + 'px'; o.v.style.opacity = g > .15 ? 1 : 0; o.v.textContent = money(o.val * g, it.fmt || 'pct1'); }); } };
    },
    hit(it) { HITS.push({ t: R(it.at), shake: it.shake ?? .3, flash: it.flash ?? .3 }); EV.push({ t: R(it.at), type: 'thud' }); return null; }
  };
  let HITS = [];

  // ---------- captions ----------
  function buildCaptions() {
    const n = KIT.caption.words || 3; let cur = [];
    const maxCh = KIT.caption.maxChars || 21; // keep every caption pill inside the frame at the caption font size
    for (const w of WORDS) { if (cur.length && cur.map(x => x.w).join(' ').length + 1 + w.w.length > maxCh) { CH.push(cur); cur = []; } cur.push(w); if (cur.length >= n || /[.,!?]$/.test(w.w)) { CH.push(cur); cur = []; } }
    if (cur.length) CH.push(cur);
  }
  function setCaption(t) {
    let c = null; for (const ch of CH) if (t >= ch[0].s - .04 && t <= ch[ch.length - 1].e + .45) c = ch;
    if (!c) { capEl.innerHTML = ''; return; }
    const act = c.findIndex(w => t >= w.s && t < w.e + .05), a = act < 0 ? (t > c[c.length - 1].e ? c.length - 1 : 0) : act;
    const k = .92 + .08 * eOut(clamp((t - c[0].s + .04) / .18));
    capEl.innerHTML = `<div class="qa" data-kind="caption" style="padding:16px 54px;border-radius:44px;background:${KIT.caption.bg};font-weight:600;font-size:${KIT.caption.size}px;color:#fff;white-space:nowrap;transform:scale(${k})">${c.map((w, i) => i === a ? `<span style="color:${KIT.caption.hl}">${w.w}</span>` : w.w).join(' ')}</div>`;
  }

  // ---------- init + render ----------
  window.init = async (spec, words) => {
    S = spec; WORDS = words; KIT = deepMerge(DEFAULT_KIT, spec.kit || {});
    stage = document.getElementById('stage'); stage.innerHTML = '';
    stage.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><defs>${window.PROPS.defs}</defs></svg>`);
    ACTS = S.acts.map((a, i) => ({ ...a, start: i === 0 ? 0 : R(a.from), bgEl: null, i }));
    ACTS.forEach((a, i) => { const tr = typeof a.transition === 'string' ? { type: a.transition } : (a.transition || (KIT.transition ? (typeof KIT.transition === 'string' ? { type: KIT.transition } : KIT.transition) : { type: 'wipe-up' })); a.tr = Object.assign({ type: 'wipe-up' }, tr); a.wipeLead = a.tr.type === 'cut' ? 0 : (a.tr.lead ?? a.wipe ?? .28);
      if (i > 0 && a.tr.type === 'cut') HITS.push({ t: a.start, shake: .25, flash: .5 }); a.wipeAt = i === 0 ? -1 : a.start - a.wipeLead; a.next = ACTS[i + 1]; a.bgEl = buildBg(a.bg); if (i > 0) EV.push({ t: a.wipeAt + .05, type: a.tr.type === 'cut' ? 'thud' : (a.tr.type === 'shutters' ? 'whoosh2' : 'whoosh') }); });
    S.items.forEach(it => {
      const act = ACTS.find(a => a.id === it.act); if (!act) throw new Error('item act not found: ' + it.act);
      const mk = MAKERS[it.type]; if (!mk) throw new Error('unknown item type ' + it.type);
      const o = mk(it); if (o) { if (it.until !== undefined) o.untilT = R(it.until); o.act = act; o.last = it.to ? ACTS.find(a => a.id === it.to) : act; if (!o.last) throw new Error('item to-act not found: ' + it.to); ITEMS.push(o); }
    });
    // title chips per act + counter + rail
    ACTS.forEach(a => { if (a.title) { const t = a.title; const w = row(t.y ?? 362); const c = document.createElement('div'); c.className = 'qa'; c.dataset.kind = 'chip'; c.style.cssText = chipCss(t.bg || '#ff5d73', '#fff', 46, '12px 38px'); c.textContent = t.text; w.appendChild(c); const at = R(t.at ?? a.from); EV.push({ t: at, type: 'pop' }); ITEMS.push({ el: w, act: a, base: { type: 'title' }, update(tt) { w.style.transform = `scale(${pop(tt, at, .4)})`; } }); } });
    if (S.counter) { const cn = S.counter; counterEl = el('cnt qa', '', `position:absolute;left:0;width:1080px;top:${cn.y ?? 150}px;text-align:center;font-size:${cn.size ?? 150}px;${goldCss()}`); counterEl.dataset.kind = 'counter'; cn._keys = resolveKeys(cn.keys); cn._until = cn.until !== undefined ? R(cn.until) : null; cn._from = cn.from !== undefined ? R(cn.from) : null; cn._at = R(cn.at ?? cn.keys[0][0] - .0); cn._at = ACTS.find(a => a.id === cn.act) ? ACTS.find(a => a.id === cn.act).start + .35 : cn._at; if (cn._from !== null) cn._at = cn._from; cn._keys.forEach((k, i) => i && k[1] !== cn._keys[i - 1][1] && EV.push({ t: k[0], type: 'tick' })); }
    if (KIT.rail) railEl = el('rail', KIT.rail.map(r => `<div style="flex:1;border-radius:40px 40px 0 0;border:5px solid ${KIT.ink};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:30px;color:#fff;background:${r.color}">${r.label}</div>`).join(''), 'position:absolute;left:0;right:0;bottom:' + (KIT.railBottom ?? 70) + 'px;height:80px;display:flex;gap:10px;padding:0 30px');
    capEl = el('cap', '', `position:absolute;left:0;right:0;top:${KIT.caption.y}px;display:flex;justify-content:center`);
    buildCaptions();
    flashEl = el('', '', 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9999');
    window.DURATION = WORDS[WORDS.length - 1].e + (S.tail ?? .7);
    window.EV = EV.sort((a, b) => a.t - b.t); window.WORDS = WORDS;
    await document.fonts.ready; renderAt(0);
  };

  function renderAt(t) {
    // shake / flash
    let sh = 0, fl = 0; for (const h of HITS) if (t > h.t && t < h.t + h.shake) sh += Math.sin(t * 90) * 14 * (1 - (t - h.t) / h.shake); for (const h of HITS) if (t > h.t && t < h.t + .12) fl = h.flash;
    stage.style.transform = `translate(${sh}px,${sh * .5}px)`;
    // backgrounds: each act's layer wipes in from the bottom
    ACTS.forEach(a => {
      a.bgEl._anim(t); const b = a.bgEl.style; if (a.i === 0) { b.clipPath = 'none'; b.zIndex = 0; return; }
      b.zIndex = a.i; b.transform = 'none'; b.opacity = '1'; b.clipPath = 'none'; b.webkitMaskImage = 'none';
      const type = a.tr.type, p = type === 'cut' ? (t >= a.start ? 1 : 0) : eInOut(clamp((t - a.wipeAt) / (a.wipeLead + .14)));
      if (p >= 1) return;
      const q = (1 - p) * 100;
      if (type === 'wipe-up') b.clipPath = `inset(${q}% 0 0 0)`;
      else if (type === 'wipe-down') b.clipPath = `inset(0 0 ${q}% 0)`;
      else if (type === 'wipe-left') b.clipPath = `inset(0 0 0 ${q}%)`;
      else if (type === 'wipe-right') b.clipPath = `inset(0 ${q}% 0 0)`;
      else if (type === 'iris') b.clipPath = `circle(${p * 1700}px at ${a.tr.x ?? 540}px ${a.tr.y ?? 960}px)`;
      else if (type === 'diagonal') { const sw = p * 150 - 25; b.clipPath = `polygon(0 0, ${sw + 25}% 0, ${sw - 25}% 100%, 0 100%)`; }
      else if (type === 'shutters') { const n = a.tr.bars || 160; b.webkitMaskImage = `linear-gradient(#000 ${p * 100}%, transparent ${p * 100}%)`; b.webkitMaskSize = `100% ${n}px`; }
      else if (type === 'push') b.transform = `translateX(${q}%)`;
      else if (type === 'zoom') { b.opacity = String(clamp(p * 1.6)); b.transform = `scale(${lerp(1.5, 1, p)})`; }
      else if (type === 'cut') b.opacity = '0';
      else throw new Error('unknown transition ' + type);
    });
    // items
    ITEMS.forEach(o => {
      const a = o.act, nxt = (o.last || o.act).next; const nw = nxt ? nxt.wipeAt : 1e9;
      const out = 1 - eInOut(clamp((t - (nw - .1)) / .3)); const gone = nxt && t > nw + .5;
      const uf = o.untilT === undefined ? 1 : 1 - clamp((t - o.untilT) / .25); const ugone = o.untilT !== undefined && t > o.untilT + .3;
      if (gone || ugone || t < (a.start - a.wipeLead * 0.4)) { if (o.el) o.el.style.display = 'none'; if (o.extra) o.extra.forEach(c => c.style.opacity = 0); return; }
      if (o.el) { o.el.style.display = o.el.dataset.d || ''; }
      if (o.el && o.base.type !== 'prop') o.el.style.opacity = '';
      o.update(t);
      const fade = Math.min(out, uf);
      if (o.el && fade < 1) o.el.style.opacity = Math.min(o.el.style.opacity === '' ? 1 : parseFloat(o.el.style.opacity), fade);
    });
    // counter
    if (counterEl) { const cn = S.counter; const v = interp(cn._keys, t); counterEl.textContent = (cn.prefix ?? '$') + money(v, cn.fmt || 'full'); const k = pop(t, cn._at, .5); counterEl.style.transform = `scale(${k})`; counterEl.style.opacity = clamp(k * 2) * (cn._until === null ? 1 : 1 - clamp((t - cn._until) / .3)); }
    // rail
    if (railEl) { const act = [...ACTS].reverse().find(a => t >= a.start - 0.1) || ACTS[0]; const idx = act.rail; const r = (idx === undefined || idx === null) ? 0 : clamp((t - (act.start + .3)) / .3); railEl.style.opacity = r; railEl.style.transform = `translateY(${(1 - r) * 80}px)`; [...railEl.children].forEach((c, i) => c.style.opacity = i === idx ? 1 : .45); }
    setCaption(t);
    flashEl.style.opacity = fl;
  }
  window.renderAt = renderAt;

  // QA: visible text/prop rects at time t (used by scripts/qa.mjs)
  window.qa = (t) => {
    renderAt(t); const out = [];
    stage.querySelectorAll('.qa').forEach(n => {
      let e = n, vis = true, op = 1; while (e && e !== stage) { const cs = getComputedStyle(e); if (cs.display === 'none') { vis = false; break; } op *= parseFloat(cs.opacity); e = e.parentElement; }
      if (!vis || op < .6) return;
      let r;
      if (n.dataset.kind === 'prop') { const g = n.querySelector('g'); r = (g || n).getBoundingClientRect(); }
      else if (n.dataset.kind === 'counter') { const rg = document.createRange(); rg.selectNodeContents(n); r = rg.getBoundingClientRect(); }
      else r = n.getBoundingClientRect();
      if (r.width < 2) return;
      // settled = finished animating: scale ~1 and no slide offset (props report their own flag)
      let settled = true;
      if (n.dataset.kind === 'prop') settled = n.dataset.settled !== '0';
      else { let e2 = n; while (e2 && e2 !== stage) { const tr = getComputedStyle(e2).transform; if (tr && tr !== 'none') { const m = tr.match(/matrix\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(Number); if (Math.abs(Math.hypot(v[0], v[1]) - 1) > .03 || Math.hypot(v[4], v[5]) > 2) settled = false; } } e2 = e2.parentElement; } }
      out.push({ kind: n.dataset.kind, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, text: (n.textContent || '').trim().slice(0, 40), settled });
    });
    return out;
  };
})();
