// Plan 5B Task 4 (D6/D7): motion path edits - tangents (smooth mirrors direction keeping length; broken moves
// independently), key position, Smooth path (Catmull-Rom), orient, the live twin; refusals and same-reference no-ops.
import { describe, expect, it } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import type { PositionKeyframe, Project, Vec } from '../src/core/model';
import {
  NO_PATH_KEY, PATH_NEEDS_KEYS, setKeyPosition, setKeyTangents, setOrient, smoothPath, withLivePath,
} from '../src/core/pathEdits';
import { clipOf, k, pk, project } from './keyframe-fixtures';

const keys3 = (): PositionKeyframe[] => [pk(2, 0, 0), pk(3, 300, 100), pk(5, 600, -200)];
const proj = (position: PositionKeyframe[] = keys3()): Project => project({ keys: { position, scale: [k(2, 1)] } });
const pos = (p: Project, id = 'c'): PositionKeyframe[] => clipOf(p, id).keys!.position!;
const len = (v: Vec) => Math.hypot(v.x, v.y);
const withPos = (p: Project, id: string, position: PositionKeyframe[]): Project =>
  ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, keys: { position } } : c)) })) });

describe('setKeyTangents', () => {
  it('sets one tangent of a smooth key: the other turns to the opposite direction and keeps its length', () => {
    const p = proj([pk(2, 0, 0), { ...pk(3, 300, 100), in: { x: -30, y: -40 }, out: { x: 10, y: 0 } }, pk(5, 600, -200)]);
    const q = setKeyTangents(p, 'c', 3, { out: { x: 0, y: 100 } });
    const key = pos(q)[1];
    expect(key.out).toEqual({ x: 0, y: 100 });
    expect(key.in!.x).toBeCloseTo(0, 12);
    expect(key.in!.y).toBeCloseTo(-50, 12); // length 50 kept, direction opposite (0, 1)
    const r = setKeyTangents(p, 'c', 3, { in: { x: 0, y: 7 } });
    expect(len(pos(r)[1].out!)).toBeCloseTo(10, 12);
    expect(pos(r)[1].out!.y).toBeCloseTo(-10, 12);
    // Input untouched, other keys untouched (same objects).
    expect(pos(p)[1].in).toEqual({ x: -30, y: -40 });
    expect(pos(q)[0]).toBe(pos(p)[0]);
  });

  it('a broken key moves each tangent alone; clearing broken re-aligns in to out; both given = as given', () => {
    const p = proj([pk(2, 0, 0), { ...pk(3, 300, 100), in: { x: -30, y: -40 }, out: { x: 10, y: 0 } }, pk(5, 600, -200)]);
    const b = setKeyTangents(p, 'c', 3, { out: { x: 0, y: 100 }, broken: true });
    expect(pos(b)[1]).toMatchObject({ in: { x: -30, y: -40 }, out: { x: 0, y: 100 }, broken: true });
    const b2 = setKeyTangents(b, 'c', 3, { in: { x: 5, y: 5 } });
    expect(pos(b2)[1]).toMatchObject({ in: { x: 5, y: 5 }, out: { x: 0, y: 100 }, broken: true });
    const s = setKeyTangents(b2, 'c', 3, { broken: false });
    expect(pos(s)[1].broken).toBeUndefined();
    expect(pos(s)[1].in!.x).toBeCloseTo(0, 12);
    expect(pos(s)[1].in!.y).toBeCloseTo(-Math.hypot(5, 5), 12);
    const both = setKeyTangents(p, 'c', 3, { in: { x: 1, y: 2 }, out: { x: 3, y: 4 } });
    expect(pos(both)[1]).toMatchObject({ in: { x: 1, y: 2 }, out: { x: 3, y: 4 } });
  });

  it('null removes; a zero tangent is no tangent; values are clamped; a smooth partner without length stays absent', () => {
    const p = proj();
    const q = setKeyTangents(p, 'c', 3, { out: { x: 50, y: 0 } });
    expect(pos(q)[1].out).toEqual({ x: 50, y: 0 });
    expect('in' in pos(q)[1]).toBe(false);
    expect('out' in pos(setKeyTangents(q, 'c', 3, { out: null }))[1]).toBe(false);
    expect('out' in pos(setKeyTangents(q, 'c', 3, { out: { x: 0, y: -0 } }))[1]).toBe(false);
    expect(pos(setKeyTangents(p, 'c', 3, { out: { x: 1e9, y: -1e9 } }))[1].out).toEqual({ x: 1e7, y: -1e7 });
  });

  it('same project for no-ops; key found within KEY_EPS of u', () => {
    const p = proj([pk(2, 0, 0), { ...pk(3, 300, 100), out: { x: 10, y: 0 } }, pk(5, 600, -200)]);
    expect(setKeyTangents(p, 'c', 3, { out: { x: 10, y: 0 } })).toBe(p);
    expect(setKeyTangents(p, 'c', 3, {})).toBe(p);
    expect(setKeyTangents(p, 'c', 3, { broken: false })).toBe(p);
    expect(setKeyTangents(p, 'c', 2, { in: null })).toBe(p);
    expect(pos(setKeyTangents(p, 'c', 3 + 5e-5, { out: { x: 20, y: 0 } }))[1].out).toEqual({ x: 20, y: 0 });
  });

  it('refusals: locked track, adjustment, audio, no key at u, non-finite tangents', () => {
    const p = proj();
    const locked = withPos(p, 'lc', keys3());
    expect(() => setKeyTangents(locked, 'lc', 3, { out: { x: 1, y: 0 } })).toThrow(/locked/i);
    expect(() => setKeyTangents(p, 'adj', 0, { out: { x: 1, y: 0 } })).toThrow('Adjustment layers only animate opacity');
    expect(() => setKeyTangents(p, 'ac', 0, { out: { x: 1, y: 0 } })).toThrow('Audio clips cannot be animated');
    expect(() => setKeyTangents(p, 'c', 4, { out: { x: 1, y: 0 } })).toThrow(NO_PATH_KEY);
    expect(() => setKeyTangents(p, 'o', 0, { out: { x: 1, y: 0 } })).toThrow(NO_PATH_KEY);
    expect(() => setKeyTangents(p, 'c', 3, { out: { x: NaN, y: 0 } })).toThrow('Invalid tangent');
    expect(() => setKeyTangents(p, 'c', 3, { in: { x: 0, y: Infinity } })).toThrow('Invalid tangent');
  });
});

