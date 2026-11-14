// User presets (Plan 5B D9, pure): a whole-animation snapshot with a name and a category. Position keys are stored
// relative to the first position key and applied relative to the destination clip's rest position, so a saved slide
// works on any clip; the content is COPIED into the clip on use (the project never references the library). In/loop
// presets anchor at the clip's visible start, exits at its end, emphasis at the playhead, custom ones at the start.
import { isEmptyAnim } from './animPayload';
import type { AnimPayload } from './animPayload';
import { pasteAnimation } from './animTransfer';
import type { Anchor } from './animTransfer';
import { newId } from './model';
import type { Id, Project } from './model';
import type { MotionSlot } from './motionTypes';
import { TimelineError, findClip } from './timeline';

export type PresetCategory = MotionSlot | 'custom';
export const PRESET_CATEGORIES: readonly PresetCategory[] = ['in', 'emphasis', 'loop', 'out', 'custom'];
export const CATEGORY_LABEL: Record<PresetCategory, string> = { in: 'Entrance', emphasis: 'Emphasis', loop: 'Continuous', out: 'Exit', custom: 'Custom' };
export const MAX_PRESET_NAME = 40;

export interface UserPreset {
  id: Id;
  name: string;
  category: PresetCategory;
  /** Epoch ms of the save (display order only). */
  created: number;
  payload: AnimPayload;
}

/** The name trimmed to 1..40 characters (code points); refuses empty and over-long names. */
export function cleanPresetName(raw: string): string {
  const name = raw.trim();
  const n = Array.from(name).length;
  if (n === 0) throw new TimelineError('Give the preset a name');
  if (n > MAX_PRESET_NAME) throw new TimelineError(`A preset name has at most ${MAX_PRESET_NAME} characters`);
  return name;
}

/** A preset from a copied animation: positions made relative to the first position key. */
export function presetFromAnimation(payload: AnimPayload, rawName: string, category: PresetCategory, created = Date.now(), id: Id = newId()): UserPreset {
  const name = cleanPresetName(rawName);
  if (isEmptyAnim(payload)) throw new TimelineError('This clip has no animation to save');
  const copy = structuredClone(payload);
  const pos = copy.keys?.position;
  if (pos && pos.length > 0 && 'x' in pos[0]) {
    const { x: x0, y: y0 } = pos[0] as { x: number; y: number };
    for (const k of pos) if ('x' in k) { k.x -= x0; k.y -= y0; }
    copy.positionRelative = true;
  }
  return { id, name, category, created, payload: copy };
}

const ANCHOR: Record<PresetCategory, Anchor> = { in: 'start', loop: 'start', custom: 'start', out: 'end', emphasis: 'playhead' };

/** The anchor a category uses (exposed for the UI hint and tests). */
export const anchorOf = (c: PresetCategory): Anchor => ANCHOR[c];

/** Applies `preset` to the clip in ONE project (replacing its animation); `t` is the playhead (emphasis presets). */
export function applyUserPreset(p: Project, clipId: Id, preset: UserPreset, t: number): Project {
  findClip(p, clipId);
  let r;
  try {
    r = pasteAnimation(p, [clipId], preset.payload, { anchor: ANCHOR[preset.category], t });
  } catch (e) {
    if (e instanceof TimelineError) throw e;
    throw new TimelineError('This preset is damaged and cannot be applied');
  }
  if (r.project === p && r.skipped > 0) throw new TimelineError('This clip cannot take that preset');
  return r.project;
}
