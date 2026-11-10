import { FORMATS } from './formats';
import type { FormatKey } from './formats';
import { clipDuration, clipEnd } from './model';
import type { Clip, Id, Project, Transform } from './model';
import { scaleBounds } from './scale';
import { TimelineError, assertUnlocked, findClip } from './timeline';

const EPS = 1e-9;

export function joinClips(p: Project, clipIds: Id[]): Project {
  if (clipIds.length < 2) throw new TimelineError('Select at least two clips to join');
  if (new Set(clipIds).size !== clipIds.length) throw new TimelineError('Duplicate clip ids');
  const found = clipIds.map((id) => findClip(p, id));
  const trackId = found[0].track.id;
  if (found.some((f) => f.track.id !== trackId)) {
    throw new TimelineError('Clips must be on the same track to join');
  }
  assertUnlocked(p, trackId);
  const selected = found.map((f) => f.clip);
  const runStart = Math.min(...selected.map((c) => c.start));
  const originalEnd = Math.max(...selected.map(clipEnd));

  const placed = new Map<Id, Clip>();
  let cursor = runStart;
  for (const c of selected) {
    placed.set(c.id, { ...c, start: cursor });
    cursor += clipDuration(c);
  }
  const delta = cursor - originalEnd;

  const ids = new Set(clipIds);
  const clips = found[0].track.clips
    .map((c) => {
      if (ids.has(c.id)) return placed.get(c.id) as Clip;
      return c.start >= originalEnd - EPS ? { ...c, start: c.start + delta } : c;
    })
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < clips.length; i++) {
    if (clips[i].start < clipEnd(clips[i - 1]) - EPS) {
      throw new TimelineError('Joined clips would overlap another clip');
    }
  }
  return {
    ...p,
    tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, clips } : t)),
  };
}

export function snapTime(p: Project, _trackId: Id, time: number, threshold: number): number {
  let best = time;
  let bestDist = Infinity;
  const consider = (candidate: number): void => {
    const d = Math.abs(candidate - time);
    if (d <= threshold + EPS && d < bestDist) {
      best = candidate;
      bestDist = d;
    }
  };
  consider(0);
  for (const t of p.tracks) {
    for (const c of t.clips) {
      consider(c.start);
      consider(clipEnd(c));
    }
  }
  return best;
}

export function fitTransform(
  src: { width: number; height: number },
  canvas: { width: number; height: number },
  mode: 'fit' | 'fill' | 'blur',
): Transform {
  const sx = canvas.width / src.width;
  const sy = canvas.height / src.height;
  const scale = mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy);
  return { x: 0, y: 0, scale, rotation: 0, opacity: 1 };
}

const SAME = 1e-6;

function sameTransform(a: Transform, b: Transform): boolean {
  return (['x', 'y', 'scale', 'rotation', 'opacity'] as const).every((k) => Math.abs(a[k] - b[k]) <= SAME);
}

/**
 * Switches the canvas to `key`. A visual clip whose transform still equals its fit for the old canvas (within 1e-6)
 * is refit to the new one; a customised clip (moved, scaled, rotated or faded) keeps its relative placement:
 * x·w′/w, y·h′/h, scale·min(w′/w, h′/h) kept within `scaleBounds` of its scale, rotation and opacity unchanged.
 * That is lossy: a round trip through another aspect can leave a customised clip smaller (the min ratio). Audio
 * clips and media without a known size are left alone. Intentionally ignores track locks: the format is a
 * sequence-level setting and every clip, locked or not, must follow it. Returns `p` itself when the canvas size
 * does not change (no undo step).
 */
export function reframeProject(p: Project, key: FormatKey): Project {
  const { width, height } = FORMATS[key];
  const old = p.format;
  if (old.width === width && old.height === height) return p;
  const canvas = { width, height };
  const rx = width / old.width;
  const ry = height / old.height;
  const reframe = (c: Clip): Clip => {
    const m = p.media[c.mediaId];
    if (c.kind === 'audio' || !m || !m.width || !m.height) return { ...c };
    const dims = { width: m.width, height: m.height };
    const t = c.transform;
    if (sameTransform(t, fitTransform(dims, old, c.fit))) return { ...c, transform: fitTransform(dims, canvas, c.fit) };
    const [lo, hi] = scaleBounds(t.scale);
    const scale = Math.min(hi, Math.max(lo, t.scale * Math.min(rx, ry)));
    return { ...c, transform: { ...t, x: t.x * rx, y: t.y * ry, scale } };
  };
  return {
    ...p,
    format: { ...p.format, width, height },
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map(t.kind === 'audio' ? (c) => ({ ...c }) : reframe) })),
  };
}
