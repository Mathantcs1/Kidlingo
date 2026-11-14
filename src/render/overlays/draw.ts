// Draws an overlay clip's picture with Canvas2D into a texture-sized canvas. Deterministic: the picture depends only
// on (spec, size, clip time, duration); no clock, no randomness, system font stack only (D10).
import { DEFAULT_OVERLAY_DURATION } from '../../core/overlaySpec';
import type { OverlaySpec, OverlayType } from '../../core/model';
import type { Size } from '../geometry';
import { drawSticker } from './stickers';

/** The parts of a 2D context the overlays use (a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D). */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'clearRect' | 'fillRect' | 'beginPath' | 'closePath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo'
  | 'bezierCurveTo' | 'fill' | 'stroke' | 'clip' | 'translate' | 'fillText' | 'measureText'
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'font' | 'textAlign' | 'textBaseline' | 'globalAlpha'
>;

/** Seconds a lower third takes to slide in at the start of its clip, and out at the end. */
export const SLIDE_SECONDS = 0.4;

export const OVERLAY_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Which built-in lower-third slides run: off at an edge whose clip has an in/out animation preset (5B D13). */
export interface BuiltInSlide {
  in: boolean;
  out: boolean;
}

export const BUILT_IN_SLIDES: Readonly<BuiltInSlide> = { in: true, out: true };

/**
 * The animated state at clip time `time` of a clip lasting `duration` s: `slide` (lower third: 0 = out, 1 = in;
 * smoothstep over SLIDE_SECONDS at the edges `builtIn` keeps, fully in at an edge it turns off) and `fill` (progress
 * bar: time / duration). Static types get 1 and 1.
 */
export function overlayAnimation(
  type: OverlayType, time: number, duration: number, builtIn: Readonly<BuiltInSlide> = BUILT_IN_SLIDES,
): { slide: number; fill: number } {
  if (type === 'lowerThird') {
    const fromIn = builtIn.in ? time : SLIDE_SECONDS;
    const fromOut = builtIn.out ? duration - time : SLIDE_SECONDS;
    const e = clamp01(Math.min(fromIn, fromOut) / SLIDE_SECONDS);
    return { slide: e * e * (3 - 2 * e), fill: 1 };
  }
  if (type === 'progressBar') return { slide: 1, fill: duration > 0 ? clamp01(time / duration) : 1 };
  return { slide: 1, fill: 1 };
}

/** overlayAnimation at `progress` (0..1, clamped) of a clip lasting `duration` s: what drawOverlay draws. */
export function animationAt(
  type: OverlayType, progress: number, duration: number, builtIn: Readonly<BuiltInSlide> = BUILT_IN_SLIDES,
): { slide: number; fill: number } {
  return overlayAnimation(type, clamp01(progress) * duration, duration, builtIn);
}

function roundRect(ctx: OverlayContext, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

/**
 * Sets the font for `text` at `size` px (shrunk down to 60 % to fit `maxWidth`) and returns the text to draw: cut
 * with an ellipsis when even the smallest size is too wide.
 */
function fitText(ctx: OverlayContext, text: string, maxWidth: number, size: number, weight: number): string {
  const font = (px: number): string => `${weight} ${Math.round(px * 10) / 10}px ${OVERLAY_FONT}`;
  ctx.font = font(size);
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) return text;
  ctx.font = font(Math.max(size * 0.6, (size * maxWidth) / width));
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

function lowerThird(ctx: OverlayContext, s: OverlaySpec, w: number, h: number, slide: number): void {
  if (slide <= 0) return;
  ctx.save();
  ctx.globalAlpha = slide;
  ctx.translate((slide - 1) * w, 0);
  roundRect(ctx, 0, 0, w, h, 0.1 * h);
  ctx.fillStyle = s.colour;
  ctx.fill();
  ctx.clip();
  const bar = Math.max(1, Math.round(0.035 * w));
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, 0, bar, h);
  const x = bar + 0.05 * w;
  const maxWidth = w - x - 0.04 * w;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const two = s.subtext !== '';
  if (s.text !== '') {
    const t = fitText(ctx, s.text, maxWidth, (two ? 0.36 : 0.45) * h, 700);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t, x, (two ? 0.37 : 0.5) * h);
  }
  if (two) {
    const t = fitText(ctx, s.subtext, maxWidth, 0.24 * h, 400);
    ctx.fillStyle = '#d8d8d8';
    ctx.fillText(t, x, (s.text !== '' ? 0.73 : 0.5) * h);
  }
  ctx.restore();
}

function subscribe(ctx: OverlayContext, s: OverlaySpec, w: number, h: number): void {
  roundRect(ctx, 0, 0, w, h, 0.22 * h);
  ctx.fillStyle = s.colour;
  ctx.fill();
  // A play triangle on the left, the text centred in the rest.
  const icon = 0.42 * h;
  const ix = 0.12 * h;
  ctx.beginPath();
  ctx.moveTo(ix, (h - icon) / 2);
  ctx.lineTo(ix + icon * 0.87, h / 2);
  ctx.lineTo(ix, (h + icon) / 2);
  ctx.closePath();
  ctx.fillStyle = s.accent;
  ctx.fill();
  if (s.text === '') return;
  const left = ix + icon;
  const t = fitText(ctx, s.text, w - left - 0.12 * h, 0.42 * h, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = s.accent;
  ctx.fillText(t, (left + w) / 2, h / 2);
}

function progressBar(ctx: OverlayContext, s: OverlaySpec, w: number, h: number, fill: number): void {
  ctx.fillStyle = s.colour;
  ctx.fillRect(0, 0, w, h);
  if (fill <= 0) return;
  ctx.fillStyle = s.accent;
  ctx.fillRect(0, 0, w * fill, h);
}

/**
 * Draws `spec` into the whole of `size` (cleared first; transparent where nothing is drawn). `progress` is the
 * clip time as a fraction of the clip (0..1) and `duration` the clip length in seconds (the lower third's slide is
 * timed in seconds); `builtIn` turns the lower third's slide off at an edge with a preset.
 */
export function drawOverlay(
  ctx: OverlayContext, spec: OverlaySpec, size: Size, progress: number, duration = DEFAULT_OVERLAY_DURATION,
  builtIn: Readonly<BuiltInSlide> = BUILT_IN_SLIDES,
): void {
  const { width: w, height: h } = size;
  ctx.clearRect(0, 0, w, h);
  const { slide, fill } = animationAt(spec.type, progress, duration, builtIn);
  switch (spec.type) {
    case 'lowerThird': return lowerThird(ctx, spec, w, h, slide);
    case 'subscribe': return subscribe(ctx, spec, w, h);
    case 'progressBar': return progressBar(ctx, spec, w, h, fill);
    case 'sticker': return drawSticker(ctx, spec.sticker ?? 'heart', w, h, spec.colour, spec.accent);
  }
}
