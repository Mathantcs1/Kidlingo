// The personal preset library (Plan 5B D9): one IndexedDB record `clipforge:presets` = { version: 1, presets,
// favourites }, separate from the project. A record this build cannot use (a NEWER version, or malformed) is shown
// read-only and NEVER overwritten (the project rule): every writer refuses in that state and no `set` happens.
// Writers re-read the stored record, change it and write it back, one at a time, so tabs do not lose each other's edits.
import { get, set } from 'idb-keyval';
import { PRESET_CATEGORIES, cleanPresetName } from '../core/userPresets';
import type { UserPreset } from '../core/userPresets';
import type { Id } from '../core/model';
import type { MotionSlot, PresetKey } from '../core/motionTypes';

export const LIBRARY_KEY = 'clipforge:presets';
export const LIBRARY_VERSION = 1;
export const MAX_PRESETS = 100;
export const MAX_PRESET_BYTES = 64 * 1024;

/** A favourite: a built-in preset in the list of a slot, or a user preset. */
export type FavRef = { slot: MotionSlot; key: PresetKey } | { user: Id };
export interface LibraryRecord {
  version: typeof LIBRARY_VERSION;
  presets: UserPreset[];
  favourites: FavRef[];
}
export type LibraryState =
  | { status: 'ok'; record: LibraryRecord }
  | { status: 'readOnly'; reason: string }
  | { status: 'unavailable' };

export class LibraryError extends Error {}

export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isPreset(v: unknown): v is UserPreset {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !finite(v.created)) return false;
  if (!(PRESET_CATEGORIES as readonly unknown[]).includes(v.category)) return false;
  const p = v.payload;
  return isObj(p) && p.kind === 'anim' && finite(p.fit) && finite(p.lo) && finite(p.span) && Array.isArray(p.effects)
    && p.effects.every((e) => isObj(e) && typeof e.type === 'string' && finite(e.occurrence) && isObj(e.keys));
}

const isFav = (v: unknown): v is FavRef =>
  isObj(v) && ((typeof v.user === 'string') || (typeof v.slot === 'string' && typeof v.key === 'string'));

/** The stored value as a library: undefined = empty; a valid v1 record = ok; anything else is read-only (untouched). */
export function classifyLibrary(v: unknown): LibraryState {
  if (v === undefined) return { status: 'ok', record: { version: LIBRARY_VERSION, presets: [], favourites: [] } };
  if (!isObj(v) || !finite(v.version)) return { status: 'readOnly', reason: 'the stored preset library is not readable.' };
  if (v.version > LIBRARY_VERSION) return { status: 'readOnly', reason: `the preset library was saved by a newer version of ClipForge (format ${v.version}).` };
  if (v.version !== LIBRARY_VERSION || !Array.isArray(v.presets) || !Array.isArray(v.favourites) || !v.presets.every(isPreset) || !v.favourites.every(isFav)) {
    return { status: 'readOnly', reason: 'the stored preset library is not readable.' };
  }
  return { status: 'ok', record: { version: LIBRARY_VERSION, presets: v.presets, favourites: v.favourites } };
}

const sameFav = (a: FavRef, b: FavRef): boolean =>
  'user' in a ? 'user' in b && a.user === b.user : !('user' in b) && a.slot === b.slot && a.key === b.key;

export interface Library {
  load(): Promise<LibraryState>;
  save(preset: UserPreset): Promise<LibraryRecord>;
  rename(id: Id, name: string): Promise<LibraryRecord>;
  remove(id: Id): Promise<LibraryRecord>;
  setFavourite(ref: FavRef, on: boolean): Promise<LibraryRecord>;
}

const idbStore: KV = { get: (k) => get(k), set: (k, v) => set(k, v) };

/** The library over a key-value store (IndexedDB by default; tests pass a fake). */
export function createLibrary(kv: KV = idbStore, available: () => boolean = () => typeof indexedDB !== 'undefined'): Library {
  let chain: Promise<unknown> = Promise.resolve();

  const load = async (): Promise<LibraryState> => (available() ? classifyLibrary(await kv.get(LIBRARY_KEY)) : { status: 'unavailable' });

  // Serialised read-modify-write; refuses (throws, no write) unless the stored record is usable.
  function change(fn: (r: LibraryRecord) => LibraryRecord): Promise<LibraryRecord> {
    const run = chain.then(async () => {
      const s = await load();
      if (s.status === 'unavailable') throw new LibraryError('Presets cannot be saved: this browser has no storage available.');
      if (s.status === 'readOnly') throw new LibraryError(`The preset library is read-only: ${s.reason}`);
      const next = fn(s.record);
      if (next !== s.record) await kv.set(LIBRARY_KEY, next);
      return next;
    });
    chain = run.catch(() => undefined);
    return run;
  }

  return {
    load,
    save: (preset) => change((r) => {
      if (r.presets.length >= MAX_PRESETS) throw new LibraryError(`The library holds at most ${MAX_PRESETS} presets: delete one first.`);
      if (JSON.stringify(preset).length > MAX_PRESET_BYTES) throw new LibraryError('This animation is too large to save as a preset.');
      return { ...r, presets: [...r.presets, preset] };
    }),
    rename: (id, name) => change((r) => {
      const clean = cleanPresetName(name);
      const cur = r.presets.find((x) => x.id === id);
      if (!cur) throw new LibraryError('That preset no longer exists.');
      return cur.name === clean ? r : { ...r, presets: r.presets.map((x) => (x.id === id ? { ...x, name: clean } : x)) };
    }),
    remove: (id) => change((r) => (r.presets.some((x) => x.id === id)
      ? { ...r, presets: r.presets.filter((x) => x.id !== id), favourites: r.favourites.filter((f) => !('user' in f && f.user === id)) }
      : r)),
    setFavourite: (ref, on) => change((r) => {
      const has = r.favourites.some((f) => sameFav(f, ref));
      if (has === on) return r;
      return { ...r, favourites: on ? [...r.favourites, ref] : r.favourites.filter((f) => !sameFav(f, ref)) };
    }),
  };
}
