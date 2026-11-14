// Clip copy, paste and duplicate (pure). A copy is a deep, project-independent snapshot (effects, keys, motion,
// transform, params and audio fields included; media is referenced by `mediaId`, never copied). A paste makes NEW
// clip ids, puts the earliest copied clip at a frame-snapped time on the target track (clips of other copied tracks
// keep their relative track offset and start offset) and is ATOMIC: any refusal throws a TimelineError and no
// project is produced. Inputs are never mutated; the result is one new project (one undo step for the caller).
import { snapToFrame } from './fps';
import { clipEnd, isSourceless, newId } from './model';
import type { Clip, Id, Project, Track } from './model';
import { TimelineError, addClip, assertFinite, hasRoom } from './timeline';

/** One copied clip: its snapshot, its start relative to the earliest copied clip and its track relative to the topmost copied track. */
export interface PayloadClip {
  clip: Clip;
  offset: number;
  trackOffset: number;
}

export interface ClipPayload {
  clips: PayloadClip[];
  /** From the earliest start to the latest end of the copied clips (seconds). */
  span: number;
  /** The lowest-index track holding a copied clip at copy time (where the payload sits when pasted "in place"). */
  anchorTrackId: Id;
  /** Tracks the payload covers below the anchor (0 = a single track). */
  trackSpan: number;
}

const trackKindFor = (c: Clip): Track['kind'] => (c.kind === 'audio' ? 'audio' : 'video');
const trackLabel = (t: Track, i: number): string => (t.name.trim() !== '' ? `"${t.name.trim()}"` : `track ${i + 1}`);

/** A deep snapshot of the clips (selection order does not matter); refuses when none of the ids is a clip. */
export function copyClips(p: Project, clipIds: readonly Id[]): ClipPayload {
  const wanted = new Set(clipIds);
  const found: { clip: Clip; track: number }[] = [];
  p.tracks.forEach((t, track) => t.clips.forEach((clip) => wanted.has(clip.id) && found.push({ clip, track })));
  if (found.length === 0) throw new TimelineError('Select a clip to copy');
  const first = Math.min(...found.map((f) => f.clip.start));
  const top = Math.min(...found.map((f) => f.track));
  const clips = found
    .map((f) => ({ clip: structuredClone(f.clip), offset: f.clip.start - first, trackOffset: f.track - top }))
    .sort((a, b) => a.offset - b.offset || a.trackOffset - b.trackOffset);
  return {
    clips,
    span: Math.max(...found.map((f) => clipEnd(f.clip))) - first,
    anchorTrackId: p.tracks[top].id,
    trackSpan: Math.max(...clips.map((c) => c.trackOffset)),
  };
}

/** A pasted copy: new clip id, new ids for every effect (picture and audio), moved to `start`. */
function fresh({ clip }: PayloadClip, start: number): Clip {
  const c = structuredClone(clip);
  return { ...c, id: newId(), start, effects: c.effects.map((e) => ({ ...e, id: newId() })), audio: { ...c.audio, effects: c.audio.effects.map((e) => ({ ...e, id: newId() })) } };
}

/**
 * Maps each payload track (by its offset from the topmost) to a project track index. The raw layout (offsets kept, the
 * block moved up near the last track) is used when every kind matches; otherwise each payload track goes to the nearest
 * following (then preceding) track of the SAME kind relative to `target`, in order. Throws when no such mapping exists.
 */
