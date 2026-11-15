// Pure overlay layout (no DOM): text fitting, corner radii, the progress fill and the lower-third rectangles.
// Text is measured through an injected function so the same code runs in tests and with a real canvas context.
import type { OverlaySpec } from '../core/model';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Measure = (text: string, size: number) => number;

/**
 * One line of text that fits `maxWidth`: the largest size in [minSize, maxSize] (whole pixels) that fits, else the
 * minimum size with the end replaced by an ellipsis. Empty/blank text, or no room even for an ellipsis, gives no lines.
 */
export function fitText(text: string, maxWidth: number, maxSize: number, minSize: number, measure: Measure): { lines: string[]; size: number } {
  const t = text.trim();
  if (!t) return { lines: [], size: maxSize };
  for (let size = Math.floor(maxSize); size >= minSize; size--) {
    if (measure(t, size) <= maxWidth) return { lines: [t], size };
  }
  const chars = Array.from(t);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join('')}…`, minSize) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  const cut = `${chars.slice(0, lo).join('').trimEnd()}…`;
  return { lines: measure(cut, minSize) <= maxWidth ? [cut] : [], size: minSize };
}

export function progressRect(fraction: number, width: number, height: number): Box {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return { x: 0, y: 0, width: width * f, height };
}

/** `corner` 0..1 of the way to a full pill (half the short side). */
export function cornerRadius(corner: number, width: number, height: number): number {
  const c = Number.isFinite(corner) ? Math.min(1, Math.max(0, corner)) : 0;
  return (c * Math.min(width, height)) / 2;
}

export interface PlacedText {
  text: string;
  x: number;
  /** Baseline. */
  y: number;
  size: number;
}

const LT = { width: 960, height: 180, bar: 14, pad: 36 };

/** Rectangles and text placement of the lower third inside its 960 x 180 box. */
export function lowerThirdLayout(spec: OverlaySpec, measure: Measure): { bar: Box; panel: Box; title: PlacedText | null; subtitle: PlacedText | null } {
  const panel: Box = { x: LT.bar, y: 0, width: LT.width - LT.bar, height: LT.height };
  const bar: Box = { x: 0, y: 0, width: LT.bar, height: LT.height };
  const x = panel.x + LT.pad;
  const maxWidth = panel.width - 2 * LT.pad;
  const title = fitText(spec.text, maxWidth, 64, 32, measure);
  const sub = fitText(spec.subtext, maxWidth, 36, 22, measure);
  const hasTitle = title.lines.length > 0;
  const hasSub = sub.lines.length > 0;
  return {
    bar,
    panel,
    title: hasTitle ? { text: title.lines[0], x, y: hasSub ? 84 : 112, size: title.size } : null,
    subtitle: hasSub ? { text: sub.lines[0], x, y: hasTitle ? 134 : 108, size: sub.size } : null,
  };
}
