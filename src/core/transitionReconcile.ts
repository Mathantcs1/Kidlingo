// reconcileTransitions (Plan 5C D9): run at the end of every structural edit. Drops the transitions that no longer fit
// (clip gone, moved, not adjacent, wrong kinds, duplicates), clamps the rest to the handles and clip lengths rounding down to
// whole frames, drops those under 2 frames and sorts by cut time. Returns the SAME project when nothing changes.
import type { Id, Project, Track } from './model';
import { cutsOf, maxDuration, pairAllowed, easeAllowed } from './transitions';
import { MAX_TRANSITION_SECONDS, MIN_TRANSITION_FRAMES } from './transitionTypes';
import type { Transition } from './transitionTypes';

const EPS = 1e-9;

function reconcileTrack(p: Project, track: Track): Track {
  const list = track.transitions;
  if (!list || list.length === 0) return track.transitions ? withTransitions(track, []) : track;
  const cuts = cutsOf(track);
  const cutOf = (tr: Transition) => cuts.find((c) => c.from.id === tr.fromClipId && c.to.id === tr.toClipId);
  const ordered = list
    .map((tr, i) => ({ tr, i, cut: cutOf(tr) }))
    .filter((x) => x.cut && pairAllowed(track, x.tr, x.cut.from, x.cut.to) && easeAllowed(x.tr))
    .sort((a, b) => a.cut!.time - b.cut!.time || a.i - b.i);
  const kept: Transition[] = [];
  const seen = new Set<Id>();
  const fps = p.format.fps;
  for (const { tr, cut } of ordered) {
    if (!cut || seen.has(tr.id) || kept.some((k) => k.fromClipId === tr.fromClipId && k.toClipId === tr.toClipId)) continue;
    const fromIn = kept.find((k) => k.toClipId === cut.from.id)?.duration;
    const next = ordered.find((o) => o.tr.fromClipId === cut.to.id && o.tr !== tr)?.tr.duration;
    const limit = maxDuration(p, cut.from, cut.to, { fromIn, toOut: next });
    const d = Math.min(Number.isFinite(tr.duration) ? tr.duration : 0, limit, MAX_TRANSITION_SECONDS);
    const snapped = Math.floor(d * fps + 1e-6);
    const frames = snapped - (snapped % 2);
    if (frames < MIN_TRANSITION_FRAMES) continue;
    const duration = frames / fps;
    seen.add(tr.id);
    kept.push(Math.abs(duration - tr.duration) <= EPS ? tr : { ...tr, duration });
  }
  const same = kept.length === list.length && kept.every((k, i) => k === list[i]);
  return same ? track : withTransitions(track, kept);
}

/** `track` with `transitions` set, or without the field when the list is empty. */
export function withTransitions(track: Track, transitions: Transition[]): Track {
  if (transitions.length > 0) return { ...track, transitions };
  const { transitions: _t, ...rest } = track;
  return rest;
}

export function reconcileTransitions(p: Project, trackIds?: readonly Id[]): Project {
  if (!p.tracks.some((t) => t.transitions)) return p;
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (trackIds && !trackIds.includes(t.id)) return t;
    const next = reconcileTrack(p, t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...p, tracks } : p;
}

/** How a structural edit changed the transitions (for a toast): removed and shortened counts, by transition id. */
export function transitionChanges(before: Project, after: Project): { removed: number; shortened: number } {
  const was = new Map(before.tracks.flatMap((t) => t.transitions ?? []).map((tr) => [tr.id, tr]));
  const now = new Map(after.tracks.flatMap((t) => t.transitions ?? []).map((tr) => [tr.id, tr]));
  let removed = 0;
  let shortened = 0;
  for (const [id, tr] of was) {
    const n = now.get(id);
    if (!n) removed++;
    else if (n.duration < tr.duration - EPS) shortened++;
  }
  return { removed, shortened };
}
