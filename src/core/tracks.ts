import { newTrack } from './model';
import type { Id, Project, Track, TrackKind } from './model';
import { TimelineError, assertUnlocked } from './timeline';

export const MAX_TRACKS_PER_KIND = 8;
/** Longest track name, in code points (longer names are cut). */
export const MAX_TRACK_NAME = 40;

function indexOfTrack(p: Project, trackId: Id): number {
  const i = p.tracks.findIndex((t) => t.id === trackId);
  if (i < 0) throw new TimelineError(`Track not found: ${trackId}`);
  return i;
}

/** Trim, cut to 40 code points (never splitting an emoji), trim again. */
const cleanName = (s: string): string => Array.from(s.trim()).slice(0, MAX_TRACK_NAME).join('').trim();

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function isLocked(p: Project, trackId: Id): boolean {
  return p.tracks.find((t) => t.id === trackId)?.locked ?? false;
}

/** Video tracks go directly above the existing video layers, audio tracks at the end, unless `index` is given (clamped). */
export function addTrack(p: Project, kind: TrackKind, opts?: { index?: number; name?: string }): Project {
  if (p.tracks.filter((t) => t.kind === kind).length >= MAX_TRACKS_PER_KIND) {
    throw new TimelineError(`At most ${MAX_TRACKS_PER_KIND} ${kind} tracks`);
  }
  const lastVideo = p.tracks.map((t) => t.kind).lastIndexOf('video');
  const dflt = kind === 'video' ? lastVideo + 1 : p.tracks.length;
  const want = opts?.index !== undefined && Number.isFinite(opts.index) ? Math.trunc(opts.index) : dflt;
  const at = clamp(want, 0, p.tracks.length);
  const tracks = [...p.tracks];
  tracks.splice(at, 0, newTrack(kind, cleanName(opts?.name ?? '')));
  return { ...p, tracks };
}

export function removeTrack(p: Project, trackId: Id, opts?: { removeClips?: boolean }): Project {
  assertUnlocked(p, trackId);
  const track = p.tracks[indexOfTrack(p, trackId)];
  if (p.tracks.filter((t) => t.kind === track.kind).length <= 1) {
    throw new TimelineError(`A project needs at least one ${track.kind} track`);
  }
  if (track.clips.length > 0 && !opts?.removeClips) throw new TimelineError('Track has clips');
  return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) };
}

/** Layer order is not clip editing, so this works on locked tracks. Any index is accepted and clamped. */
export function moveTrack(p: Project, trackId: Id, toIndex: number): Project {
  const from = indexOfTrack(p, trackId);
  const to = clamp(Math.trunc(toIndex), 0, p.tracks.length - 1);
  if (!Number.isFinite(to) || to === from) return p;
  const tracks = [...p.tracks];
  const [t] = tracks.splice(from, 1);
  tracks.splice(to, 0, t);
  return { ...p, tracks };
}

export function renameTrack(p: Project, trackId: Id, name: string): Project {
  const i = indexOfTrack(p, trackId);
  const next = cleanName(name);
  if (p.tracks[i].name === next) return p;
  return { ...p, tracks: p.tracks.map((t, j) => (j === i ? { ...t, name: next } : t)) };
}

/** The only operation (besides renaming/moving) allowed on a locked track, so that it can be unlocked. */
export function setTrackFlags(
  p: Project,
  trackId: Id,
  flags: Partial<Pick<Track, 'hidden' | 'muted' | 'solo' | 'locked'>>,
): Project {
  const i = indexOfTrack(p, trackId);
  const track = p.tracks[i];
  if (flags.hidden !== undefined && track.kind === 'audio') {
    throw new TimelineError('Audio tracks cannot be hidden');
  }
  const changed = (Object.keys(flags) as (keyof typeof flags)[]).some((k) => flags[k] !== undefined && flags[k] !== track[k]);
  if (!changed) return p;
  const defined = Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined));
  return { ...p, tracks: p.tracks.map((t, j) => (j === i ? { ...t, ...defined } : t)) };
}

export function trackLabel(p: Project, trackId: Id): string {
  const track = p.tracks[indexOfTrack(p, trackId)];
  if (track.name.trim()) return track.name.trim();
  const n = p.tracks.filter((t) => t.kind === track.kind).findIndex((t) => t.id === trackId) + 1;
  return `${track.kind === 'video' ? 'Video' : 'Audio'} ${n}`;
}
