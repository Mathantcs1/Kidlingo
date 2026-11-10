import { FORMATS } from './formats';
import type { FormatKey } from './formats';
import { clipDuration, clipEnd } from './model';
import type { Clip, Id, Project, Transform } from './model';
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

export function reframeProject(p: Project, key: FormatKey): Project {
  const { width, height } = FORMATS[key];
  const canvas = { width, height };
  return {
    ...p,
    format: { ...p.format, width, height },
    tracks: p.tracks.map((t) =>
      t.kind === 'audio'
        ? { ...t, clips: t.clips.map((c) => ({ ...c })) }
        : {
            ...t,
            clips: t.clips.map((c) => {
              const m = p.media[c.mediaId];
              if (c.kind === 'audio' || !m || !m.width || !m.height) return { ...c };
              return { ...c, transform: fitTransform({ width: m.width, height: m.height }, canvas, c.fit) };
            }),
          },
    ),
  };
}
