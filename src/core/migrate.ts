import type { Project, Track } from './model';

export type MigrateResult = { ok: true; project: Project } | { ok: false; reason: 'newer' | 'malformed' };

const CURRENT = 2;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates a track's outline and fills the v2 flags it lacks. Clips are only checked to be objects. */
function toTrack(raw: unknown): Track | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || (raw.kind !== 'video' && raw.kind !== 'audio')) return null;
  if (!Array.isArray(raw.clips) || !raw.clips.every(isObject)) return null;
  return {
    ...raw,
    id: raw.id,
    kind: raw.kind,
    name: typeof raw.name === 'string' ? raw.name : '',
    hidden: raw.hidden === true,
    muted: raw.muted === true,
    solo: raw.solo === true,
    locked: raw.locked === true,
    clips: raw.clips as unknown as Track['clips'],
  };
}

/** Pure and idempotent: never mutates `raw`. v1 gains track defaults; v2 is shape-checked; newer versions are refused. */
export function migrateProject(raw: unknown): MigrateResult {
  if (!isObject(raw)) return { ok: false, reason: 'malformed' };
  const { version } = raw;
  if (typeof version === 'number' && version > CURRENT) return { ok: false, reason: 'newer' };
  if (version !== 1 && version !== CURRENT) return { ok: false, reason: 'malformed' };
  if (!isObject(raw.format) || !Array.isArray(raw.tracks) || !isObject(raw.media)) return { ok: false, reason: 'malformed' };
  const tracks: Track[] = [];
  for (const t of raw.tracks) {
    const track = toTrack(t);
    if (!track) return { ok: false, reason: 'malformed' };
    tracks.push(track);
  }
  const project = { ...raw, version: CURRENT, tracks } as unknown as Project;
  return { ok: true, project };
}
