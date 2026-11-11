import { describe, it, expect } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { defaultClipAudio, emptyProject, newTrack } from '../src/core/model';

const clip = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start: 0,
  in: 0,
  out: 2,
  transform: { x: 1, y: 2, scale: 1.5, rotation: 10, opacity: 0.5 },
  volume: 0.7,
  fit: 'blur',
  ...extra,
});

const v1 = () => ({
  version: 1,
  format: { width: 1920, height: 1080, fps: 30 },
  tracks: [
    { id: 't1', kind: 'video', clips: [clip('c1'), clip('c2', { start: 2 })] },
    { id: 't2', kind: 'audio', clips: [clip('c3', { kind: 'audio' })] },
  ],
  media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, hasAudio: true, missing: true } },
});

const defaults = { name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null };
const withAudio = <T extends object>(c: T) => ({ ...c, audio: defaultClipAudio() });

describe('migrateProject', () => {
  it('migrates v1 to v3, adding track and clip defaults and keeping clips and media intact', () => {
    const raw = v1();
    const r = migrateProject(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.version).toBe(3);
    expect(r.project.format).toEqual(raw.format);
    expect(r.project.media).toEqual(raw.media);
    r.project.tracks.forEach((t, i) => {
      expect(t).toMatchObject(defaults);
      expect(t.id).toBe(raw.tracks[i].id);
      expect(t.kind).toBe(raw.tracks[i].kind);
      expect(t.clips).toEqual(raw.tracks[i].clips.map(withAudio));
    });
  });

  it('does not mutate its input', () => {
    const raw = v1();
    const copy = structuredClone(raw);
    migrateProject(raw);
    expect(raw).toEqual(copy);
  });

  it('passes a v3 project through equal', () => {
    const p = emptyProject();
    p.tracks[0].name = 'Main';
    p.tracks[0].muted = true;
    const r = migrateProject(p);
    expect(r).toEqual({ ok: true, project: p });
  });

  it('fills defaults for flags missing from a half-written v2 project', () => {
    const raw = { ...v1(), version: 2 };
    const r = migrateProject(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.tracks[0]).toMatchObject(defaults);
  });

  it('is idempotent', () => {
    const first = migrateProject(v1());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(migrateProject(first.project)).toEqual(first);
  });

  it('migrates a v2 project: every clip gets default audio, every track volume 1 and duck null', () => {
    const raw = { ...v1(), version: 2 };
    const copy = structuredClone(raw);
    const r = migrateProject(raw);
    expect(raw).toEqual(copy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.version).toBe(3);
    for (const t of r.project.tracks) {
      expect(t).toMatchObject({ volume: 1, duck: null });
      for (const c of t.clips) expect(c.audio).toEqual(defaultClipAudio());
    }
    expect(r.project.tracks.flatMap((t) => t.clips)).toHaveLength(3);
  });

  it('repairs malformed clip audio per field instead of rejecting', () => {
    const bad = clip('c1', {
      audio: {
        fadeIn: 'x', fadeOut: -3, pan: 9, silent: 'yes',
        effects: [{ id: 'e1', type: 'eq', enabled: true, params: { low: 3, bad: 'x' } }, { id: 'e2', type: 'nope', enabled: true, params: {} }, 5],
      },
    });
    const r = migrateProject({ ...v1(), version: 3, tracks: [{ id: 't', kind: 'video', volume: 7, duck: null, clips: [bad] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.tracks[0].volume).toBe(2);
    expect(r.project.tracks[0].clips[0].audio).toEqual({
      fadeIn: 0, fadeOut: 0, pan: 1, silent: false,
      effects: [{ id: 'e1', type: 'eq', enabled: true, params: { low: 3 } }],
    });
  });

  it('repairs track duck settings or drops them', () => {
    const mk = (duck: unknown) =>
      migrateProject({ ...v1(), version: 3, tracks: [{ id: 't', kind: 'audio', duck, clips: [] }] });
    const a = mk({ sourceTrackId: 's', amountDb: 6, attack: 0, release: 99 });
    expect(a.ok && a.project.tracks[0].duck).toEqual({ sourceTrackId: 's', amountDb: 0, attack: 0.01, release: 2 });
    const b = mk({ sourceTrackId: 's', amountDb: -100, attack: 0.1, release: 0.2 });
    expect(b.ok && b.project.tracks[0].duck?.amountDb).toBe(-40);
    const c = mk({ sourceTrackId: 5, amountDb: -6 });
    expect(c.ok && c.project.tracks[0].duck).toBeNull();
  });

  it('keeps unknown extra fields on clips', () => {
    const r = migrateProject({ ...v1(), tracks: [{ id: 't', kind: 'video', clips: [clip('c1', { future: 1 })] }] });
    expect(r.ok && (r.project.tracks[0].clips[0] as unknown as { future: number }).future).toBe(1);
  });

  it('reports a newer version', () => {
    expect(migrateProject({ version: 4 })).toEqual({ ok: false, reason: 'newer' });
    expect(migrateProject({ ...emptyProject(), version: 99 })).toEqual({ ok: false, reason: 'newer' });
  });

  it.each([
    ['null', null],
    ['array', []],
    ['number', 42],
    ['v1 without tracks', { version: 1 }],
    ['v1 without media', { version: 1, format: {}, tracks: [] }],
    ['tracks not an array', { ...v1(), tracks: 'no' }],
    ['non-object track', { ...v1(), tracks: [null] }],
    ['track without id', { ...v1(), tracks: [{ kind: 'video', clips: [] }] }],
    ['track with bad kind', { ...v1(), tracks: [{ id: 'x', kind: 'text', clips: [] }] }],
    ['track clips not an array', { ...v1(), tracks: [{ id: 'x', kind: 'video', clips: 'no' }] }],
    ['clip not an object', { ...v1(), tracks: [{ id: 'x', kind: 'video', clips: [5] }] }],
    ['unknown version', { ...v1(), version: 0 }],
    ['missing version', { ...v1(), version: undefined }],
  ])('rejects malformed input: %s', (_n, raw) => {
    expect(migrateProject(raw)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('newTrack', () => {
  it('creates a track with a fresh id and defaults', () => {
    const a = newTrack('video');
    const b = newTrack('audio', 'Music');
    expect(a).toEqual({ id: expect.any(String), kind: 'video', clips: [], ...defaults });
    expect(b.name).toBe('Music');
    expect(a.id).not.toBe(b.id);
  });
});
