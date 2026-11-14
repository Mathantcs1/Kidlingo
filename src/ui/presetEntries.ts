// The tiles of the preset browser (Plan 5B D10): a built-in preset in the list of a slot, or a saved user preset; which
// ones a category and a search show. Pure.
import type { MotionSlot, PresetKey } from '../core/motionTypes';
import { presetsForSlot } from '../core/presets';
import type { UserPreset } from '../core/userPresets';
import type { FavRef } from '../state/presetLibrary';
import type { Category } from './presetCategories';
import { searchPresets } from './presetSearch';
import type { PresetEntry } from './presetSearch';

export type Entry = ({ kind: 'built' } & PresetEntry) | { kind: 'user'; preset: UserPreset };
export const idOf = (e: Entry): string => (e.kind === 'user' ? `user:${e.preset.id}` : `${e.slot}:${e.key}`);
export const refOf = (e: Entry): FavRef => (e.kind === 'user' ? { user: e.preset.id } : { slot: e.slot, key: e.key });
export const built = (key: PresetKey, slot: MotionSlot): Entry => ({ kind: 'built', key, slot });

/**
 * The entries `cat` shows for `query`. Built-in lists keep their relevance ranking (searchPresets); My presets and
 * Favourites (which can mix both kinds) keep their order and only filter by name or synonym.
 */
export function entriesFor(cat: Category, query: string, mine: readonly UserPreset[], favourites: readonly FavRef[]): Entry[] {
  const q = query.trim().toLowerCase();
  const matches = (e: Entry): boolean => (q === '' ? true : e.kind === 'user' ? e.preset.name.toLowerCase().includes(q) : searchPresets([e], q).length > 0);
  if (cat === 'mine') return mine.map((preset): Entry => ({ kind: 'user', preset })).filter(matches);
  if (cat === 'favourites') {
    const list = favourites.flatMap((f): Entry[] => {
      if (!('user' in f)) return [built(f.key, f.slot)];
      const preset = mine.find((m) => m.id === f.user);
      return preset ? [{ kind: 'user', preset }] : [];
    });
    return list.filter(matches);
  }
  return searchPresets(presetsForSlot(cat).map((key): PresetEntry => ({ key, slot: cat })), query).map((e) => built(e.key, e.slot));
}
