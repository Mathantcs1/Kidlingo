// Pure, DOM-free helpers for laying out the editor (time <-> pixels, ruler ticks, sizes, labels).
import { FORMATS } from '../core/formats';
import type { FormatKey } from '../core/formats';

export const DEFAULT_PPS = 60;
export const MIN_PPS = 10;
export const MAX_PPS = 480;
const ZOOM_STEP = 1.5;
const MIN_TICK_GAP_PX = 40;
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function timeToPx(t: number, pps: number): number {
  return t * pps;
}

/** Pixel offset from time 0 to seconds; never negative. */
export function pxToTime(px: number, pps: number): number {
  return Math.max(0, px / pps);
}

/** Whole seconds as mm:ss (rounded); invalid or negative input reads 00:00. */
export function formatTime(sec: number): string {
  const total = Number.isFinite(sec) && sec > 0 ? Math.round(sec) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Playhead position as m:ss.t (tenths, truncated so 1.99 s never reads as 0:02.0); invalid or negative reads 0:00.0. */
export function formatTimecode(sec: number): string {
  const tenths = Number.isFinite(sec) && sec > 0 ? Math.floor(sec * 10 + 1e-6) : 0;
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

/**
 * Where to scroll the timeline so the playhead at `x` px stays visible during playback: null while it is inside the
 * viewport [scrollLeft, scrollLeft + width), else a position that puts it 10 % in from the left edge.
 */
export function followScroll(x: number, scrollLeft: number, width: number): number | null {
  if (!(width > 0) || (x >= scrollLeft && x < scrollLeft + width)) return null;
  return Math.max(0, Math.round(x - width * 0.1));
}

export interface Tick {
  time: number;
  label: string;
}

/** Labelled ticks from 0 to `seconds`, at the smallest step that keeps labels ≥ 40 px apart. */
export function rulerTicks(seconds: number, pps: number): Tick[] {
  const step = TICK_STEPS.find((s) => s * pps >= MIN_TICK_GAP_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: Tick[] = [];
  for (let t = 0; t <= seconds + 1e-9; t += step) ticks.push({ time: t, label: formatTime(t) });
  return ticks;
}

export function zoom(pps: number, dir: 'in' | 'out'): number {
  const next = dir === 'in' ? pps * ZOOM_STEP : pps / ZOOM_STEP;
  return Math.min(MAX_PPS, Math.max(MIN_PPS, next));
}

interface Size {
  width: number;
  height: number;
}

/** Largest box with `aspect`'s ratio that fits in `container` (rounded to whole px). */
export function fitBox(container: Size, aspect: Size): Size {
  const scale = Math.max(0, Math.min(container.width / aspect.width, container.height / aspect.height));
  return { width: Math.round(aspect.width * scale), height: Math.round(aspect.height * scale) };
}

export function formatKeyOf(format: Size): FormatKey | null {
  const keys = Object.keys(FORMATS) as FormatKey[];
  return keys.find((k) => FORMATS[k].width === format.width && FORMATS[k].height === format.height) ?? null;
}

/** Seconds of timeline to lay out: the content plus 30 s of room, at least a minute. */
export function contentSeconds(duration: number): number {
  return Math.max(60, Math.ceil(duration) + 30);
}

export const FORMAT_LABELS: Record<FormatKey, string> = {
  youtube: 'YouTube 16:9',
  vertical: 'Vertical 9:16 (Reels/Shorts/TikTok)',
  square: 'Square 1:1',
  portrait: 'Portrait 4:5',
};

/** Reduced ratio such as "16:9" for whole-pixel dimensions. */
export function aspectLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width) / d}:${Math.round(height) / d}`;
}

/** Longest side of the preview canvas in pixels. */
export const PREVIEW_MAX_LONG = 960;

/** Pixel size of the preview canvas: the format scaled down to `maxLong`, even sides, at least 2. */
export function previewSize(format: Size, maxLong = PREVIEW_MAX_LONG): Size {
  const { width, height } = format;
  if (!(width > 0 && height > 0)) return { width: 2, height: 2 };
  const scale = Math.min(1, maxLong / Math.max(width, height));
  const even = (v: number): number => Math.max(2, Math.floor(v / 2) * 2);
  return { width: even(Math.round(width * scale)), height: even(Math.round(height * scale)) };
}
