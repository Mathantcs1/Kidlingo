// Draws an overlay clip with Canvas2D into a surface; the texture upload happens in textures.ts.
import type { OverlaySpec } from '../../core/model';
import { cornerRadius, lowerThirdLayout, progressRect } from '../../overlays/layout';
import { OVERLAY_SIZES, clampOverlayParams } from '../../overlays/spec';
import { drawSticker } from './stickers';

export type Surface = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** System fonts only (no web fonts, no emoji); the same machine renders preview and export. */
export const FONT = "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const css = (n: number, alpha = 1): string => `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;

function makeSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function roundedPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

const bold = (size: number): string => `700 ${size}px ${FONT}`;

function drawLowerThird(ctx: Ctx, spec: OverlaySpec, p: Record<string, number>): void {
  const measure = (t: string, size: number): number => {
    ctx.font = bold(size);
    return ctx.measureText(t).width;
  };
  const L = lowerThirdLayout(spec, measure);
  const { width, height } = OVERLAY_SIZES.lowerThird;
  ctx.save();
  roundedPath(ctx, 0, 0, width, height, cornerRadius(p.corner, width, height));
  ctx.clip();
  ctx.fillStyle = css(p.background, 0.92);
  ctx.fillRect(L.panel.x, L.panel.y, L.panel.width, L.panel.height);
  ctx.fillStyle = css(p.accent);
  ctx.fillRect(L.bar.x, L.bar.y, L.bar.width, L.bar.height);
  ctx.restore();
  ctx.fillStyle = css(p.textColor);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const [t, weight] of [[L.title, 700], [L.subtitle, 500]] as const) {
    if (!t) continue;
    ctx.font = `${weight} ${t.size}px ${FONT}`;
    ctx.fillText(t.text, t.x, t.y);
  }
}

function drawSubscribe(ctx: Ctx, spec: OverlaySpec, p: Record<string, number>): void {
  const { width, height } = OVERLAY_SIZES.subscribe;
  ctx.fillStyle = css(p.accent);
  roundedPath(ctx, 0, 0, width, height, cornerRadius(p.corner, width, height));
  ctx.fill();
  ctx.fillStyle = css(p.textColor);
  ctx.beginPath();
  ctx.moveTo(40, 38);
  ctx.lineTo(40, 102);
  ctx.lineTo(96, 70);
  ctx.closePath();
  ctx.fill();
  ctx.font = bold(56);
  const label = spec.text.trim();
  if (!label) return;
  let size = 56;
  const maxWidth = width - 130 - 30;
  while (size > 28 && ctx.measureText(label).width > maxWidth) {
    size--;
    ctx.font = bold(size);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, 130, height / 2 + 2, maxWidth);
}

function drawProgress(ctx: Ctx, p: Record<string, number>, progress: number): void {
  const { width, height } = OVERLAY_SIZES.progress;
  const r = cornerRadius(p.corner, width, height);
  ctx.fillStyle = css(p.background, 0.35);
  roundedPath(ctx, 0, 0, width, height, r);
  ctx.fill();
  ctx.save();
  roundedPath(ctx, 0, 0, width, height, r);
  ctx.clip();
  const fill = progressRect(progress, width, height);
  ctx.fillStyle = css(p.accent);
  ctx.fillRect(fill.x, fill.y, fill.width, fill.height);
  ctx.restore();
}

/** `spec` drawn at width x height pixels (its intrinsic box scaled to fit); `progress` 0..1 for the progress bar. */
export function rasterOverlay(spec: OverlaySpec, width: number, height: number, progress: number): Surface {
  const surface = makeSurface(width, height);
  const ctx = surface.getContext('2d') as Ctx | null;
  if (!ctx) return surface;
  const size = OVERLAY_SIZES[spec.type];
  ctx.scale(width / size.width, height / size.height);
  const p = clampOverlayParams(spec.type, spec.params);
  if (spec.type === 'lowerThird') drawLowerThird(ctx, spec, p);
  else if (spec.type === 'subscribe') drawSubscribe(ctx, spec, p);
  else if (spec.type === 'progress') drawProgress(ctx, p, progress);
  else {
    ctx.scale(size.width / 100, size.height / 100);
    drawSticker(ctx, p.shape, { fill: css(p.accent), text: css(p.textColor), font: FONT });
  }
  return surface;
}

const STEP = 1.25;
const MAX_SIDE = 2048;

/** Raster pixel size: the on-screen size rounded up to a 1.25x step (no re-raster on every resize pixel), 16..2048. */
export function overlayRasterSize(intrinsic: { width: number; height: number }, clipScale: number, screenScale: number): { width: number; height: number } {
  const px = intrinsic.width * clipScale * screenScale;
  const want = Math.max(16, Number.isFinite(px) ? px : 0);
  const width = Math.min(MAX_SIDE, Math.ceil(Math.pow(STEP, Math.ceil(Math.log(want) / Math.log(STEP)))));
  const height = Math.max(1, Math.min(MAX_SIDE, Math.round((width * intrinsic.height) / intrinsic.width)));
  return { width, height };
}
