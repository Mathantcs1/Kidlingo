// Data v10 (Plan 5C Task 3): v9 saves open unchanged; hand-edited transitions are repaired per §8; `{version: 11}` is newer and
// never overwritten. Saves are plain JSON, like IndexedDB.
import { describe, it, expect } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { CURRENT_VERSION } from '../src/core/model';
import type { Project, Track } from '../src/core/model';
import { classifySaved } from '../src/state/persist';
import { base, lin, ok, saved } from './migrate-v7-fixtures';

// media m1 lasts 4 s: clips a (0..2 of m1 at 0) and b (2..4) use in 1..3 / 0.5..2.5 so every cut has 1 s of handle each side.
const a = base('a', 'video', { start: 0, in: 1, out: 2.5 });
const b = base('b', 'video', { start: 1.5, in: 0.5, out: 2 });
const tr = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 't1', fromClipId: 'a', toClipId: 'b', type: 'dissolve', duration: 1, ease: lin, ...extra });
const withTr = (list: unknown, version = 9, video: unknown[] = [a, b]): Record<string, unknown> => {
  const s = saved(version, video);
  (s.tracks as Record<string, unknown>[])[0].transitions = list;
  return s;
};
const video = (p: Project): Track => p.tracks[0];

describe('v9 -> v10', () => {
  it('CURRENT_VERSION is at least 10', () => expect(CURRENT_VERSION).toBeGreaterThanOrEqual(10));
  it('opens a v9 save without transitions JSON-equal apart from the version, idempotently', () => {
    const raw = saved(9, [a, b]);
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.version).toBe(CURRENT_VERSION);
    expect(JSON.stringify({ ...p, version: 9 })).toBe(snap);
    expect(JSON.stringify(ok(p))).toBe(JSON.stringify(p));
  });
  it('keeps a valid transition untouched and is idempotent', () => {
    const raw = withTr([tr({ type: 'wipe', direction: 'left', softness: 0.1, ease: { kind: 'easeInOut' } })]);
    const p = ok(raw);
    expect(video(p).transitions).toEqual([tr({ type: 'wipe', direction: 'left', softness: 0.1, ease: { kind: 'easeInOut' } })]);
    expect(JSON.stringify(ok(p))).toBe(JSON.stringify(p));
  });
  it('accepts every version 1..current, refuses the next as newer and never overwrites it', () => {
    for (let v = 1; v <= CURRENT_VERSION; v++) expect(migrateProject(saved(v, [])).ok).toBe(true);
    expect(migrateProject(saved(CURRENT_VERSION + 1, []))).toEqual({ ok: false, reason: 'newer' });
    expect(classifySaved(saved(CURRENT_VERSION + 1, [])).status).toBe('unsupported');
    // The plan's number, pinned: data v10 is the current version and 11 is the first unsupported one.
    expect(CURRENT_VERSION).toBe(10);
    expect(migrateProject(saved(11, []))).toEqual({ ok: false, reason: 'newer' });
  });
});

