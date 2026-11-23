// Shared helpers for sketch scenes. U = the frame's short side, so portrait and landscape both fit.
export const U = (W, H) => Math.min(W, H / 1.78);
export const hh = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const glow = (g, x, y, r, rgb, a) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = q; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
export const motes = (g, W, H, t, n, color, speed) => { const u = U(W, H); for (let i = 0; i < n; i++) { const x = ((hh(i) * 1.5 - 0.25) * W + Math.sin(t * 0.8 + i) * 40 + t * speed * 12 * (0.5 + hh(i + 9))) % (W * 1.5) - 0.2 * W, y = ((hh(i + 50) * 1.4 + t * 0.06 * (0.5 + hh(i + 3))) % 1.4 - 0.2) * H; g.fillStyle = color; g.globalAlpha = 0.25 + 0.5 * hh(i + 7); g.beginPath(); g.arc(x, y, (2 + 4 * hh(i + 1)) * u / 1080, 0, 6.2832); g.fill(); } g.globalAlpha = 1; };
export const fillAll = (g, W, H, color) => { g.fillStyle = color; g.fillRect(-W * 0.4, -H * 0.4, W * 1.8, H * 1.8); };
