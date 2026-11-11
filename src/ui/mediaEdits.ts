// Pure edits that remove media from the project, and how media in use is counted and worded (re-exported by ./edits).
import type { Clip, Id, Project } from '../core/model';
import { TimelineError } from '../core/timeline';

/** Number of clips that use `mediaId`: as their picture/sound, or (a LUT file) in any effect of their stack. */
export function clipsUsingMedia(p: Project, mediaId: Id): number {
  const uses = (c: Clip): boolean => c.mediaId === mediaId || (c.effects ?? []).some((e) => e.ref === mediaId);
  return p.tracks.reduce((n, t) => n + t.clips.filter(uses).length, 0);
}

/** How the editor says media is in use: "It is used by 2 clips on the timeline." */
export function usedByText(used: number): string {
  return `It is used by ${used === 1 ? '1 clip' : `${used} clips`} on the timeline.`;
}

/**
 * Removes `mediaId` from the project together with every clip that uses it (one edit, so one undo step); a LUT
 * still referenced by a clip's effect is refused. The stored file is not touched here: undo must be able to bring it
 * back; startup/New project GC deletes it later.
 */
export function removeMediaFromProject(p: Project, mediaId: Id): Project {
  const m = p.media[mediaId];
  if (!m) throw new TimelineError(`Media not found: ${mediaId}`);
  // A LUT's users are clips of OTHER media: removing them with it would lose footage, so it is refused instead.
  const used = m.kind === 'lut' ? clipsUsingMedia(p, mediaId) : 0;
  if (used > 0) throw new TimelineError(`Cannot remove ${m.name}. ${usedByText(used)}`);
  if (p.tracks.some((t) => t.locked && t.clips.some((c) => c.mediaId === mediaId))) throw new TimelineError('Track is locked');
  const { [mediaId]: _removed, ...media } = p.media;
  return { ...p, media, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== mediaId) })) };
}
