// Data v7 (Plan 5B Task 2): hand-edited spatial tangents, `broken`, key loops, `orient`, effect loops and spring eases
// are repaired per D14; valid data is kept exactly.
import { describe, it, expect } from 'vitest';
import { KEYED_POSITION_LIMIT } from '../src/core/keyframes';
import { repairLoop, repairTangent } from '../src/core/migrateKeys';
import { splitClip } from '../src/core/timeline';
import { base, colour, lin, ok, one, oneAudio, saved } from './migrate-v7-fixtures';

const P = KEYED_POSITION_LIMIT;
const pos = (t: number, extra: Record<string, unknown> = {}) => ({ t, x: t * 10, y: 0, ease: lin, ...extra });
const num = (t: number, v: number, ease: unknown = lin) => ({ t, v, ease });
const loop = (mode: string, count: unknown = null) => ({ mode, count });

describe('spatial tangents and broken (D6)', () => {
  it('keeps valid tangents and broken: true exactly', () => {
    const list = [pos(0, { out: { x: 30, y: -40 } }), pos(1, { in: { x: -5, y: 0 }, out: { x: 0, y: 0 }, broken: true }), pos(2)];
    expect(one(base('c', 'video', { keys: { position: list } })).keys!.position).toEqual(list);
  });

  it('drops non-finite or malformed tangents (the key stays), clamps huge ones to ±KEYED_POSITION_LIMIT', () => {
    const list = [
      pos(0, { out: { x: Number.NaN, y: 1 }, in: { x: 1 } }), pos(1, { in: 'left', out: { x: 1e12, y: -1e300 } }), pos(2, { in: [1, 2] }),
    ];
    expect(one(base('c', 'video', { keys: { position: list } })).keys!.position).toEqual([pos(0), pos(1, { out: { x: P, y: -P } }), pos(2)]);
  });

  it('drops broken unless it is exactly true', () => {
    for (const broken of ['yes', 1, false, null]) {
      expect('broken' in one(base('c', 'video', { keys: { position: [pos(0, { broken })] } })).keys!.position![0]).toBe(false);
    }
  });

  it('repairTangent', () => {
    expect(repairTangent({ x: 1, y: -2, z: 3 })).toEqual({ x: 1, y: -2 });
    expect(repairTangent({ x: -0, y: 0 })).toEqual({ x: 0, y: 0 });
    for (const junk of [undefined, null, 5, [], { x: 1, y: Infinity }, { x: '1', y: 2 }]) expect(repairTangent(junk)).toBeUndefined();
  });
});

describe('key loops (D4)', () => {
  const two = [num(0, 0), num(1, 1)];

  it('keeps valid loops of animated targets exactly', () => {
    const loops = { opacity: loop('repeat'), rotation: loop('offset', 3), position: loop('pingPong', 1000) };
    const keys = { position: [pos(0), pos(1)], rotation: two, opacity: two, loops };
    expect(one(base('c', 'video', { keys })).keys).toEqual(keys);
  });

  it('repairs count to an integer 1..1000 or null: 0, 1.5, 2000, -1, "x"', () => {
    const counts = [0, 1.5, 2000, -1, 'x', Number.NaN, undefined].map((count) => repairLoop({ mode: 'repeat', count })?.count);
    expect(counts).toEqual([1, 2, 1000, 1, null, null, null]);
  });

  it('drops loops with an unknown mode, of absent targets, of unknown properties; an emptied loops object is removed', () => {
    const keys = { opacity: two, loops: { opacity: loop('bounce'), scale: loop('repeat'), skew: loop('repeat') } };
    expect(one(base('c', 'video', { keys })).keys).toEqual({ opacity: two });
    expect(one(base('c', 'video', { keys: { opacity: two, loops: { opacity: loop('repeat'), scale: loop('repeat') } } })).keys)
      .toEqual({ opacity: two, loops: { opacity: loop('repeat') } });
    for (const junk of [null, 'repeat', [], { mode: 5 }]) expect(repairLoop(junk)).toBeUndefined();
  });

  it('adjustment clips keep only an opacity loop; audio clips lose keys and loops', () => {
    const keys = { opacity: two, rotation: two, loops: { opacity: loop('repeat'), rotation: loop('repeat') } };
    expect(one(base('adj', 'adjustment', { keys })).keys).toEqual({ opacity: two, loops: { opacity: loop('repeat') } });
    expect('keys' in oneAudio(base('a', 'audio', { keys }))).toBe(false);
  });

  it('effect loops: kept for keyed animatable params, dropped otherwise; an emptied loops object is removed', () => {
    const fx = colour({ keys: { brightness: two }, loops: { brightness: loop('pingPong', 2), contrast: loop('repeat'), bogus: loop('repeat') } });
    expect(one(base('c', 'video', { effects: [fx] })).effects[0]).toEqual(colour({ keys: { brightness: two }, loops: { brightness: loop('pingPong', 2) } }));
    expect('loops' in one(base('c', 'video', { effects: [colour({ loops: { brightness: loop('repeat') } })] })).effects[0]).toBe(false);
    expect(oneAudio(base('a', 'audio', { effects: [fx] })).effects).toEqual([]);
  });
});

