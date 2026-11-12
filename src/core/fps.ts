import type { Clip, Project } from './model';

/** Frame rates a project can have; media rates snap to the nearest one. */
export const PROJECT_FPS = [24, 25, 30, 50, 60] as const;
export const DEFAULT_FPS = 30;
/** Rates outside (0, MAX_PLAUSIBLE_FPS] are treated as unknown (bad metadata). */
const MAX_PLAUSIBLE_FPS = 240;

function plausible(fps: number | undefined): fps is number {
  return fps !== undefined && Number.isFinite(fps) && fps > 0 && fps <= MAX_PLAUSIBLE_FPS;
}

/** The project rate closest to `fps` (23.976 → 24, 29.97 → 30, 59.94 → 60); 30 for missing or implausible rates. */
export function snapFps(fps: number | undefined): number {
  if (!plausible(fps)) return DEFAULT_FPS;
  let best: number = DEFAULT_FPS;
  for (const r of PROJECT_FPS) if (Math.abs(r - fps) < Math.abs(best - fps)) best = r;
  return best;
}

/**
 * When `clip` is the first video clip going onto a timeline whose video tracks are all empty, the project adopts
 * its media's frame rate (snapped). Never changes the rate otherwise, or when the media's rate is unknown.
 */
export function adoptFirstClipFps(p: Project, clip: Clip): Project {
  if (clip.kind !== 'video') return p;
  if (p.tracks.some((t) => t.kind === 'video' && t.clips.length > 0)) return p;
  const fps = p.media[clip.mediaId]?.fps;
  if (!plausible(fps)) return p;
  const next = snapFps(fps);
  return next === p.format.fps ? p : { ...p, format: { ...p.format, fps: next } };
}

/**
 * The frame index of clip-relative time `t`: floor(t·fps), with a 1e-6 frame tolerance so t = N / fps (as computed
 * by the exporter or the playhead) is frame N despite floating-point error. 0 for t < 0, non-finite t or fps ≤ 0.
 */
export function frameIndex(t: number, fps: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(fps) || fps <= 0 || t <= 0) return 0;
  return Math.floor(t * fps + 1e-6);
}

/** Clip-relative time snapped to its frame's start: frameIndex(t, fps) / fps (D6: preview frame N = export frame N). */
export function snapToFrame(t: number, fps: number): number {
  const n = frameIndex(t, fps);
  return n === 0 ? 0 : n / fps;
}