function mapTracks(p: Project, payload: ClipPayload, target: number): Map<number, number> {
  const kinds = new Map<number, Track['kind']>();
  for (const pc of payload.clips) kinds.set(pc.trackOffset, trackKindFor(pc.clip));
  const offsets = [...kinds.keys()].sort((a, b) => a - b);
  const raw = Math.min(target, p.tracks.length - 1 - payload.trackSpan);
  if (raw >= 0 && offsets.every((o) => p.tracks[raw + o].kind === kinds.get(o))) return new Map(offsets.map((o) => [o, raw + o]));
  const starts = [...p.tracks.keys()].filter((i) => i >= target).concat([...p.tracks.keys()].filter((i) => i < target).reverse());
  for (const s of starts) {
    if (p.tracks[s].kind !== kinds.get(offsets[0])) continue;
    const map = new Map<number, number>([[offsets[0], s]]);
    let prev = s;
    for (const o of offsets.slice(1)) {
      const j = p.tracks.findIndex((t, i) => i > prev && t.kind === kinds.get(o));
      if (j < 0) break;
      map.set(o, j);
      prev = j;
    }
    if (map.size === offsets.length) return map;
  }
  throw new TimelineError('Not enough tracks of the right kind here to paste these clips');
}

/** Places the payload with its earliest clip at `start` (exact, no snapping) and its topmost track at `anchorId`. */
function place(p: Project, payload: ClipPayload, start: number, anchorId: Id): Project {
  const target = p.tracks.findIndex((t) => t.id === anchorId);
  if (target < 0) throw new TimelineError('Choose a track to paste onto');
  const map = mapTracks(p, payload, target);
  const planned = payload.clips.map((pc) => {
    const index = map.get(pc.trackOffset)!;
    const track = p.tracks[index];
    const clip = fresh(pc, start + pc.offset);
    if (trackKindFor(clip) !== track.kind) throw new TimelineError(`Cannot paste ${clip.kind === 'video' ? 'a' : 'an'} ${clip.kind} clip onto the ${track.kind} track ${trackLabel(track, index)}`);
    if (track.locked) throw new TimelineError(`Cannot paste: the track ${trackLabel(track, index)} is locked`);
    if (!isSourceless(clip) && !p.media[clip.mediaId]) throw new TimelineError('Cannot paste: the media of the copied clip was removed from the project');
    if (!hasRoom(track, clip)) throw new TimelineError(`Cannot paste: it would overlap a clip on ${trackLabel(track, index)}. Move the playhead or choose another track.`);
    return { track, clip };
  });
  // Clips sharing a track never overlap each other (they did not when copied), so the per-clip room check above is complete.
  return planned.reduce((acc, { track, clip }) => addClip(acc, track.id, clip), p);
}

/**
 * Pastes the payload with its earliest clip at `time` (snapped to the project frame) on track `trackId`. An empty
 * payload is a no-op (the same project). Refusals: unknown or locked track, wrong track kind, missing media, overlap.
 */
export function pasteClips(p: Project, payload: ClipPayload, at: { time: number; trackId: Id }): Project {
  assertFinite('paste time', at.time);
  if (payload.clips.length === 0) return p;
  return place(p, payload, snapToFrame(Math.max(0, at.time), p.format.fps), at.trackId);
}

/** Pastes the payload right after the end of the copied clips, on the tracks they came from. */
export function duplicateClips(p: Project, clipIds: readonly Id[]): Project {
  const payload = copyClips(p, clipIds);
  const first = Math.min(...payload.clips.map((c) => c.clip.start));
  return place(p, payload, first + payload.span, payload.anchorTrackId);
}

/**
 * The track a plain paste goes to: the active track when it can hold the payload's topmost clip, else the track that
 * clip was copied from, else the first track of its kind; null when the project has none.
 */
export function defaultPasteTrack(p: Project, payload: ClipPayload, activeTrackId: Id | null): Id | null {
  const lead = payload.clips.find((c) => c.trackOffset === 0)?.clip;
  if (!lead) return null;
  const kind = trackKindFor(lead);
  const active = p.tracks.find((t) => t.id === activeTrackId);
  if (active && active.kind === kind) return active.id;
  const anchor = p.tracks.find((t) => t.id === payload.anchorTrackId);
  if (anchor && anchor.kind === kind) return anchor.id;
  return p.tracks.find((t) => t.kind === kind)?.id ?? null;
}
