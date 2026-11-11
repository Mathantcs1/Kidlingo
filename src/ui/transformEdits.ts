// Pure edits of a clip's transform (position, scale, rotation, opacity), behind the inspector fields and the
// on-canvas overlay.
import { fitTransform } from '../core/merge';
import { overlayDefaultTransform } from '../core/overlays';
import type { Clip, Id, Project, Transform } from '../core/model';
import { TimelineError, assertUnlocked, findClip } from '../core/timeline';
import { normaliseDegrees, scaleBounds } from '../render/overlayGeometry';

const KEYS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;
/** x/y may go at most this many format widths/heights from the centre, so a typo cannot lose the clip forever. */
const REACH = 4;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Patches a video/image clip's transform: scale clamped to `scaleBounds(current scale)` (0.02..20, widened to
 * include the current scale so a fitted tiny image above 20× is not pulled down by a nudge), opacity to 0..1,
 * rotation normalised to (−180, 180], x/y to ±4× the format size; −0 is stored as 0. A non-finite value throws; audio clips and locked tracks are refused.
 * Returns `p` itself when nothing changes (so no undo step).
 */
export function setClipTransform(p: Project, clipId: Id, patch: Partial<Transform>): Project {
  for (const k of KEYS) {
    const v = patch[k];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) throw new TimelineError('Invalid transform value');
  }
  const { width, height } = p.format;
  return writeTransform(p, clipId, (cur) => ({
    x: patch.x === undefined ? cur.x : clamp(patch.x, -width * REACH, width * REACH) + 0,
    y: patch.y === undefined ? cur.y : clamp(patch.y, -height * REACH, height * REACH) + 0,
    scale: patch.scale === undefined ? cur.scale : clamp(patch.scale, ...scaleBounds(cur.scale)),
    rotation: patch.rotation === undefined ? cur.rotation : normaliseDegrees(patch.rotation),
    opacity: patch.opacity === undefined ? cur.opacity : clamp(patch.opacity, 0, 1),
  }));
}

/**
 * Puts the clip back where its fit mode places it (`fitTransform` for its media and the project format), as one
 * edit; the same project when it is already there. The fitted scale is NOT clamped to 0.02..20 (a tiny image fits
 * a 4K frame at more than 20×, exactly as `setClipFit` and a format switch place it). Media without known
 * dimensions keeps its scale. An overlay goes back to its type's default place (overlayDefaultTransform). An
 * adjustment clip is left as it is (`p` itself).
 */
export function resetClipTransform(p: Project, clipId: Id): Project {
  return writeTransform(p, clipId, (cur, clip) => {
    // An adjustment layer has no frame to put back; its opacity (the one value it uses) is kept: no change.
    if (clip.kind === 'adjustment') return cur;
    // An overlay has no media: it goes back to its type's default place.
    if (clip.kind === 'overlay' && clip.overlay) return overlayDefaultTransform(clip.overlay.type, p.format);
    const m = p.media[clip.mediaId];
    return m?.width && m.height
      ? fitTransform({ width: m.width, height: m.height }, p.format, clip.fit)
      : { x: 0, y: 0, scale: cur.scale, rotation: 0, opacity: 1 };
  });
}

/** Replaces a visual clip's transform with `fn(current)`; lock and audio guards; `p` itself when nothing changes. */
function writeTransform(p: Project, clipId: Id, fn: (cur: Transform, clip: Clip) => Transform): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (clip.kind === 'audio') throw new TimelineError('Audio clips have no picture to move');
  const cur = clip.transform;
  const next = fn(cur, clip);
  if (KEYS.every((k) => next[k] === cur[k])) return p;
  const updated = { ...clip, transform: next };
  return {
    ...p,
    tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? updated : c)) } : t)),
  };
}

/**
 * `p` with clip `clipId` drawn at `t`, for the live preview of an on-canvas drag only: no guards, no clamping, never
 * committed to history (the drag commits through `setClipTransform` on release). `p` itself if the clip is gone.
 */
export function withClipTransform(p: Project, clipId: Id, t: Transform): Project {
  if (!p.tracks.some((tr) => tr.clips.some((c) => c.id === clipId))) return p;
  return {
    ...p,
    tracks: p.tracks.map((tr) =>
      tr.clips.some((c) => c.id === clipId) ? { ...tr, clips: tr.clips.map((c) => (c.id === clipId ? { ...c, transform: t } : c)) } : tr,
    ),
  };
}
