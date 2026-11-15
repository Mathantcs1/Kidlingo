// Store-bound crop / flip / anchor commands (Plan 5E Task 6): each is ONE `apply` (one undo step); refusals (locked
// track, keyed anchor, wrong clip kind) become toasts through `guard`.
import { anchorToCropCentre, fitToCrop, movePivotTo, resetAnchor, resetCrop, setAnchor, setCrop, setFlip } from '../core/cropEdits';
import type { Anchor, Crop } from '../core/cropTypes';
import type { Id, Project } from '../core/model';
import { setValueAtCmd } from './keyframeCommands';
import { useEditor } from '../state/store';
import { guard } from './Toast';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

export const ANCHOR_TARGET = { kind: 'transform', prop: 'anchor' } as const;

export const setCropCmd = (clipId: Id, patch: Partial<Crop>): void => apply((p) => setCrop(p, clipId, patch));
export const resetCropCmd = (clipId: Id): void => apply((p) => resetCrop(p, clipId));
export const fitToCropCmd = (clipId: Id, mode: 'fit' | 'fill'): void => apply((p) => fitToCrop(p, clipId, mode));
export const setFlipCmd = (clipId: Id, patch: { h?: boolean; v?: boolean }): void => apply((p) => setFlip(p, clipId, patch));
/** An anchor field commit at the playhead: a key when the anchor is animated, the static value otherwise. */
export const setAnchorAtCmd = (clipId: Id, a: Anchor): void => setValueAtCmd(clipId, ANCHOR_TARGET, a);
export const resetAnchorCmd = (clipId: Id): void => apply((p) => resetAnchor(p, clipId));
export const anchorToCropCentreCmd = (clipId: Id): void => apply((p) => anchorToCropCentre(p, clipId));
/** The on-canvas pivot drag's release: the pivot lands on the format point, the picture does not move (ONE step). */
export const movePivotCmd = (clipId: Id, point: { x: number; y: number }): void => apply((p) => movePivotTo(p, clipId, point));
export const setAnchorStaticCmd = (clipId: Id, a: Anchor): void => apply((p) => setAnchor(p, clipId, a));
