// Pure, DOM-free maths for the on-canvas transform overlay: CSS pixels of the displayed preview canvas <-> FORMAT
// pixels (origin at the canvas top-left, y down; see render/overlayGeometry.ts), and which clip the overlay edits.
import type { Clip, MediaRef, Project } from '../core/model';
import { overlayBaseSize } from '../core/overlays';
import { findClip } from '../core/timeline';
import type { Point } from '../render/overlayGeometry';
import type { Size } from '../render/geometry';
import { visualClipsAt } from '../render/visible';
import { liveSelection } from './edits';

/** The displayed canvas (content box) in the same CSS coordinate space as the points converted. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const pos = (v: number): boolean => Number.isFinite(v) && v > 0;

/**
 * CSS px per format px. The box has the format's aspect (fitBox), so the scale is uniform; when rounding leaves
 * the axes a hair apart, their mean. 1 for a degenerate box or format, so nothing becomes NaN.
 */
export function cssPerFormat(box: Box, format: Size): number {
  if (!pos(box.width) || !pos(box.height) || !pos(format.width) || !pos(format.height)) return 1;
  const sx = box.width / format.width;
  const sy = box.height / format.height;
  return sx === sy ? sx : (sx + sy) / 2;
}

/** A CSS point to format px (points outside the box map outside the canvas). */
export function cssToFormat(pt: Point, box: Box, format: Size): Point {
  const s = cssPerFormat(box, format);
  return { x: (pt.x - box.left) / s, y: (pt.y - box.top) / s };
}

/** A format point to CSS px. */
export function formatToCss(pt: Point, box: Box, format: Size): Point {
  const s = cssPerFormat(box, format);
  return { x: box.left + pt.x * s, y: box.top + pt.y * s };
}

/** A distance of `cssPx` on screen, in format px (hit tolerances, snap thresholds, the rotate-handle offset). */
export function toleranceInFormatPx(cssPx: number, box: Box, format: Size): number {
  return cssPx / cssPerFormat(box, format);
}

/**
 * The clip's DISPLAYED source size, as the compositor draws it: the media's width/height (display size, already
 * rotated for rotated video; the image's own pixels), else a decoded frame's display size when given; null for
 * audio clips and unknown dimensions (no overlay). An overlay clip has no media: its size is its base size in
 * the project `format` (null when no format is given).
 */
export function sourceSizeFor(clip: Clip, media: MediaRef | undefined, frameInfo?: Size, format?: Size): Size | null {
  if (clip.kind === 'overlay') return clip.overlay && format ? overlayBaseSize(clip.overlay.type, format) : null;
  if (clip.kind === 'audio' || !media) return null;
  if (pos(media.width ?? NaN) && pos(media.height ?? NaN)) return { width: media.width!, height: media.height! };
  if (frameInfo && pos(frameInfo.width) && pos(frameInfo.height)) return { width: frameInfo.width, height: frameInfo.height };
  return null;
}

/**
 * The clip the overlay edits: exactly one live selected clip, a video/image clip drawn at `playhead` (its track
 * not hidden), on an unlocked track, with known dimensions; else null.
 */
export function overlayTarget(p: Project, selection: string[], playhead: number): { clip: Clip; size: Size } | null {
  const live = liveSelection(p, selection);
  if (live.length !== 1) return null;
  const clip = visualClipsAt(p, playhead).find((c) => c.id === live[0]);
  if (!clip || findClip(p, clip.id).track.locked) return null;
  const size = sourceSizeFor(clip, p.media[clip.mediaId], undefined, p.format);
  return size ? { clip, size } : null;
}
