// Story scenes for the sketch style: each idea in a narration gets its own place. Planes back to front; `live` planes animate per frame;
// `figures: true` marks where the cast stands. Looks (insert targets) for each scene are in sketchlooks.js.
import { pencil, shape, curvePts, ellipsePts, rectPts } from './sketch.js';
import { U, hh, glow, motes, fillAll } from './sketchkit.js';
import { house, streetLamp, tree, breadShelf, oven, windowObj, counter, rollingPin, loaf, flourSack, basket, mug } from './props.js';
import { shopFront, wallClock, calendarPage, wrappedLoaf, recipeCard, seal, bubble, bowl, jar, hand } from './props2.js';

const sky = (g, W, H, top, bot) => { const q = g.createLinearGradient(0, -H * 0.3, 0, H * 0.75); q.addColorStop(0, top); q.addColorStop(1, bot); g.fillStyle = q; g.fillRect(-W * 0.4, -H * 0.4, W * 1.8, H * 1.8); };
const ground = (g, W, H, y, color) => { shape(g, rectPts(-W * 0.4, H * y, W * 1.8, H * 0.7), { fill: color, line: { width: 3, seed: 70 }, seed: 70 }); };
const wall = (g, W, H, color, lines = true) => { fillAll(g, W, H, color); if (lines) for (let y = -H * 0.3; y < H * 1.3; y += 70) { g.strokeStyle = 'rgba(58,52,47,.2)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-W * 0.4, y); g.lineTo(W * 1.4, y); g.stroke(); } };
const stars = (g, W, H, t, n = 14) => { const u = U(W, H); for (let i = 0; i < n; i++) { const x = W * (hh(i) * 1.3 - 0.15), y = H * hh(i + 40) * 0.4, a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7)); pencil(g, [[x - 7 * u / 1080, y], [x + 7 * u / 1080, y], [x, y - 7 * u / 1080], [x, y + 7 * u / 1080]], { width: 2, color: '#ffe9a8', passes: 1, alpha: a, seed: i }); } };
const bunt = (g, W, H) => { const k = U(W, H) / 1080; pencil(g, curvePts([[-W * 0.4, H * 0.02], [W * 0.5, H * 0.07], [W * 1.4, H * 0.02]]), { width: 4, seed: 14 }); for (let i = 0; i < 7; i++) { const x = W * (0.05 + i * 0.15), y = H * (0.03 + 0.04 * Math.sin(i * 0.9 + 0.5)); shape(g, [[x - 38 * k, y], [x + 38 * k, y], [x, y + 90 * k], [x - 38 * k, y]], { fill: ['#d9453d', '#e8b923', '#2f8f8a'][i % 3], line: { width: 3, seed: 20 + i }, seed: 20 + i }); } };
const sway = (g, W, H, t) => { void g; void W; void H; void t; };
void sway;