describe('setKeyPosition', () => {
  it('moves one key keeping its time, ease and tangents (fresh tangent objects); clamps; no-op; refusals', () => {
    const p = proj([pk(2, 0, 0), { ...pk(3, 300, 100, { kind: 'easeIn' }), in: { x: -5, y: 0 }, out: { x: 5, y: 0 }, broken: true }]);
    const q = setKeyPosition(p, 'c', 3, { x: -40, y: 60 });
    expect(pos(q)[1]).toEqual({ t: 3, x: -40, y: 60, ease: { kind: 'easeIn' }, in: { x: -5, y: 0 }, out: { x: 5, y: 0 }, broken: true });
    expect(pos(q)[1].in).not.toBe(pos(p)[1].in);
    expect(setKeyPosition(p, 'c', 3, { x: 300, y: 100 })).toBe(p);
    expect(pos(setKeyPosition(p, 'c', 3, { x: 1e9, y: -1e9 }))[1]).toMatchObject({ x: 4 * 1920, y: -4 * 1080 });
    expect(() => setKeyPosition(p, 'c', 3, { x: NaN, y: 0 })).toThrow('Invalid value');
    expect(() => setKeyPosition(p, 'c', 2.5, { x: 0, y: 0 })).toThrow(NO_PATH_KEY);
    expect(() => setKeyPosition(withPos(p, 'lc', keys3()), 'lc', 3, { x: 0, y: 0 })).toThrow(/locked/i);
    expect(() => setKeyPosition(p, 'adj', 0, { x: 0, y: 0 })).toThrow('Adjustment layers only animate opacity');
  });
});