describe('orient along path (D7)', () => {
  it('keeps orient: true with position keys; drops anything else and orient without position keys', () => {
    const position = [pos(0), pos(1)];
    expect(one(base('c', 'video', { keys: { position, orient: true } })).keys).toEqual({ position, orient: true });
    for (const orient of [1, 'true', false, null]) expect(one(base('c', 'video', { keys: { position, orient } })).keys).toEqual({ position });
    expect(one(base('c', 'video', { keys: { opacity: [num(0, 1)], orient: true } })).keys).toEqual({ opacity: [num(0, 1)] });
    expect('keys' in one(base('c', 'video', { keys: { orient: true, loops: { position: loop('repeat') } } }))).toBe(false);
  });
});

describe('spring eases on keys (D5)', () => {
  const spring = (s: unknown) => ({ kind: 'spring', spring: s });
  const eased = (e: unknown) => one(base('c', 'video', { keys: { scale: [num(0, 1, e), num(1, 2)] } })).keys!.scale![0].ease;

  it('keeps valid spring params exactly', () => {
    expect(eased(spring({ stiffness: 180, damping: 12, mass: 1 }))).toEqual(spring({ stiffness: 180, damping: 12, mass: 1 }));
    expect(eased(spring({ stiffness: 1000, damping: 0, mass: 0.1 }))).toEqual(spring({ stiffness: 1000, damping: 0, mass: 0.1 }));
  });

  it('NaN params => defaults; out of range => clamped; missing => defaults', () => {
    expect(eased(spring({ stiffness: Number.NaN, damping: Number.NaN, mass: Number.NaN }))).toEqual(spring({ stiffness: 170, damping: 26, mass: 1 }));
    expect(eased(spring({ stiffness: 1e6, damping: -1, mass: 50 }))).toEqual(spring({ stiffness: 1000, damping: 0, mass: 10 }));
    expect(eased(spring({ stiffness: 0 }))).toEqual(spring({ stiffness: 1, damping: 26, mass: 1 }));
    expect(eased({ kind: 'spring' })).toEqual(spring({ stiffness: 170, damping: 26, mass: 1 }));
    expect(eased(spring('bouncy'))).toEqual(spring({ stiffness: 170, damping: 26, mass: 1 }));
  });
});

describe('clip operations keep v7 data (Tasks 3-5 rules)', () => {
  it('split keeps loops, orient, tangents, effect loops on both halves, the entrance on the left (D12); the result re-migrates unchanged', () => {
    const two = [num(0, 0), num(2, 1)];
    const keys = { position: [pos(0, { out: { x: 5, y: 5 } }), pos(2, { in: { x: -5, y: 0 }, broken: true })], opacity: two, loops: { opacity: loop('repeat', 2) }, orient: true };
    const fx = colour({ keys: { brightness: two }, loops: { brightness: loop('offset') } });
    const motion = { in: { preset: 'fade', duration: 0.5, delay: 0, ease: { kind: 'easeOut' }, params: {} } };
    const p = ok(saved(7, [base('c', 'video', { keys, effects: [fx], motion })]));
    const q = splitClip(p, 'c', 1);
    const [left, right] = q.tracks[0].clips;
    for (const c of [left, right]) {
      expect(c.keys!.loops).toEqual({ opacity: loop('repeat', 2) });
      expect(c.keys!.orient).toBe(true);
      expect(c.effects[0].loops).toEqual({ brightness: loop('offset') });
    }
    expect(left.motion).toEqual(motion);
    expect('motion' in right).toBe(false);
    expect(left.keys!.position![0].out).toEqual({ x: 5, y: 5 });
    expect(right.keys!.position!.at(-1)).toMatchObject({ in: { x: -5, y: 0 }, broken: true });
    expect(ok(q)).toEqual(q);
  });
});