describe('transition repair (§8)', () => {
  it('drops a non-array field, non-object entries and entries without ids, clips or a known type', () => {
    expect(video(ok(withTr('x'))).transitions).toBeUndefined();
    expect(video(ok(withTr({ a: 1 }))).transitions).toBeUndefined();
    const list = [null, 5, tr({ id: 3 }), tr({ id: 'x', fromClipId: 7 }), tr({ id: 'y', toClipId: undefined }), tr({ id: 'z', type: 'melt' })];
    expect(video(ok(withTr(list))).transitions).toBeUndefined();
  });
  it('clamps a 9 s duration to the handles and whole even frames; a non-finite or tiny one is dropped or raised', () => {
    const t = video(ok(withTr([tr({ duration: 9 })]))).transitions![0];
    expect(t.duration).toBeLessThanOrEqual(2 + 1e-9);
    expect(Math.round(t.duration * 30) % 2).toBe(0);
    expect(video(ok(withTr([tr({ duration: NaN })]))).transitions).toBeUndefined();
    expect(video(ok(withTr([tr({ duration: 0.001 })]))).transitions![0].duration).toBeCloseTo(2 / 30, 9);
  });
  it('a clip with no handle at the cut drops the transition (missing media: handle 0)', () => {
    const s = withTr([tr()]);
    s.media = {};
    expect(video(ok(s)).transitions).toBeUndefined();
  });
  it('repairs the ease to the allowed subset and clamps bezier y to [0, 1]', () => {
    expect(video(ok(withTr([tr({ ease: { kind: 'bounce' } })]))).transitions![0].ease).toEqual({ kind: 'linear' });
    expect(video(ok(withTr([tr({ ease: 'nonsense' })]))).transitions![0].ease).toEqual({ kind: 'linear' });
    const e = video(ok(withTr([tr({ ease: { kind: 'bezier', bezier: [0.2, -1, 0.8, 2] } })]))).transitions![0].ease;
    expect(e.bezier![1]).toBe(0);
    expect(e.bezier![3]).toBe(1);
  });
  it('repairs direction, softness, amount and the audio law per type; unknown fields are kept', () => {
    const w = video(ok(withTr([tr({ type: 'wipe', direction: 'sideways', softness: 9, audio: 'loud', note: 'keep' })]))).transitions![0];
    expect(w.direction).toBe('left');
    expect(w.softness).toBe(0.5);
    expect(w).not.toHaveProperty('audio');
    expect((w as unknown as Record<string, unknown>).note).toBe('keep');
    expect(video(ok(withTr([tr({ type: 'zoom', amount: 99, audio: 'gain' })]))).transitions![0]).toMatchObject({ amount: 4, audio: 'gain' });
    expect(video(ok(withTr([tr({ type: 'zoom', amount: 'x' })]))).transitions![0].amount).toBe(2);
    expect(video(ok(withTr([tr({ type: 'glitch', amount: 7 })]))).transitions![0].amount).toBe(1);
  });
  it('drops non-adjacent, cross-track, adjustment and kind-mismatched pairs', () => {
    const far = base('b', 'video', { start: 5, in: 0.5, out: 2 });
    expect(video(ok(withTr([tr()], 9, [a, far]))).transitions).toBeUndefined();
    const adj = base('b', 'adjustment', { start: 1.5, in: 0, out: 1 });
    expect(video(ok(withTr([tr()], 9, [a, adj]))).transitions).toBeUndefined();
    const s = withTr([tr({ toClipId: 'z' })]);
    (s.tracks as Record<string, unknown>[])[1].clips = [base('z', 'audio', { start: 1.5 })];
    expect(video(ok(s)).transitions).toBeUndefined();
    const audio = withTr([tr({ type: 'audio' })]);
    expect(video(ok(audio)).transitions).toBeUndefined(); // an audio-type transition on a video track
  });
  it('keeps the first of two transitions on one cut and re-issues a duplicate id', () => {
    const p = ok(withTr([tr({ id: 'k', duration: 1 }), tr({ id: 'k2', type: 'wipe' })]));
    expect(video(p).transitions).toHaveLength(1);
    expect(video(p).transitions![0].id).toBe('k');
    const c = base('c', 'video', { start: 3, in: 0.5, out: 2 });
    const two = ok(withTr([tr({ id: 'same', duration: 0.5 }), tr({ id: 'same', fromClipId: 'b', toClipId: 'c', duration: 0.5 })], 9, [a, b, c]));
    const ids = video(two).transitions!.map((t) => t.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
  it('an empty list removes the field; the input is never mutated', () => {
    expect(video(ok(withTr([]))).transitions).toBeUndefined();
    const raw = withTr([tr({ duration: 9, ease: { kind: 'bounce' } })]);
    const snap = JSON.stringify(raw);
    ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
  });
});
