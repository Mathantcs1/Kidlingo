import { get, set } from 'idb-keyval';
import type { Id, Project } from '../core/model';

const KEY = 'clipforge:current';

export async function saveProject(p: Project): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await set(KEY, p);
}

export async function loadProject(): Promise<Project | null> {
  if (typeof indexedDB === 'undefined') return null;
  const v = (await get(KEY)) as Project | undefined;
  if (!v || v.version !== 1) return null;
  return v;
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
