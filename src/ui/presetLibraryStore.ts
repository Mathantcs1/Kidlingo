// The personal preset library as UI state (Plan 5B D9/D10): loads `clipforge:presets` once, mirrors every change and
// reports refusals as toasts. A library this build cannot use (newer / malformed) or no storage keeps favourites in
// memory only and every write refused (src/state/presetLibrary.ts never writes in that state). Not part of the
// project, not part of undo.
import { create } from 'zustand';
import type { Id } from '../core/model';
import type { UserPreset } from '../core/userPresets';
import { LibraryError, createLibrary } from '../state/presetLibrary';
import type { FavRef, LibraryRecord, LibraryState } from '../state/presetLibrary';
import { TimelineError } from '../core/timeline';
import { showError } from './toastStore';

interface LibraryStore {
  /** null until the first load finishes. */
  state: LibraryState | null;
  /** Favourites kept for this session only while the library is unusable. */
  memory: FavRef[];
}

export const useLibrary = create<LibraryStore>()(() => ({ state: null, memory: [] }));

const lib = createLibrary();
let loading: Promise<void> | null = null;

/** Loads the library once (and again after `reload`); never rejects. */
export function ensureLibrary(reload = false): Promise<void> {
  if (reload || !loading) {
    loading = lib.load().then(
      (state) => useLibrary.setState({ state }),
      () => useLibrary.setState({ state: { status: 'unavailable' } }),
    );
  }
  return loading;
}

const sameFav = (a: FavRef, b: FavRef): boolean =>
  'user' in a ? 'user' in b && a.user === b.user : !('user' in b) && a.slot === b.slot && a.key === b.key;

/** Runs a library write, mirrors its result and toasts a refusal; true when it went through. */
async function write(fn: () => Promise<LibraryRecord>): Promise<boolean> {
  try {
    useLibrary.setState({ state: { status: 'ok', record: await fn() } });
    return true;
  } catch (e) {
    if (e instanceof LibraryError || e instanceof TimelineError) showError(e.message);
    else showError('The preset library could not be saved.');
    await ensureLibrary(true);
    return false;
  }
}

export const saveUserPreset = (p: UserPreset): Promise<boolean> => write(() => lib.save(p));
export const renameUserPreset = (id: Id, name: string): Promise<boolean> => write(() => lib.rename(id, name));
export const deleteUserPreset = (id: Id): Promise<boolean> => write(() => lib.remove(id));

/** The favourites in the order they were starred, whether a ref is one, and the star toggle. */
export function useFavourites(): { favourites: FavRef[]; isFavourite(ref: FavRef): boolean; toggle(ref: FavRef): void } {
  const state = useLibrary((s) => s.state);
  const memory = useLibrary((s) => s.memory);
  const favourites = state?.status === 'ok' ? state.record.favourites : memory; // both are stable references
  const isFavourite = (ref: FavRef): boolean => favourites.some((f) => sameFav(f, ref));
  const toggle = (ref: FavRef): void => {
    const on = !isFavourite(ref);
    if (state?.status === 'ok') {
      // Optimistic: the star answers at once; a refusal reloads the stored state.
      const record = state.record;
      const next = on ? [...record.favourites, ref] : record.favourites.filter((f) => !sameFav(f, ref));
      useLibrary.setState({ state: { status: 'ok', record: { ...record, favourites: next } } });
      void write(() => lib.setFavourite(ref, on));
    } else {
      useLibrary.setState({ memory: on ? [...memory, ref] : memory.filter((f) => !sameFav(f, ref)) });
    }
  };
  return { favourites, isFavourite, toggle };
}

const NONE: UserPreset[] = [];
/** The user presets (the same empty list while loading or unusable, so a selector never changes identity). */
export const userPresets = (s: LibraryStore): UserPreset[] => (s.state?.status === 'ok' ? s.state.record.presets : NONE);
