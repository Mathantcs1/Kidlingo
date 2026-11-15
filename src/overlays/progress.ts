// The progress bar's fill fraction, quantised to whole frames so preview and export agree on every frame (E6/E9).
import { clipDuration } from '../core/model';
import type { Clip, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';

/** 0 on the first frame, 1 on the last frame of the clip (`source` 0) or of the whole timeline (`source` 1). */
export function overlayProgress(clip: Clip, p: Project, t: number, source: number): number {
  const fps = p.format.fps;
  const frame = Math.floor(t * fps + 1e-6);
  const total = Math.max(1, Math.round((source === 1 ? timelineDuration(p) : clipDuration(clip)) * fps));
  const k = source === 1 ? frame : frame - Math.round(clip.start * fps);
  if (total <= 1) return 1;
  return Math.min(1, Math.max(0, k / (total - 1)));
}
