// The preset browser's search (Plan 5B D10): pure and DOM-free. Case-insensitive substring matching on the preset's
// name in its list (the Exit name in the Exit list) and its synonyms; a name match ranks above a synonym match; ties
// keep the given (library) order; a blank query keeps everything.
import type { MotionSlot, PresetKey } from '../core/motionTypes';
import { PRESETS, presetLabel } from '../core/presets';

/** One tile of the browser: a preset in the list of a slot. */
export interface PresetEntry {
  key: PresetKey;
  slot: MotionSlot;
}

function rank(e: PresetEntry, q: string): number {
  if (presetLabel(e.key, e.slot).toLowerCase().includes(q)) return 0;
  if (PRESETS[e.key].synonyms.some((s) => s.includes(q))) return 1;
  return -1;
}

/** The entries matching `query`, best first. */
export function searchPresets(entries: readonly PresetEntry[], query: string): PresetEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...entries];
  return entries
    .map((e, i) => ({ e, i, r: rank(e, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}
