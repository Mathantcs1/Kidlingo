// What the user is told when an effect or a LUT could not be used (D8): the preview toast and the export notice.
// Pure: no GL, no DOM.
import type { Project, VideoEffectType } from '../../core/model';
import { VIDEO_EFFECTS } from '../../core/videoEffects';

/** What an export left out: effect types whose shader failed this session, and LUT media names that would not load. */
export interface ExportSkips {
  effects: VideoEffectType[];
  luts: string[];
  /** Blend modes could not run on this device: blended clips were drawn as Normal. */
  blend?: boolean;
}

/** The preview toast when the blend program cannot be compiled (shown once per preview compositor). */
export const BLEND_UNAVAILABLE_MESSAGE = 'Blend modes are unavailable on this device; clips draw as Normal.';

/** The preview toast when an effect type's shader cannot run (shown once per type per session). */
export function effectUnavailableMessage(type: VideoEffectType): string {
  return `The ${VIDEO_EFFECTS[type].label} effect cannot run on this device, so it is skipped.`;
}

/**
 * The types of `unavailable` (Compositor.unavailableTypes(), session-wide) that an enabled effect of a clip on a
 * visible video track uses, in `unavailable` order: the effects an export of `p` really left out.
 */
export function skippedEffectTypes(p: Project, unavailable: readonly VideoEffectType[]): VideoEffectType[] {
  const used = new Set<VideoEffectType>();
  for (const t of p.tracks) {
    if (t.kind !== 'video' || t.hidden) continue;
    for (const c of t.clips) for (const e of c.effects ?? []) if (e.enabled) used.add(e.type);
  }
  return unavailable.filter((type) => used.has(type));
}

/** The plain-English notice shown with a finished export (or merge: `verb` 'Merged'), or null when nothing was left out. */
export function exportSkipNotice(s: ExportSkips, verb: 'Exported' | 'Merged' = 'Exported'): string | null {
  const parts: string[] = [];
  if (s.effects.length > 0) {
    const names = s.effects.map((t) => VIDEO_EFFECTS[t].label).join(', ');
    parts.push(`${verb} without these effects (this device cannot run them): ${names}.`);
  }
  if (s.luts.length > 0) {
    const names = s.luts.map((n) => `"${n}"`).join(', ');
    parts.push(`${verb} without these LUTs (the file is missing or not a valid .cube): ${names}.`);
  }
  if (s.blend) parts.push(`${verb} with blend modes drawn as Normal (this device cannot run them).`);
  return parts.length > 0 ? parts.join(' ') : null;
}