describe('smoothPath (Catmull-Rom)', () => {
  it('each inner key: tangents along prev → next, one third of the chord to its own neighbour; ends towards their neighbour', () => {
    const q = smoothPath(proj(), 'c');
    const [a, b, c] = pos(q);
    expect('in' in a).toBe(false);
    expect(a.out).toEqual({ x: 100, y: 100 / 3 });
    const d = { x: 600 / Math.hypot(600, -200), y: -200 / Math.hypot(600, -200) };
    const lin = Math.hypot(300, 100) / 3;
    const lout = Math.hypot(300, -300) / 3;
    expect(b.in!.x).toBeCloseTo(-d.x * lin, 12);
    expect(b.in!.y).toBeCloseTo(-d.y * lin, 12);
    expect(b.out!.x).toBeCloseTo(d.x * lout, 12);
    expect(b.out!.y).toBeCloseTo(d.y * lout, 12);
    expect(c.in).toEqual({ x: -100, y: 100 });
    expect('out' in c).toBe(false);
    // Evenly spaced collinear keys keep the even thirds (the path stays the straight line).
    const line = pos(smoothPath(proj([pk(0, 0, 0), pk(1, 100, 0), pk(2, 200, 0)]), 'c'));
    expect(line[1]).toMatchObject({ in: { x: -100 / 3, y: 0 }, out: { x: 100 / 3, y: 0 } });
  });
  it('corners become smooth; a key between coincident neighbours gets no tangents; idempotent (same project)', () => {
    const p = proj([pk(2, 0, 0), { ...pk(3, 50, 50), broken: true, in: { x: 1, y: 1 } }, pk(4, 0, 0)]);
    const q = smoothPath(p, 'c');
    expect(pos(q)[1]).toEqual({ t: 3, x: 50, y: 50, ease: { kind: 'linear' } });
    expect(smoothPath(q, 'c')).toBe(q);
  });
  it('refusals: fewer than two keys, locked, adjustment', () => {
    expect(() => smoothPath(proj([pk(2, 0, 0)]), 'c')).toThrow(PATH_NEEDS_KEYS);
    expect(() => smoothPath(project(), 'c')).toThrow(PATH_NEEDS_KEYS);
    expect(() => smoothPath(withPos(proj(), 'lc', keys3()), 'lc')).toThrow(/locked/i);
    expect(() => smoothPath(proj(), 'adj')).toThrow('Adjustment layers only animate opacity');
  });
});

describe('setOrient', () => {
  it('on/off with two position keys; no-ops; refusals', () => {
    const p = proj();
    const on = setOrient(p, 'c', true);
    expect(clipOf(on, 'c').keys).toEqual({ position: keys3(), scale: [k(2, 1)], orient: true });
    expect(setOrient(on, 'c', true)).toBe(on);
    const off = setOrient(on, 'c', false);
    expect(clipOf(off, 'c').keys).toEqual({ position: keys3(), scale: [k(2, 1)] });
    expect(setOrient(p, 'c', false)).toBe(p);
    const plain = project();
    expect(setOrient(plain, 'c', false)).toBe(plain);
    expect(() => setOrient(proj([pk(2, 0, 0)]), 'c', true)).toThrow(PATH_NEEDS_KEYS);
    expect(() => setOrient(withPos(p, 'lc', keys3()), 'lc', true)).toThrow(/locked/i);
    expect(() => setOrient(p, 'adj', true)).toThrow('Adjustment layers only animate opacity');
    expect(() => setOrient(p, 'ac', true)).toThrow('Audio clips cannot be animated');
  });
});

describe('withLivePath (drag preview)', () => {
  it('equals the committed edit, ignores the lock, never throws', () => {
    const p = proj();
    expect(withLivePath(p, 'c', { u: 3, xy: { x: 9, y: 8 } })).toEqual(setKeyPosition(p, 'c', 3, { x: 9, y: 8 }));
    expect(withLivePath(p, 'c', { u: 3, tangents: { out: { x: 9, y: 8 } } })).toEqual(setKeyTangents(p, 'c', 3, { out: { x: 9, y: 8 } }));
    const locked = withPos(p, 'lc', keys3());
    expect(pos(withLivePath(locked, 'lc', { u: 3, xy: { x: 1, y: 2 } }), 'lc')[1]).toMatchObject({ x: 1, y: 2 });
    expect(withLivePath(p, 'c', { u: 3, xy: { x: 300, y: 100 } })).toBe(p);
    expect(withLivePath(p, 'c', { u: 9, xy: { x: 1, y: 1 } })).toBe(p);
    expect(withLivePath(p, 'c', { u: 3, xy: { x: NaN, y: 1 } })).toBe(p);
    expect(withLivePath(p, 'gone', { u: 3, xy: { x: 1, y: 1 } })).toBe(p);
    expect(withLivePath(p, 'adj', { u: 0, xy: { x: 1, y: 1 } })).toBe(p);
  });
});

describe('edited paths survive a reload', () => {
  it('tangents, broken, smooth and orient re-migrate to the same project (JSON-equal)', () => {
    let p = smoothPath(proj(), 'c');
    p = setKeyTangents(p, 'c', 3, { out: { x: -0, y: 12.5 }, broken: true });
    p = setKeyPosition(setOrient(p, 'c', true), 'c', 5, { x: -7, y: 8 });
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(back.ok && back.project).toEqual(JSON.parse(JSON.stringify(p)));
  });
});
