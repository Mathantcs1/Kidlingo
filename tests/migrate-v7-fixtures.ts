// Shared fixtures for the data v7 migration tests (Plan 5B Task 2): saved projects built as plain JSON, like IndexedDB.
import { migrateProject } from '../src/core/migrate';
import { defaultClipAudio } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';

export const T = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const lin = { kind: 'linear' };

export const base = (id: string, kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, mediaId: kind === 'overlay' || kind === 'adjustment' ? '' : 'm1', kind, start: 0, in: 0, out: 2, volume: 1, fit: 'fit',
  transform: { ...T }, audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});

export const colour = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'e1', type: 'colour', enabled: true,
  params: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, hue: 0, shadows: 0, highlights: 0 },
  ...extra,
});

export function saved(version: number, video: unknown[], audio: unknown[] = []): Record<string, unknown> {
  return {
    version,
    format: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      { id: 'v', kind: 'video', name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: video },
      { id: 'a', kind: 'audio', name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: audio },
    ],
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, hasAudio: true } },
  };
}

export const ok = (raw: unknown): Project => {
  const r = migrateProject(raw);
  if (!r.ok) throw new Error(`not ok: ${r.reason}`);
  return r.project;
};

/** The first video clip of a v7 (by default) save holding just `clip`. */
export const one = (clip: unknown, version = 7): Clip => ok(saved(version, [clip])).tracks[0].clips[0];
/** The first audio clip of a save holding just `clip` on the audio track. */
export const oneAudio = (clip: unknown, version = 7): Clip => ok(saved(version, [], [clip])).tracks[1].clips[0];
