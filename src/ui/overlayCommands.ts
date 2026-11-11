// Store-bound commands for overlay clips (Plan 4 Task 13) and adjustment layers (Task 13a). Each is ONE `apply` (one undo step); refusals (locked
// track, no video track) become toasts through `guard`.
import type { Id, OverlayType, Project } from '../core/model';
import { addAdjustmentClip } from '../core/adjustment';
import { addOverlayClip, updateOverlay } from '../core/overlays';
import type { OverlayPatch } from '../core/overlays';
import { useEditor } from '../state/store';
import { guard, showInfo } from './Toast';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

/**
 * The layer a new overlay goes on: the active video layer if it is visible, else the topmost visible unlocked video
 * layer, else the topmost visible one (the core then refuses it as locked), else the topmost video layer (all hidden).
 */
export function overlayTrackFor(p: Project, activeTrackId: Id | null): Id | null {
  const video = p.tracks.filter((t) => t.kind === 'video');
  const active = video.find((t) => t.id === activeTrackId);
  if (active && !active.hidden) return active.id;
  const top = [...video].reverse();
  const pick = top.find((t) => !t.hidden && !t.locked) ?? top.find((t) => !t.hidden) ?? top[0];
  return pick?.id ?? null;
}

/**
 * Adds a clip with `add` at the playhead on the layer overlayTrackFor picks, in ONE undo step, and selects it. Says so
 * when the only layers are hidden (the clip would not show).
 */
function addAtPlayhead(what: string, add: (p: Project, trackId: Id, start: number) => Project): void {
  const { history, activeTrackId, playhead, select } = useEditor.getState();
  const trackId = overlayTrackFor(history.present, activeTrackId);
  if (trackId === null) return guard(() => { throw new Error(`There is no video layer to add the ${what} to`); });
  const before = new Set(history.present.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  apply((p) => add(p, trackId, playhead));
  const after = useEditor.getState().history.present;
  const added = after.tracks.flatMap((t) => t.clips.map((c) => ({ c, t }))).find(({ c }) => !before.has(c.id));
  if (!added) return;
  select([added.c.id]);
  if (added.t.hidden) showInfo(`That layer is hidden, so the ${what} will not show. Show the layer to see it.`);
}

/** Adds an overlay at the playhead (5 s) on the active video layer in ONE undo step and selects it. */
export const addOverlayCmd = (type: OverlayType): void => addAtPlayhead('overlay', (p, id, at) => addOverlayClip(p, id, type, at));

/**
 * Adds an adjustment layer at the playhead (5 s) in ONE undo step and selects it, placed like an overlay (the active
 * video layer when it has room, else a new layer above the others).
 */
export const addAdjustmentCmd = (): void => addAtPlayhead('adjustment layer', addAdjustmentClip);

/** Changes the overlay's text, colours or sticker in ONE step (no step when nothing changes). */
export const updateOverlayCmd = (clipId: Id, patch: OverlayPatch): void => apply((p) => updateOverlay(p, clipId, patch));
