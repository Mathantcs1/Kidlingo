import { get, set } from 'idb-keyval';
import type { Id, Project } from '../core/model';

const KEY = 'clipforge:current';

export async function saveProject(p: Project): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await set(KEY, p);
}

/**
 * What is saved: 'none' only when the key is verifiably absent; 'unsupported' for a value this version cannot use
 * (a newer version, or a malformed value) — it must be preserved, never treated as "no project"; 'unavailable'
 * without IndexedDB. A read failure rejects.
 */
export type LoadResult =
  | { status: 'ok'; project: Project }
  | { status: 'none' }
  | { status: 'unsupported'; reason: string }
  | { status: 'unavailable' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Checks the value's outline (version 1 with format, tracks and media); clips are trusted as saved. */
export function classifySaved(v: unknown): LoadResult {
  if (v === undefined) return { status: 'none' };
  if (!isObject(v)) return { status: 'unsupported', reason: 'the stored data is not a ClipForge project.' };
  if (typeof v.version === 'number' && v.version > 1) {
    return { status: 'unsupported', reason: `it was saved by a newer version of ClipForge (format ${v.version}).` };
  }
  const shaped = v.version === 1 && isObject(v.format) && Array.isArray(v.tracks) && isObject(v.media);
  if (!shaped) return { status: 'unsupported', reason: 'the stored data is not a ClipForge project.' };
  return { status: 'ok', project: v as unknown as Project };
}

export async function loadProject(): Promise<LoadResult> {
  if (typeof indexedDB === 'undefined') return { status: 'unavailable' };
  return classifySaved(await get(KEY));
}

/** Pure: returns a new project with `missing` set only on media absent from storage. */
export async function reconcileMedia(
  p: Project,
  existsInStorage: (id: Id) => Promise<boolean>,
): Promise<Project> {
  const entries = await Promise.all(
    Object.entries(p.media).map(async ([id, m]) => {
      const exists = await existsInStorage(id);
      if (!exists) return [id, m.missing ? m : { ...m, missing: true }] as const;
      if (m.missing === undefined) return [id, m] as const;
      const { missing: _missing, ...rest } = m;
      return [id, rest] as const;
    }),
  );
  return { ...p, media: Object.fromEntries(entries) };
}
