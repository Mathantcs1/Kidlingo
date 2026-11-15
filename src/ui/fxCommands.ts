// Store-bound visual-effect commands for the selected clip. Each is ONE `apply` (one undo step); refusals become toasts.
import { addFx, addLut, applyLook, moveFx, removeFx, setFxStack, updateFx } from '../core/fxEdits';
import type { FxType, Id, Project, VisualEffect } from '../core/model';
import { FX_SCHEMAS, defaultFxParams } from '../fx/params';
import type { LookKey } from '../fx/looks';
import { importLut } from '../media/lutImport';
import { useEditor } from '../state/store';
import { guard, showError, showInfo } from './Toast';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

export const addClipFx = (clipId: Id, type: FxType): void => apply((p) => addFx(p, clipId, type));

export const updateClipFx = (clipId: Id, fxId: Id, patch: { enabled?: boolean; params?: Record<string, number>; ref?: Id }): void =>
  apply((p) => updateFx(p, clipId, fxId, patch));

export const removeClipFx = (clipId: Id, fxId: Id): void => apply((p) => removeFx(p, clipId, fxId));

export const moveClipFx = (clipId: Id, fxId: Id, toIndex: number): void => apply((p) => moveFx(p, clipId, fxId, toIndex));

/** Sets every parameter of one effect back to its default (the LUT reference is kept). */
export const resetClipFx = (clipId: Id, fxId: Id, type: FxType): void =>
  apply((p) => updateFx(p, clipId, fxId, { params: defaultFxParams(type) }));

export const applyClipLook = (clipId: Id, key: LookKey, intensity: number): void => apply((p) => applyLook(p, clipId, key, intensity));

/** The copied stack (module state: not undoable, not saved). */
let clipboard: VisualEffect[] | null = null;

export const hasCopiedFx = (): boolean => clipboard !== null;

export function copyClipFx(clipId: Id): boolean {
  const clip = useEditor.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
  if (!clip || clip.fx.length === 0) {
    showError('This clip has no effects to copy');
    return false;
  }
  clipboard = structuredClone(clip.fx);
  showInfo(`Copied ${clip.fx.length} effect${clip.fx.length === 1 ? '' : 's'}`);
  return true;
}

/** Replaces the clip's effects with the copied stack (new ids), in one undo step. */
export function pasteClipFx(clipId: Id): void {
  const stack = clipboard;
  if (!stack) {
    showError("Copy a clip's effects first");
    return;
  }
  apply((p) => setFxStack(p, clipId, stack));
}

/**
 * Imports a `.cube` file into the LUT library and, when `target` is given, points that LUT effect at it, all in one
 * undo step. A bad file becomes a toast with the parser's plain-English reason and changes nothing.
 */
export async function importLutFile(file: File, target?: { clipId: Id; fxId: Id }): Promise<void> {
  try {
    const ref = await importLut(file);
    apply((p) => {
      const q = addLut(p, ref);
      return target ? updateFx(q, target.clipId, target.fxId, { ref: ref.id }) : q;
    });
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
  }
}

export const toggleFxBypass = (): void => useEditor.getState().setFxBypass(!useEditor.getState().fxBypass);

export const fxLabel = (type: FxType): string => FX_SCHEMAS[type].label;
