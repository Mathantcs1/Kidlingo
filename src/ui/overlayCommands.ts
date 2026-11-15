// Store-bound overlay commands. Each is ONE `apply` (one undo step); refusals become toasts.
import { addOverlay, updateOverlay } from '../core/overlayEdits';
import type { Id, OverlayType, Project } from '../core/model';
import { useEditor } from '../state/store';
import { guard } from './Toast';

/**
 * Adds an overlay at the playhead on the active video track (or the first track with room, or a new one) and
 * selects it. `shape` picks a sticker's shape in the same undo step.
 */
export function addOverlayAtPlayhead(type: OverlayType, shape?: number): void {
  const s = useEditor.getState();
  const active = s.history.present.tracks.find((t) => t.id === s.activeTrackId && t.kind === 'video');
  let newId: Id | null = null;
  guard(() =>
    s.apply((p: Project) => {
      const before = new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.id)));
      let q = addOverlay(p, type, { start: useEditor.getState().playhead, trackId: active?.id });
      const added = q.tracks.flatMap((t) => t.clips).find((c) => !before.has(c.id));
      if (added && shape !== undefined) q = updateOverlay(q, added.id, { params: { shape } });
      newId = added?.id ?? null;
      return q;
    }),
  );
  if (newId) useEditor.getState().select([newId]);
}

export const updateOverlayClip = (clipId: Id, patch: { text?: string; subtext?: string; params?: Record<string, number> }): void =>
  guard(() => useEditor.getState().apply((p) => updateOverlay(p, clipId, patch)));
