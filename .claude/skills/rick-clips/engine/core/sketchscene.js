// 2.5D sketchbook renderer: plane stacks (sketchsets.js) + live cast + a multiplane camera (sketchcams.js). Needs a 2D canvas (browser).
import { SKETCH_SETS } from './sketchsets.js';
import { sketchCam } from './sketchcams.js';
import { layerTransform, depthBlur } from './layers.js';
import { drawCharacter, CAST, POSES, FACES } from './cast.js';
import { paperCanvas, rng } from './sketch.js';
import { fbm } from './camnoise.js';
import { layout } from './sketchlayout.js';
import { SKETCH_LOOKS } from './sketchlooks.js';

const clamp01 = x => Math.min(1, Math.max(0, x)), ss = x => x * x * (3 - 2 * x);
const back = t => { t = clamp01(t) - 1; return 1 + t * t * (2.8 * t + 1.8); };
const lerpObj = (a, b, k) => Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * k]));
const FACE_OF = { flat: 'neutral', smug: 'smug', shock: 'shock', joy: 'joy' }, POSE_OF = { smug: 'proud', joy: 'wave' };

export function createRenderer(W, H, shots = [], words = []) {
  const M = Math.round(W * 0.35), cache = new Map(), size = { W, H };
  const mk = () => Object.assign(document.createElement('canvas'), { width: W + 2 * M, height: H + 2 * M });
  const planesFor = name => {
    if (!cache.has(name)) cache.set(name, SKETCH_SETS[name].map(p => { if (p.figures || p.live) return { ...p, canvas: mk() }; const c = mk(), g = c.getContext('2d'); g.translate(M, M); p.draw(g, W, H); return { ...p, canvas: c }; }));
    return cache.get(name);
  };
  // when a cast member first appeared in the current continuous scene (same set, consecutive shots), so entrances happen once, not per cut
  const appearT = (shot, who) => {
    let i = shots.findIndex(x => x.id === shot.id), t0 = shot.t0;
    while (i > 0 && shots[i - 1].set === shot.set && shots[i - 1].cast.includes(who)) { i--; t0 = shots[i].t0; }
    return t0;
  };
  const firstAppear = set => { const f = shots.find(x => x.set === set); return f ? f.t0 : 0; };
  const layoutOf = shot => layout(shot, W, H, who => appearT(shot, who));
  const speaking = t => words.some(w => t >= w.start && t < w.end);
  const walkX = (f, t) => f.pop === undefined ? f.x : f.x + (1 - ss(clamp01((t - f.pop) / 0.9))) * (f.x < W / 2 ? -1 : 1) * W * 0.55;
  const subjectOf = (fs, shot, t = shot.t0) => {   // what the camera aims at: an insert target (look=) or the lead of the cast, where they are NOW
    const L = shot && shot.look && SKETCH_LOOKS[shot.set] && SKETCH_LOOKS[shot.set][shot.look];
    if (L) return { u: L.x * W - W / 2, v: L.y * H - H / 2, depth: L.depth };
    const f = fs.find(x => x.lead) || fs[0];
    return f ? { u: walkX(f, t) - W / 2, v: f.y - 1.43 * f.s * CAST[f.who].height - H / 2, depth: 0.65 } : { u: 0, v: -0.1 * H, depth: 0.65 };
  };


  function camFor(shot, t) {
    const c = sketchCam(shot.cam, { t0: shot.t0, t1: shot.t1, subject: tt => subjectOf(layoutOf(shot), shot, tt), size, frame: shot.frame || 'center' })(t);
    const k = Math.min(W, H / 1.78) / 1080, dt = Math.max(0, t - shot.t0), jolt = (shot.transition === 'cut' ? 1 : 0.35) * Math.exp(-dt * 8);
    // handheld operator: aperiodic noise (never a sine), a breathing zoom, and a small impact jolt that decays after each cut
    return { ...c, x: c.x + k * (20 * fbm(t * 1.3, 11) + 24 * jolt * Math.sin(dt * 48)), y: c.y + k * (14 * fbm(t * 1.5, 12) + 16 * jolt * Math.cos(dt * 41)),
      roll: c.roll + 0.011 * fbm(t * 1.1, 13) + 0.008 * jolt * Math.sin(dt * 37), zoom: c.zoom * (1 + 0.015 * fbm(t * 0.8, 14)) };
  }
  /** Where the subject's head lands on screen (used as the ink-bleed origin). */
  function subjectScreen(shot, t) {
    const cam = camFor(shot, t), s = subjectOf(layoutOf(shot), shot, t), tr = layerTransform(s.depth, cam);
    return { x: W / 2 + tr.dx + tr.scale * s.u, y: H / 2 + tr.dy + tr.scale * s.v };
  }
  function drawFigures(canvas, shot, t) {
    const g = canvas.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); g.translate(M, M);
    layoutOf(shot).forEach((f, i) => {
      const k = ss(clamp01((t - shot.t0) / 0.5));
      const e = f.pop === undefined ? 1 : ss(clamp01((t - f.pop) / 0.9)), walking = e < 1, dir = f.x < W / 2 ? -1 : 1;   // neighbours walk in from the sides
      if (f.pop !== undefined && t < f.pop) return;
      const pose = lerpObj(POSES.idle, POSES[POSE_OF[shot.face] || 'idle'], k), blink = ((t / 3.1) + i * 0.37) % 1 < 0.045;
      const talk = f.lead && speaking(t) && Math.sin(t * 22 + i) > 0 ? { open: 0.8 } : {};   // lip flap on the spoken words
      const face = { ...lerpObj(FACES.neutral, FACES[FACE_OF[shot.face] || 'neutral'], k), ...(blink ? { lid: 1, wide: 0 } : {}), ...talk };
      pose.bob = walking ? Math.abs(Math.sin(t * 11 + i)) * 0.035 : 0.014 * Math.sin(t * 2.3 + i);
      pose.step = walking ? Math.sin(t * 11 + i) : 0;
      pose.armL += 0.1 * Math.sin(t * 1.7 + i); pose.armR += 0.1 * Math.sin(t * 1.5 + i * 2 + 1);
      drawCharacter(g, f.who, { x: walkX(f, t), y: f.y, s: f.s, pose, face, turn: 0.3 * Math.sin(t * 1.1 + i * 2), seed: 3 + i });
    });
  }
  /** Draw one shot at time t onto context c. */
  function drawShot(c, shot, t) {
    const cam = camFor(shot, t), blurMax = 14 * (Math.min(W, H / 1.78) / 1080);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.drawImage(paperCanvas(W, H), 0, 0);
    for (const p of planesFor(shot.set)) {
      if (p.figures) drawFigures(p.canvas, shot, t);
      else if (p.live) { const lg = p.canvas.getContext('2d'); lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, p.canvas.width, p.canvas.height); lg.translate(M, M); p.live(lg, W, H, t, { t0: firstAppear(shot.set) }); }   // live layers can count from when their scene first appears
      const { dx, dy, scale } = layerTransform(p.depth, cam);
      const blur = depthBlur(p.depth, cam.focus, blurMax) + (cam.blur || 0) * (blurMax / 14);   // whip pans add motion blur
      // skip the costly blur filter when it would be invisible
      c.save(); c.filter = blur < 0.3 ? 'none' : `blur(${blur.toFixed(1)}px)`;
      c.translate(W / 2 + dx, H / 2 + dy); c.rotate(cam.roll || 0); c.scale(scale, scale); c.drawImage(p.canvas, -W / 2 - M, -H / 2 - M); c.restore();
    }
    c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.3; c.drawImage(paperCanvas(W, H), 0, 0); c.restore();   // paper grain over everything
    finish(c, shot, t);
  }
  // ---- film finish: per-scene colour grade, bloom, vignette, grain ----
  const GRADE = { shopfront: ['#2a3a8a', 0.22], bakery: ['#ff9a4a', 0.12], bench: ['#ff9a4a', 0.1], desk: ['#ffb870', 0.1], clock: ['#ff8a5a', 0.14], calendar: ['#5a6ab0', 0.14], queue: ['#ffb070', 0.12], promise: ['#ff7a3a', 0.16], talk: ['#4a4a9a', 0.16], finale: ['#ffd890', 0.14], street: ['#3a4a9a', 0.18] };
  const mkc = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const bloom = mkc(Math.round(W / 4), Math.round(H / 4)), bg = bloom.getContext('2d');
  const vignette = (() => { const v = mkc(W, H), g = v.getContext('2d'), q = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); q.addColorStop(0, 'rgba(0,0,0,0)'); q.addColorStop(1, 'rgba(20,10,5,0.42)'); g.fillStyle = q; g.fillRect(0, 0, W, H); return v; })();
  const grain = (() => { const n = mkc(Math.round(W / 2), Math.round(H / 2)), g = n.getContext('2d'), r = rng(5), im = g.createImageData(n.width, n.height); for (let i = 0; i < im.data.length; i += 4) { const v = 110 + r() * 70; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); return n; })();
  function finish(c, shot, t) {
    const G = GRADE[shot.set];
    if (G) { c.save(); c.globalCompositeOperation = 'soft-light'; c.globalAlpha = G[1] * 0.7; c.fillStyle = G[0]; c.fillRect(0, 0, W, H); c.restore(); }
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, bloom.width, bloom.height); bg.filter = 'none'; bg.drawImage(c.canvas, 0, 0, bloom.width, bloom.height);
    bg.globalCompositeOperation = 'multiply'; bg.fillStyle = '#c8c8c8'; bg.fillRect(0, 0, bloom.width, bloom.height); bg.globalCompositeOperation = 'source-over';   // keep only the bright parts
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.22; c.filter = `blur(${Math.round(8 * W / 1080)}px) brightness(1.6)`; c.drawImage(bloom, 0, 0, W, H); c.restore();
    c.save(); c.globalAlpha = 1; c.drawImage(vignette, 0, 0); c.restore();
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.1; const f = Math.floor(t * 24); c.drawImage(grain, -((f * 37) % 40), -((f * 53) % 40), W + 40, H + 40); c.restore();   // grain shifts every frame
  }
  return { drawShot, subjectScreen };
}
