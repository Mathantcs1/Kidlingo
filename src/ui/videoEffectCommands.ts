// Store-bound commands for the selected clip's PICTURE effects (Plan 4 Task 10). Each is ONE `apply` (one undo
// step); refusals (locked track, 9th effect, missing LUT file) become toasts through `guard`.
import type { LookKey } from '../core/looks';
import type { BlendMode, Id, Project, VideoEffectType } from '../core/model';
import {
  addVideoEffect, applyLook, moveVideoEffect, removeVideoEffect, setClipBlend, updateVideoEffect,
} from '../core/videoEffectEdits';
import { VIDEO_EFFECTS } from '../core/videoEffects';
import type { EffectGroup } from '../core/videoEffects';
import { useEditor } from '../state/store';
import { guard } from './Toast';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

export const addVideoEffectCmd = (clipId: Id, type: VideoEffectType, ref?: Id): void =>
  apply((p) => addVideoEffect(p, clipId, type, ref));

export const updateVideoEffectCmd = (
  clipId: Id, effectId: Id, patch: { enabled?: boolean; params?: Record<string, number> },
): void => apply((p) => updateVideoEffect(p, clipId, effectId, patch));

export const removeVideoEffectCmd = (clipId: Id, effectId: Id): void => apply((p) => removeVideoEffect(p, clipId, effectId));

export const moveVideoEffectCmd = (clipId: Id, effectId: Id, toIndex: number): void =>
  apply((p) => moveVideoEffect(p, clipId, effectId, toIndex));

/** Replaces the whole stack with a look in ONE step; one Undo restores the previous stack exactly. */
export const applyLookCmd = (clipId: Id, key: LookKey): void => apply((p) => applyLook(p, clipId, key));

/** The clip's blend mode in ONE step (no step when unchanged); a locked track refuses with a toast. */
export const setBlendCmd = (clipId: Id, mode: BlendMode): void => apply((p) => setClipBlend(p, clipId, mode));

export type KeyColour = { keyR: number; keyG: number; keyB: number };

/** '#rrggbb' → the three chroma key params (0..1). */
export function hexToKey(hex: string): KeyColour {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return { keyR: ((n >> 16) & 255) / 255, keyG: ((n >> 8) & 255) / 255, keyB: (n & 255) / 255 };
}

export function keyToHex({ keyR, keyG, keyB }: KeyColour): string {
  const h = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(keyR)}${h(keyG)}${h(keyB)}`;
}

/** The chroma key colour picker: keyR, keyG and keyB change together in ONE apply. */
export const setKeyColourCmd = (clipId: Id, effectId: Id, hex: string): void =>
  updateVideoEffectCmd(clipId, effectId, { params: hexToKey(hex) });

const GROUP_ORDER: EffectGroup[] = ['colour', 'look', 'blur', 'stylise', 'key'];
export const GROUP_LABEL: Record<EffectGroup, string> = {
  colour: 'Colour', look: 'Looks', blur: 'Blur and sharpen', stylise: 'Stylise', key: 'Keying',
};

/**
 * The add menu: available effects grouped by schema group, in schema order. `lut` is not listed: a LUT effect needs
 * a file, so it is added from the LUT list.
 */
export function addMenuGroups(): { group: EffectGroup; types: VideoEffectType[] }[] {
  const types = (Object.keys(VIDEO_EFFECTS) as VideoEffectType[]).filter((t) => VIDEO_EFFECTS[t].available && t !== 'lut');
  return GROUP_ORDER.map((group) => ({ group, types: types.filter((t) => VIDEO_EFFECTS[t].group === group) })).filter((g) => g.types.length > 0);
}

/** 'missing' when the effect's LUT media is gone from the project or its file is flagged missing. */
export function lutStatus(p: Project, ref: Id | undefined): 'ok' | 'missing' {
  const m = ref === undefined ? undefined : p.media[ref];
  return m && m.kind === 'lut' && !m.missing ? 'ok' : 'missing';
}
