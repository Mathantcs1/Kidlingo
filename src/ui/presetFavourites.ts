// Favourite presets of the browser (Plan 5B D9/D10). Task 7 keeps them IN MEMORY (lost on reload); Task 9 backs this
// same hook with the IndexedDB preset library (`clipforge:presets`, record field `favourites`). UI state only: not
// part of the project, not part of undo.
import { create } from 'zustand';
import type { MotionSlot, PresetKey } from '../core/motionTypes';

/** A built-in preset in the list of a slot (Fade In and Fade Out are different favourites). */
export interface PresetRef {
  slot: MotionSlot;
  key: PresetKey;
}

interface FavouritesState {
  favourites: PresetRef[];
  toggle(ref: PresetRef): void;
}

const same = (a: PresetRef, b: PresetRef): boolean => a.slot === b.slot && a.key === b.key;

const useFavouritesStore = create<FavouritesState>()((set) => ({
  favourites: [],
  toggle(ref) {
    set((s) => ({
      favourites: s.favourites.some((f) => same(f, ref)) ? s.favourites.filter((f) => !same(f, ref)) : [...s.favourites, { ...ref }],
    }));
  },
}));

/** The favourites (in the order they were starred), whether a ref is one, and the star toggle. */
export function useFavourites(): { favourites: PresetRef[]; isFavourite(ref: PresetRef): boolean; toggle(ref: PresetRef): void } {
  const favourites = useFavouritesStore((s) => s.favourites);
  const toggle = useFavouritesStore((s) => s.toggle);
  return { favourites, isFavourite: (ref) => favourites.some((f) => same(f, ref)), toggle };
}