export const SKETCH_SETS_MORE = {
  shopfront: [   // the shop at night, closed, before anyone knows it
    { depth: 0, draw: (g, W, H) => sky(g, W, H, '#232f56', '#566591') },
    { depth: 0.04, live: (g, W, H, t) => stars(g, W, H, t) },
    { depth: 0.3, draw: (g, W, H) => { const u = U(W, H); house(g, W * 0.04, H * 0.7, u * 0.09, 81, '#7f9ab5'); house(g, W * 0.96, H * 0.7, u * 0.1, 82, '#a98ab0'); } },
    { depth: 0.5, draw: (g, W, H) => ground(g, W, H, 0.7, '#5c627c') },
    { depth: 0.58, draw: (g, W, H) => shopFront(g, W * 0.5, H * 0.74, U(W, H) * 0.3, 83, { text: "ROSA'S", lit: false }) },
    { depth: 0.65, figures: true },
    { depth: 0.9, draw: (g, W, H) => { streetLamp(g, W * 0.1, H * 0.96, U(W, H) * 0.14, 84); } },
    { depth: 1.15, live: (g, W, H, t) => motes(g, W, H, t, 10, '#ffe9a8', 0.6) },
  ],
  bench: [   // identical loaves in rows: "every loaf, exactly the same"
    { depth: 0, draw: (g, W, H) => { wall(g, W, H, '#9a6246'); windowObj(g, W * 0.5, H * 0.46, U(W, H) * 0.42, 91); } },
    { depth: 0.35, draw: (g, W, H) => { const u = U(W, H); breadShelf(g, W * 0.16, H * 0.7, u * 0.18, 92); for (let i = 0; i < 4; i++) pencil(g, [[W * (0.7 + i * 0.06), H * 0.18], [W * (0.7 + i * 0.06), H * 0.3]], { width: 3, seed: 95 + i }); } },
    { depth: 0.65, figures: true },
    { depth: 0.75, draw: (g, W, H) => { const u = U(W, H); counter(g, W * 0.5, H * 0.9, u * 0.34, 93, Math.max(3.4, W / (u * 0.34) * 1.05));
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) loaf(g, W * (0.06 + i * 0.105) + r * 14, H * (0.7 + r * 0.034), u * (0.5 + r * 0.13), 96); rollingPin(g, W * 0.84, H * 0.67, u * 0.34, 97); } },
    { depth: 1.1, live: (g, W, H, t) => motes(g, W, H, t, 22, '#fff4d6', 1.4) },
  ],
  desk: [   // recipe card, wrapper, twine: "same recipe, same wrapper"
    { depth: 0, draw: (g, W, H) => { wall(g, W, H, '#b9895a', false); shape(g, rectPts(W * 0.05, H * 0.08, W * 0.9, H * 0.55), { fill: '#c9a46a', line: { width: 5, seed: 101 }, hatchOpts: { gap: 7, alpha: 0.12 }, seed: 101 }); } },
    { depth: 0.3, draw: (g, W, H) => { const u = U(W, H); recipeCard(g, W * 0.3, H * 0.33, u * 0.7, 102); recipeCard(g, W * 0.72, H * 0.3, u * 0.45, 103); } },
    { depth: 0.65, figures: true },
    { depth: 0.8, draw: (g, W, H) => { const u = U(W, H); shape(g, rectPts(-W * 0.2, H * 0.76, W * 1.4, H * 0.4), { fill: '#a9744f', line: { width: 3.4, seed: 104 }, seed: 104 }); for (let i = 0; i < 4; i++) wrappedLoaf(g, W * (0.2 + i * 0.2), H * 0.84, u * 0.62, 105); jar(g, W * 0.9, H * 0.76, u * 0.5, 106); bowl(g, W * 0.06, H * 0.78, u * 0.5, 107); } },
    { depth: 1.1, live: (g, W, H, t) => motes(g, W, H, t, 14, '#fff4d6', 0.9) },
  ],
  clock: [   // five in the morning: the clock, the dark window turning to dawn
    { depth: 0, draw: (g, W, H) => { wall(g, W, H, '#8a5a45'); } },
    { depth: 0.05, live: (g, W, H, t, info = { t0: 0 }) => { const q = g.createLinearGradient(0, H * 0.3, 0, H * 0.62), k = Math.min(1, Math.max(0, (t - info.t0) / 8)); q.addColorStop(0, `rgb(${40 + 60 * k},${50 + 40 * k},${100 - 20 * k})`); q.addColorStop(1, `rgb(${200 + 40 * k},${120 + 40 * k},${70 + 30 * k})`); g.fillStyle = q; g.fillRect(W * 0.1, H * 0.3, W * 0.34, H * 0.32); pencil(g, [[W * 0.1, H * 0.3], [W * 0.44, H * 0.3], [W * 0.44, H * 0.62], [W * 0.1, H * 0.62], [W * 0.1, H * 0.3]], { width: 6, seed: 111 }); pencil(g, [[W * 0.27, H * 0.3], [W * 0.27, H * 0.62]], { width: 4, seed: 112 }); } },
    { depth: 0.2, draw: (g, W, H) => { wallClock(g, W * 0.72, H * 0.24, U(W, H) * 0.4, 113, 5, 0); } },
    { depth: 0.36, live: (g, W, H, t) => glow(g, W * 0.88, H * 0.7, U(W, H) * 0.5, '255,150,40', 0.3 + 0.18 * Math.sin(t * 7) * Math.sin(t * 3.1)) },
    { depth: 0.4, draw: (g, W, H) => { oven(g, W * 0.88, H * 0.76, U(W, H) * 0.3, 114); } },
    { depth: 0.65, figures: true },
    { depth: 0.8, draw: (g, W, H) => { const u = U(W, H); counter(g, W * 0.5, H * 0.92, u * 0.34, 115, Math.max(3.4, W / (u * 0.34) * 1.05)); bowl(g, W * 0.3, H * 0.915 - u * 0.34, u * 0.7, 116); flourSack(g, W * 0.88, H * 0.915 - u * 0.34, u * 0.5, 117); } },
    { depth: 1.1, live: (g, W, H, t) => motes(g, W, H, t, 18, '#fff4d6', 1.0) },
  ],
  calendar: [   // weeks passing, nobody coming
    { depth: 0, draw: (g, W, H) => { wall(g, W, H, '#6f7aa3', false); } },
    { depth: 0.05, live: (g, W, H, t) => stars(g, W, H, t, 10) },
    { depth: 0.3, draw: (g, W, H) => { windowObj(g, W * 0.82, H * 0.3, U(W, H) * 0.5, 121); } },
    { depth: 0.55, live: (g, W, H, t, info = { t0: 0 }) => { const u = U(W, H); calendarPage(g, W * 0.38, H * 0.45, u * 0.46, 122, Math.min(42, Math.max(0, Math.floor((t - info.t0) * 9)))); } },   // days are crossed off from the moment the calendar first appears
    { depth: 0.65, figures: true },
    { depth: 0.9, draw: (g, W, H) => { ground(g, W, H, 0.92, '#4a5072'); } },
    { depth: 1.1, live: (g, W, H, t) => motes(g, W, H, t, 8, '#e8e2ff', 0.5) },
  ],
  queue: [   // week six: the line down the street
    { depth: 0, draw: (g, W, H) => sky(g, W, H, '#3d5b92', '#f0b97a') },
    { depth: 0.1, live: (g, W, H, t) => { const u = U(W, H); for (let i = 0; i < 4; i++) { const x = ((hh(i) * 1.4 + t * 0.012 * (1 + i * 0.4)) % 1.4 - 0.2) * W, y = H * (0.1 + 0.15 * hh(i + 11)); g.fillStyle = 'rgba(255,245,235,0.6)'; for (const [dx, dy, r] of [[0, 0, 0.07], [0.06, 0.01, 0.055], [-0.06, 0.012, 0.05]]) { g.beginPath(); g.ellipse(x + dx * u, y + dy * u, r * u * 1.3, r * u * 0.8, 0, 0, 6.2832); g.fill(); } } } },
    { depth: 0.25, draw: (g, W, H) => { const u = U(W, H), tints = ['#b9776a', '#7f9ab5', '#c9a35e', '#8aa57d', '#a98ab0']; for (let i = 0; i < 6; i++) house(g, W * (0.46 + i * 0.12), H * 0.56, u * (0.05 + (i % 2) * 0.01), 131 + i, tints[i % 5]); } },
    { depth: 0.45, draw: (g, W, H) => { ground(g, W, H, 0.56, '#7a7f99'); shopFront(g, W * 0.12, H * 0.7, U(W, H) * 0.24, 132, { text: "ROSA'S", lit: true }); } },
    { depth: 0.65, figures: true },
    { depth: 0.9, draw: (g, W, H) => { streetLamp(g, W * 0.94, H * 0.97, U(W, H) * 0.14, 133); } },
  ],
  promise: [   // the promise itself: a wrapped loaf and a glowing seal
    { depth: 0, live: (g, W, H) => { const q = g.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, H * 0.75); q.addColorStop(0, '#5a3322'); q.addColorStop(1, '#1d1210'); g.fillStyle = q; g.fillRect(-W * 0.4, -H * 0.4, W * 1.8, H * 1.8); } },
    { depth: 0.3, live: (g, W, H, t) => glow(g, W * 0.5, H * 0.52, U(W, H) * (0.9 + 0.08 * Math.sin(t * 2)), '255,190,90', 0.35) },
    { depth: 0.6, draw: (g, W, H) => { const u = U(W, H); shape(g, curvePts([[W * 0.22, H * 0.82], [W * 0.78, H * 0.82], [W * 0.7, H * 0.72], [W * 0.3, H * 0.72]], { closed: true }), { fill: '#7a5a3f', line: { width: 4, seed: 141 }, seed: 141 }); wrappedLoaf(g, W * 0.5, H * 0.73, u * 1.2, 142); } },
    { depth: 0.65, figures: true },
    { depth: 0.8, live: (g, W, H, t) => seal(g, W * 0.5, H * 0.42, U(W, H) * 0.7, 143, Math.sin(t * 3)) },
    { depth: 1.1, live: (g, W, H, t) => { motes(g, W, H, t, 30, '#ffe3a0', 0.8); } },
  ],
  talk: [   // word of mouth: bubbles passing between neighbours
    { depth: 0, draw: (g, W, H) => sky(g, W, H, '#2f3d68', '#8a7fa6') },
    { depth: 0.04, live: (g, W, H, t) => stars(g, W, H, t, 12) },
    { depth: 0.3, draw: (g, W, H) => { const u = U(W, H), tints = ['#b9776a', '#7f9ab5', '#c9a35e', '#8aa57d', '#a98ab0', '#d08b6a']; for (let i = 0; i < 6; i++) house(g, W * (0.02 + i * 0.2), H * 0.64, u * (0.075 + (i % 3) * 0.012), 151 + i, tints[i]); } },
    { depth: 0.5, draw: (g, W, H) => ground(g, W, H, 0.64, '#6a6f86') },
    { depth: 0.65, figures: true },
    { depth: 0.8, live: (g, W, H, t) => { const u = U(W, H); ['loaf', 'heart', 'star', 'loaf'].forEach((icon, i) => { const ph = (t * 0.9 + i * 0.35) % 1.4, grow = Math.min(1, ph * 3), a = ph > 1.1 ? Math.max(0, 1 - (ph - 1.1) * 3) : 1; g.globalAlpha = a; bubble(g, W * (0.18 + i * 0.22), H * (0.5 - 0.03 * i) - ph * 30, u * 0.3 * grow, 160 + i, icon); g.globalAlpha = 1; }); } },
    { depth: 0.95, draw: (g, W, H) => { streetLamp(g, W * 0.06, H * 0.98, U(W, H) * 0.14, 165); tree(g, W * 0.95, H * 0.98, U(W, H) * 0.2, 166); } },
  ],
  finale: [   // morning: the shop lit, the whole street thanking her
    { depth: 0, draw: (g, W, H) => sky(g, W, H, '#6aa0d6', '#ffd9a0') },
    { depth: 0.1, live: (g, W, H, t) => { const u = U(W, H); g.fillStyle = '#fff4c0'; g.beginPath(); g.arc(W * 0.8, H * (0.2 + 0.01 * Math.sin(t)), u * 0.09, 0, 6.2832); g.fill(); pencil(g, ellipsePts(W * 0.8, H * 0.2, u * 0.09, u * 0.09, 20), { width: 3, seed: 171 }); } },
    { depth: 0.3, draw: (g, W, H) => { const u = U(W, H), tints = ['#b9776a', '#7f9ab5', '#c9a35e', '#8aa57d', '#a98ab0']; for (let i = 0; i < 5; i++) house(g, W * (0.05 + i * 0.22), H * 0.62, u * (0.08 + (i % 2) * 0.012), 172 + i, tints[i]); } },
    { depth: 0.5, draw: (g, W, H) => ground(g, W, H, 0.62, '#8a8fa6') },
    { depth: 0.58, draw: (g, W, H) => shopFront(g, W * 0.5, H * 0.7, U(W, H) * 0.3, 178, { text: "ROSA'S", lit: true }) },
    { depth: 0.65, figures: true },
    { depth: 1.1, live: (g, W, H, t) => { for (let i = 0; i < 40; i++) { const x = (hh(i) * W * 1.2 - 0.1 * W + Math.sin(t * 2 + i) * 30), y = ((hh(i + 5) + t * 0.18 * (0.5 + hh(i + 9))) % 1.2 - 0.1) * H; g.fillStyle = ['#d9453d', '#e8b923', '#2f8f8a', '#7a5aa6'][i % 4]; g.save(); g.translate(x, y); g.rotate(t * 3 + i); g.fillRect(-6, -3, 12, 6); g.restore(); } } },   // confetti
  ],
};
void [basket, mug, hand, counter];
