// Sticker shapes for overlay clips: vector paths in a unit square (y down), filled in `colour` and outlined in
// `accent`. Paths only, no emoji or web fonts, so every machine draws the same picture.
import type { StickerKind } from '../../core/model';
import type { OverlayContext } from './draw';

type Pt = [number, number];
/** One sub-path: a start point and segments ('L' line, 'Q' quadratic, 'C' cubic, points in unit coordinates). */
type Seg = ['L', Pt] | ['Q', Pt, Pt] | ['C', Pt, Pt, Pt];
interface SubPath { from: Pt; segs: Seg[] }

const poly = (pts: Pt[]): SubPath => ({ from: pts[0], segs: pts.slice(1).map((p): Seg => ['L', p]) });

function star(points: number, outer: number, inner: number, cx: number, cy: number): SubPath {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return poly(pts);
}

const SHAPES: Record<StickerKind, SubPath[]> = {
  heart: [{
    from: [0.5, 0.9],
    segs: [['C', [0.1, 0.65], [0, 0.35], [0.2, 0.18]], ['C', [0.35, 0.05], [0.5, 0.15], [0.5, 0.3]],
      ['C', [0.5, 0.15], [0.65, 0.05], [0.8, 0.18]], ['C', [1, 0.35], [0.9, 0.65], [0.5, 0.9]]],
  }],
  star: [star(5, 0.48, 0.2, 0.5, 0.53)],
  arrow: [poly([[0.05, 0.38], [0.55, 0.38], [0.55, 0.15], [0.95, 0.5], [0.55, 0.85], [0.55, 0.62], [0.05, 0.62]])],
  like: [
    poly([[0.06, 0.45], [0.26, 0.45], [0.26, 0.92], [0.06, 0.92]]),
    poly([[0.32, 0.45], [0.48, 0.1], [0.6, 0.1], [0.62, 0.4], [0.9, 0.4], [0.94, 0.5], [0.86, 0.92], [0.32, 0.92]]),
  ],
  bell: [
    { from: [0.18, 0.78], segs: [['L', [0.25, 0.4]], ['Q', [0.27, 0.13], [0.5, 0.13]], ['Q', [0.73, 0.13], [0.75, 0.4]], ['L', [0.82, 0.78]]] },
    { from: [0.4, 0.82], segs: [['Q', [0.5, 0.98], [0.6, 0.82]]] },
  ],
  fire: [{
    from: [0.5, 0.04],
    segs: [['C', [0.75, 0.3], [0.9, 0.5], [0.85, 0.7]], ['C', [0.8, 0.9], [0.62, 0.96], [0.5, 0.96]],
      ['C', [0.3, 0.96], [0.15, 0.85], [0.15, 0.65]], ['C', [0.15, 0.45], [0.33, 0.4], [0.38, 0.22]], ['Q', [0.48, 0.3], [0.5, 0.04]]],
  }],
  check: [poly([[0.06, 0.55], [0.2, 0.41], [0.4, 0.6], [0.8, 0.18], [0.94, 0.32], [0.4, 0.87]])],
  sparkle: [{
    from: [0.5, 0.02],
    segs: [['Q', [0.56, 0.44], [0.98, 0.5]], ['Q', [0.56, 0.56], [0.5, 0.98]], ['Q', [0.44, 0.56], [0.02, 0.5]], ['Q', [0.44, 0.44], [0.5, 0.02]]],
  }],
};

/** Draws `kind` as large as fits, centred in `w` × `h`, inside a margin that keeps the outline in the texture. */
export function drawSticker(ctx: OverlayContext, kind: StickerKind, w: number, h: number, colour: string, accent: string): void {
  const s = Math.min(w, h);
  const pad = 0.08 * s;
  const span = s - 2 * pad;
  const ox = (w - s) / 2 + pad;
  const oy = (h - s) / 2 + pad;
  const X = (p: Pt): Pt => [ox + p[0] * span, oy + p[1] * span];
  ctx.beginPath();
  for (const sub of SHAPES[kind] ?? SHAPES.heart) {
    ctx.moveTo(...X(sub.from));
    for (const seg of sub.segs) {
      if (seg[0] === 'L') ctx.lineTo(...X(seg[1]));
      else if (seg[0] === 'Q') ctx.quadraticCurveTo(...X(seg[1]), ...X(seg[2]));
      else ctx.bezierCurveTo(...X(seg[1]), ...X(seg[2]), ...X(seg[3]));
    }
    ctx.closePath();
  }
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 0.05 * s;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = accent;
  ctx.stroke();
}
