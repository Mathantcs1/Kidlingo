// Which clips make up the picture at a time: shared by the compositor, the preview's and the exporter's decoders.
import { activeClipsAt } from '../core/timeline';
import type { Clip, Id, Project } from '../core/model';

/** Ids of every clip on a video track that is not hidden, at any time (the clips that can ever be drawn). */
export function shownClipIds(p: Project): Set<Id> {
  const shown = new Set<Id>();
  for (const track of p.tracks) {
    if (track.kind === 'video' && !track.hidden) for (const c of track.clips) shown.add(c.id);
  }
  return shown;
}

/**
 * Active video/image clips on video tracks that are not hidden, bottom track first (array order is compositing
 * order). Hidden layers are neither drawn nor decoded; their audio is unaffected (see audio/plan.ts).
 */
export function visualClipsAt(p: Project, t: number): Clip[] {
  const shown = shownClipIds(p);
  return activeClipsAt(p, t).filter((c) => shown.has(c.id) && (c.kind === 'video' || c.kind === 'image'));
}
