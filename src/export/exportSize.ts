// Export frame sizes (split out of exporter.ts): which pixel size each quality renders at.
import type { Project } from '../core/model';
import { ExportError } from './errors';

export type ExportQuality = '1080p' | '4k';

/** The frame each quality fits into, as [long side, short side] (1080p: 1920x1080, 4k: 3840x2160, either way up). */
const FRAME: Record<ExportQuality, [number, number]> = { '1080p': [1920, 1080], '4k': [3840, 2160] };

/** Rounds each side down to the nearest even number (H.264 needs even dimensions); never below 2. */
export function evenDims(w: number, h: number): { width: number; height: number } {
  const even = (v: number): number => Math.max(2, Math.floor(v / 2) * 2);
  return { width: even(w), height: even(h) };
}

/**
 * Scales the project format, preserving aspect, to the largest size that fits a 1920x1080 ('1080p') or
 * 3840x2160 ('4k') frame of the same orientation, then rounds down to even dimensions. Every preset therefore
 * exports at 1080 on its short side at 1080p (square 1080x1080, 4:5 1080x1350) and 2160 at 4k. `longSide`
 * (test-only) instead scales the long side to exactly that many pixels. Throws ExportError('Invalid project size')
 * for a non-finite or non-positive size.
 */
export function exportSize(p: Project, q: ExportQuality, longSide?: number): { width: number; height: number } {
  const { width, height } = p.format;
  const positive = (v: number | undefined): boolean => v === undefined || (Number.isFinite(v) && v > 0);
  if (!positive(width) || !positive(height) || !positive(longSide)) throw new ExportError('Invalid project size');
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const [frameLong, frameShort] = FRAME[q];
  const scale = longSide !== undefined ? longSide / long : Math.min(frameLong / long, frameShort / short);
  return evenDims(Math.round(width * scale), Math.round(height * scale));
}
