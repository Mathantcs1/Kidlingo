// Store-bound effect commands for the selected clip. Each is ONE `apply` (one undo step); refusals become toasts.
import { applyPreset, setGainEffect } from '../core/audioPresets';
import { addEffect, moveEffect, removeEffect, updateEffect } from '../core/audioEdits';
import type { AudioEffectType, Id, Project } from '../core/model';
import { normaliseGainOrNull } from '../audio/effects/normalise';
import type { PresetKey } from '../audio/presets';
import { getPeaks } from '../media/peaks';
import { useEditor } from '../state/store';
import { guard, showError } from './Toast';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

export const addClipEffect = (clipId: Id, type: AudioEffectType): void => apply((p) => addEffect(p, clipId, type));

export const updateClipEffect = (clipId: Id, effectId: Id, patch: { enabled?: boolean; params?: Record<string, number> }): void =>
  apply((p) => updateEffect(p, clipId, effectId, patch));

export const removeClipEffect = (clipId: Id, effectId: Id): void => apply((p) => removeEffect(p, clipId, effectId));

export const moveClipEffect = (clipId: Id, effectId: Id, toIndex: number): void =>
  apply((p) => moveEffect(p, clipId, effectId, toIndex));

export const applyClipPreset = (clipId: Id, key: PresetKey): void => apply((p) => applyPreset(p, clipId, key));

/**
 * Normalise: reads the clip's cached (or freshly computed) waveform peaks, then sets its gain effect so the loudest
 * peak in [in, out) reaches -1 dBFS, in one apply against the project as it is when the peaks arrive.
 */
export async function normaliseClip(clipId: Id, mediaId: Id): Promise<void> {
  const peaks = await getPeaks(mediaId);
  if (!peaks) {
    showError('Cannot normalise: the waveform of this clip is not available');
    return;
  }
  let silent = false;
  apply((p) => {
    const clip = p.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return p;
    const gainDb = normaliseGainOrNull(peaks, clip);
    silent = gainDb === null;
    return gainDb === null ? p : setGainEffect(p, clipId, gainDb);
  });
  if (silent) showError('This clip is silent');
}
