// Data v8 (Plan 5E Task 3): v7 saves open unchanged; `{version: 9}` is newer and never overwritten; hand-edited crop,
// flip and anchor are repaired per D10. Only video and image clips keep them.
import { describe, it, expect } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { CURRENT_VERSION } from '../src/core/model';
import { classifySaved } from '../src/state/persist';
import { base, ok, one, oneAudio, saved } from './migrate-v7-fixtures';

const crop = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.1 };

describe('v7 -> v8', () => {
  it('the current version is at least 8', () => expect(CURRENT_VERSION).toBeGreaterThanOrEqual(8));

  it('opens a v7 save JSON-equal apart from the version; input not mutated; idempotent', () => {
    const raw = saved(7, [base('v1', 'video'), base('i1', 'image', { start: 2 })], [base('a1', 'audio')]);
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.version).toBe(CURRENT_VERSION);
    expect(JSON.stringify({ ...p, version: 7 })).toBe(snap);
    for (const c of p.tracks.flatMap((t) => t.clips)) expect(['crop', 'flip', 'anchor'].some((k) => k in c)).toBe(false);
    expect(JSON.stringify(ok(p))).toBe(JSON.stringify(p));
  });

  it('accepts every integer version 1..current, refuses the next as newer and never overwrites it', () => {
    for (let v = 1; v <= CURRENT_VERSION; v++) expect(migrateProject(saved(v, [])).ok).toBe(true);
    expect(migrateProject({ ...saved(CURRENT_VERSION + 1, []) })).toEqual({ ok: false, reason: 'newer' });
    expect(classifySaved({ ...saved(CURRENT_VERSION + 1, []) }).status).toBe('unsupported');
  });
});

describe('crop repair (D10)', () => {
  it('keeps a valid crop and drops an all-zero one', () => {
    expect(one(base('c', 'video', { crop }), 8).crop).toEqual(crop);
    expect(one(base('c', 'video', { crop: { left: 0, top: 0, right: 0, bottom: 0 } }), 8)).not.toHaveProperty('crop');
  });
  it('clamps edges to 0..0.95, non-finite to 0, and keeps 2 % of each axis', () => {
    const c = one(base('c', 'image', { crop: { left: -1, top: 'x', right: 5, bottom: NaN } }), 8).crop;
    expect(c).toEqual({ left: 0, top: 0, right: 0.95, bottom: 0 });
    const d = one(base('c', 'video', { crop: { left: 0.9, top: 0, right: 0.9, bottom: 0 } }), 8).crop!;
    expect(d.left + d.right).toBeCloseTo(0.98, 12);
  });
  it('drops a non-object crop and missing edges count as 0', () => {
    expect(one(base('c', 'video', { crop: 5 }), 8)).not.toHaveProperty('crop');
    expect(one(base('c', 'video', { crop: { left: 0.2 } }), 8).crop).toEqual({ left: 0.2, top: 0, right: 0, bottom: 0 });
  });
});

describe('flip repair', () => {
  it('keeps only true booleans; empty is dropped', () => {
    expect(one(base('c', 'video', { flip: { h: true, v: true } }), 8).flip).toEqual({ h: true, v: true });
    expect(one(base('c', 'video', { flip: { h: true, v: false } }), 8).flip).toEqual({ h: true });
    expect(one(base('c', 'video', { flip: { h: 1, v: 'yes' } }), 8)).not.toHaveProperty('flip');
    expect(one(base('c', 'video', { flip: true }), 8)).not.toHaveProperty('flip');
  });
});

describe('anchor repair', () => {
  it('keeps a finite anchor clamped to ±2; {0,0} and junk are dropped', () => {
    expect(one(base('c', 'video', { anchor: { x: 0.25, y: -0.5 } }), 8).anchor).toEqual({ x: 0.25, y: -0.5 });
    expect(one(base('c', 'image', { anchor: { x: 9, y: -9 } }), 8).anchor).toEqual({ x: 2, y: -2 });
    expect(one(base('c', 'video', { anchor: { x: 0, y: 0 } }), 8)).not.toHaveProperty('anchor');
    expect(one(base('c', 'video', { anchor: { x: NaN, y: 1 } }), 8)).not.toHaveProperty('anchor');
    expect(one(base('c', 'video', { anchor: [1, 2] }), 8)).not.toHaveProperty('anchor');
  });
});

describe('per kind', () => {
  it('audio, overlay and adjustment clips lose crop, flip and anchor', () => {
    const extra = { crop, flip: { h: true }, anchor: { x: 0.5, y: 0.5 } };
    const a = oneAudio(base('a1', 'audio', extra), 8);
    for (const k of ['crop', 'flip', 'anchor']) expect(a).not.toHaveProperty(k);
    const o = one(base('o1', 'overlay', { ...extra, overlay: { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#ff0000', sticker: 'heart' } }), 8);
    for (const k of ['crop', 'flip', 'anchor']) expect(o).not.toHaveProperty(k);
    const j = one(base('j1', 'adjustment', extra), 8);
    for (const k of ['crop', 'flip', 'anchor']) expect(j).not.toHaveProperty(k);
  });
  it('keeps unknown extra fields', () => {
    expect((one(base('c', 'video', { crop, extra: 7 }), 8) as unknown as { extra: number }).extra).toBe(7);
  });
});
