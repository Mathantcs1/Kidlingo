// Writes one abstract, text-free SVG hero per blog topic: site/wp-content/plugins/ideatoapps-core/content/heroes/<slug>.svg
// Deterministic: a hash of the slug picks shapes, positions and rotation, so running it twice gives identical files.
// Colours are CSS variables (--ita-hero-*) defined per category in assets/blog-art.css. No dependencies.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = join(root, 'site/wp-content/plugins/ideatoapps-core');
// content/topics.php: the PHP guard line (so the file is not readable by URL), then the JSON topic list.
const GUARD = "<?php defined( 'ABSPATH' ) || exit; ?>\n";
const topicsRaw = readFileSync(join(core, 'content/topics.php'), 'utf8');
if (!topicsRaw.startsWith(GUARD)) throw new Error('content/topics.php must start with the guard line');
const topics = JSON.parse(topicsRaw.slice(GUARD.length));
const out = join(core, 'content/heroes');

function hash(str) { // FNV-1a, 32 bit
  let h = 0x811c9dc5;
  for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const n = (v) => String(Math.round(v * 10) / 10);
const W = 1200, H = 675;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const col = (r) => `var(--ita-hero-${1 + Math.floor(r() * 3)})`;

// One signature motif per category, so the six topics areas are recognisable at a glance.
const motifs = {
  'ai-basics': (r) => { // a network of nodes and links
    const pts = Array.from({ length: 9 }, () => [120 + r() * 960, 90 + r() * 500]);
    const lines = pts.slice(1).map((p, i) => `<line x1="${n(pts[i][0])}" y1="${n(pts[i][1])}" x2="${n(p[0])}" y2="${n(p[1])}"/>`).join('');
    return `<g stroke="var(--ita-hero-3)" stroke-width="3" opacity=".55">${lines}</g>` + pts.map((p) => `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="${n(10 + r() * 16)}" fill="${col(r)}"/>`).join('');
  },
  prompting: (r) => { // rounded speech-bubble blocks
    return Array.from({ length: 6 }, (_, i) => { const w = 220 + r() * 260, x = i % 2 ? 1180 - w - r() * 200 : 20 + r() * 200; return `<rect x="${n(x)}" y="${n(40 + i * 100 + r() * 30)}" width="${n(w)}" height="${n(56 + r() * 30)}" rx="28" fill="${col(r)}" opacity="${n(0.55 + r() * 0.4)}"/>`; }).join('');
  },
  llms: (r) => { // rows of token blocks
    let s = '';
    for (let row = 0; row < 6; row++) { let x = -40 + r() * 80; const y = 50 + row * 100; while (x < W) { const w = 50 + r() * 140; s += `<rect x="${n(x)}" y="${y}" width="${n(w)}" height="54" rx="12" fill="${col(r)}" opacity="${n(0.35 + r() * 0.55)}"/>`; x += w + 14; } }
    return s;
  },
  agents: (r) => { // orbits and loops
    const cx = 300 + r() * 600, cy = 220 + r() * 240; let s = '';
    for (let i = 0; i < 5; i++) { const rr = 70 + i * 70 + r() * 20; s += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rr * 1.5)}" ry="${n(rr)}" fill="none" stroke="${col(r)}" stroke-width="${n(3 + r() * 5)}" opacity=".7" transform="rotate(${n(r() * 90 - 45)} ${n(cx)} ${n(cy)})"/>`; }
    return s + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(34 + r() * 20)}" fill="var(--ita-hero-3)"/>`;
  },
  'work-and-learning': (r) => { // rising steps / bars
    const k = 7 + Math.floor(r() * 3), w = W / k; let s = '';
    for (let i = 0; i < k; i++) { const h = 120 + (i / k) * 330 + r() * 110; s += `<rect x="${n(i * w + 10)}" y="${n(H - h)}" width="${n(w - 20)}" height="${n(h)}" rx="14" fill="${col(r)}" opacity="${n(0.5 + r() * 0.45)}"/>`; }
    return s;
  },
  'safety-and-judgment': (r) => { // concentric shield-like arcs
    const cx = 250 + r() * 700, cy = 250 + r() * 200; let s = '';
    for (let i = 0; i < 6; i++) { const rr = 60 + i * 55 + r() * 15, a0 = r() * 360, len = 140 + r() * 160; const p = (a) => [cx + rr * Math.cos((a * Math.PI) / 180), cy + rr * Math.sin((a * Math.PI) / 180)]; const [x1, y1] = p(a0), [x2, y2] = p(a0 + len); s += `<path d="M${n(x1)} ${n(y1)}A${n(rr)} ${n(rr)} 0 ${len > 180 ? 1 : 0} 1 ${n(x2)} ${n(y2)}" fill="none" stroke="${col(r)}" stroke-width="${n(10 + r() * 14)}" stroke-linecap="round" opacity=".8"/>`; }
    return s;
  },
};

function hero(t) {
  const r = rng(hash(t.slug));
  let s = `<rect width="${W}" height="${H}" fill="var(--ita-hero-bg)"/>`;
  // soft background scatter: big blurred-looking discs and rotated rounded squares, picked by the hash
  for (let i = 0; i < 4 + Math.floor(r() * 3); i++) {
    const x = r() * W, y = r() * H, size = 90 + r() * 240;
    s += pick(r, [0, 1]) ? `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size / 2)}" fill="${col(r)}" opacity="${n(0.12 + r() * 0.2)}"/>` : `<rect x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${n(size)}" height="${n(size * (0.5 + r() * 0.5))}" rx="${n(size * 0.15)}" fill="${col(r)}" opacity="${n(0.12 + r() * 0.2)}" transform="rotate(${n(r() * 90 - 45)} ${n(x)} ${n(y)})"/>`;
  }
  s += motifs[t.category](r);
  // a few small accent dots
  for (let i = 0; i < 6; i++) s += `<circle cx="${n(r() * W)}" cy="${n(r() * H)}" r="${n(4 + r() * 8)}" fill="var(--ita-hero-3)" opacity=".8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="ita-hero ita-hero--${t.category}" preserveAspectRatio="xMidYMid slice">\n${s}\n</svg>\n`;
}

mkdirSync(out, { recursive: true });
const keep = new Set(topics.map((t) => `${t.slug}.svg`));
for (const f of readdirSync(out)) if (f.endsWith('.svg') && !keep.has(f)) rmSync(join(out, f)); // drop heroes of removed topics
const seen = new Set();
for (const t of topics) {
  const svg = hero(t);
  if (seen.has(svg)) throw new Error(`duplicate hero for ${t.slug}`);
  seen.add(svg);
  writeFileSync(join(out, `${t.slug}.svg`), svg);
}
console.log(`wrote ${topics.length} heroes to ${out}`);
