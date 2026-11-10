// Pure helpers that keep UI state (selection, active track, playhead) valid for a project.
import type { Id, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';

function clipIds(p: Project): Set<Id> {
  return new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.id)));
}

/** The selection without ids missing from `p`; the same array when nothing was dropped. */
export function pruneSelection(selection: Id[], p: Project): Id[] {
  const ids = clipIds(p);
  const pruned = selection.filter((id) => ids.has(id));
  return pruned.length === selection.length ? selection : pruned;
}

/** The playhead limited to the end of `p`'s timeline (0 for an empty one), so it never sits past the content. */
export function clampPlayhead(playhead: number, p: Project): number {
  const end = timelineDuration(p);
  return playhead > end ? Math.max(0, end) : playhead;
}

/** The active track id when `p` still has that track, else null. */
export function pruneActiveTrack(p: Project, id: Id | null): Id | null {
  return id !== null && p.tracks.some((t) => t.id === id) ? id : null;
}

/** The UI state of `s` made valid for `p` (the selection keeps its identity when nothing was dropped). */
export function reconcileUi(
  s: { selection: Id[]; activeTrackId: Id | null; playhead: number },
  p: Project,
): { selection: Id[]; activeTrackId: Id | null; playhead: number } {
  return {
    selection: pruneSelection(s.selection, p),
    activeTrackId: pruneActiveTrack(p, s.activeTrackId),
    playhead: clampPlayhead(s.playhead, p),
  };
}
