// Plan 5B Task 9: the personal preset library record (fake IndexedDB): a newer or malformed record is read-only and
// `set` is NEVER called; caps (100 presets, 64 kB); rename / delete / favourites; serialised writers.
import { describe, expect, it } from 'vitest';
import { copyAnimation } from '../src/core/animPayload';
import { presetFromAnimation } from '../src/core/userPresets';
import type { UserPreset } from '../src/core/userPresets';
import { LIBRARY_KEY, LibraryError, MAX_PRESETS, classifyLibrary, createLibrary } from '../src/state/presetLibrary';
import type { KV } from '../src/state/presetLibrary';
import { k, pk, project } from './anim-transfer.fixtures';

function fake(initial?: unknown) {
  const calls = { get: 0, set: 0, update: 0 };
  let value = initial;
  const kv: KV = {
    get: async (key) => { calls.get++; expect(key).toBe(LIBRARY_KEY); return value; },
    set: async (key, v) => { calls.set++; expect(key).toBe(LIBRARY_KEY); value = v; },
    // Atomic like idb-keyval's update: read, run the updater, write only if it returns; a throw writes nothing.
    update: async (key, fn) => { calls.update++; expect(key).toBe(LIBRARY_KEY); const next = fn(value); if (next !== value) { calls.set++; value = next; } },
  };
  return { kv, calls, value: () => value };
}

const preset = (name = 'Glide', id = 'p1'): UserPreset => {
  const p = project({ V: { keys: { position: [pk(0, 0, 0), pk(1, 100, 0)], opacity: [k(0, 0), k(1, 1)] } } });
  return presetFromAnimation(copyAnimation(p, 'V'), name, 'in', 1, id);
};
const fails = async (p: Promise<unknown>): Promise<string> => {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(LibraryError); return (e as Error).message; }
  throw new Error('expected a LibraryError');
};

describe('classifyLibrary', () => {
  it('absent = empty and ok; a valid v1 record is ok', () => {
    expect(classifyLibrary(undefined)).toEqual({ status: 'ok', record: { version: 1, presets: [], favourites: [] } });
    const rec = { version: 1, presets: [preset()], favourites: [{ slot: 'in', key: 'fade' }, { user: 'p1' }] };
    expect(classifyLibrary(rec)).toEqual({ status: 'ok', record: rec });
  });

  it('a newer version and every malformed shape are read-only', () => {
    for (const v of [{ version: 2, presets: [], favourites: [] }, 'x', 5, null, [], { version: 1 }, { version: 1, presets: 'a', favourites: [] },
      { version: 1, presets: [{ id: 1 }], favourites: [] }, { version: 1, presets: [], favourites: [{ nope: 1 }] }, { version: 0, presets: [], favourites: [] }, { presets: [], favourites: [] }]) {
      expect(classifyLibrary(v).status, JSON.stringify(v)).toBe('readOnly');
    }
    expect(classifyLibrary({ version: 2 })).toMatchObject({ reason: expect.stringContaining('newer version') });
  });
});

describe('createLibrary: never overwrites an unusable record', () => {
  const stored = [{ version: 2, presets: [], favourites: [], extra: 'future' }, { version: 1, presets: [{ broken: true }], favourites: [] }, 'garbage'];
  for (const v of stored) {
    it(`read-only for ${JSON.stringify(v).slice(0, 40)}: every writer refuses and set is never called`, async () => {
      const f = fake(v);
      const lib = createLibrary(f.kv, () => true);
      expect((await lib.load()).status).toBe('readOnly');
      expect(await fails(lib.save(preset()))).toMatch(/read-only/);
      expect(await fails(lib.rename('p1', 'x'))).toMatch(/read-only/);
      expect(await fails(lib.remove('p1'))).toMatch(/read-only/);
      expect(await fails(lib.setFavourite({ user: 'p1' }, true))).toMatch(/read-only/);
      expect(f.calls.set).toBe(0);
      expect(f.value()).toBe(v);
    });
  }

  it('unavailable without IndexedDB: refuses, no storage call', async () => {
    const f = fake();
    const lib = createLibrary(f.kv, () => false);
    expect((await lib.load()).status).toBe('unavailable');
    expect(await fails(lib.save(preset()))).toMatch(/no storage/);
    expect(f.calls.get + f.calls.set + f.calls.update).toBe(0);
  });
});

describe('createLibrary: operations', () => {
  it('save, rename, favourite, delete (a deleted preset leaves the favourites)', async () => {
    const f = fake();
    const lib = createLibrary(f.kv, () => true);
    await lib.save(preset('A', 'a'));
    await lib.save(preset('B', 'b'));
    await lib.setFavourite({ user: 'a' }, true);
    await lib.setFavourite({ slot: 'in', key: 'fade' }, true);
    let s = await lib.load();
    expect(s.status === 'ok' && s.record.presets.map((p) => p.name)).toEqual(['A', 'B']);
    await lib.rename('a', '  Renamed ');
    s = await lib.load();
    expect(s.status === 'ok' && s.record.presets[0].name).toBe('Renamed');
    expect(await fails(lib.rename('zz', 'x'))).toMatch(/no longer exists/);
    await lib.remove('a');
    s = await lib.load();
    expect(s.status === 'ok' && s.record.presets.map((p) => p.id)).toEqual(['b']);
    expect(s.status === 'ok' && s.record.favourites).toEqual([{ slot: 'in', key: 'fade' }]);
    const writes = f.calls.set;
    await lib.setFavourite({ slot: 'in', key: 'fade' }, true); // already a favourite: no write
    await lib.remove('nope'); // nothing to remove: no write
    await lib.setFavourite({ user: 'q' }, false);
    expect(f.calls.set).toBe(writes);
    await lib.setFavourite({ slot: 'in', key: 'fade' }, false);
    s = await lib.load();
    expect(s.status === 'ok' && s.record.favourites).toEqual([]);
  });

  it('caps: 100 presets and 64 kB each; the names are validated', async () => {
    const f = fake({ version: 1, presets: Array.from({ length: MAX_PRESETS }, (_, i) => preset('n', `i${i}`)), favourites: [] });
    const lib = createLibrary(f.kv, () => true);
    expect(await fails(lib.save(preset('x', 'new')))).toMatch(/at most 100/);
    expect(f.calls.set).toBe(0);
    const g = fake();
    const small = createLibrary(g.kv, () => true);
    const big = preset();
    big.payload.keys!.opacity = Array.from({ length: 500 }, (_, i) => ({ t: i, v: 0.5, ease: { kind: 'linear' as const } }));
    big.payload.keys!.scale = Array.from({ length: 500 }, (_, i) => ({ t: i, v: 0.5, ease: { kind: 'linear' as const } }));
    big.payload.keys!.rotation = Array.from({ length: 500 }, (_, i) => ({ t: i, v: 0.5, ease: { kind: 'linear' as const } }));
    big.payload.keys!.position = Array.from({ length: 500 }, (_, i) => ({ t: i, x: 1, y: 2, ease: { kind: 'linear' as const } }));
    expect(JSON.stringify(big).length).toBeGreaterThan(64 * 1024);
    expect(await fails(small.save(big))).toMatch(/too large/);
    expect(g.calls.set).toBe(0);
  });

  it('the 64 kB cap counts bytes, not UTF-16 units', async () => {
    const f = fake();
    const lib = createLibrary(f.kv, () => true);
    const wide = preset();
    // 3-byte characters: the UTF-16 length stays under the cap while the bytes pass it.
    wide.id = '\u20ac'.repeat(30000);
    expect(JSON.stringify(wide).length).toBeLessThan(64 * 1024);
    expect(new TextEncoder().encode(JSON.stringify(wide)).length).toBeGreaterThan(64 * 1024);
    expect(await fails(lib.save(wide))).toMatch(/too large/);
    expect(f.calls.set).toBe(0);
  });

  it('two tabs: each write is one atomic update that sees the other tab\'s record (no lost preset)', async () => {
    const f = fake();
    const tabA = createLibrary(f.kv, () => true);
    const tabB = createLibrary(f.kv, () => true);
    await Promise.all([tabA.save(preset('A', 'a')), tabB.save(preset('B', 'b'))]);
    const s = await tabA.load();
    expect(s.status === 'ok' && s.record.presets.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(f.calls.update).toBe(2);
  });

  it('a newer-version record written by another tab is refused inside the updater (no write)', async () => {
    const f = fake({ version: 2, presets: [], favourites: [] });
    const lib = createLibrary(f.kv, () => true);
    expect(await fails(lib.save(preset()))).toMatch(/read-only/);
    expect(f.calls.set).toBe(0);
  });

  it('classifyLibrary rejects presets whose key lists are damaged', () => {
    const base = preset();
    const bad = (mut: (p: UserPreset) => void): unknown => { const p = structuredClone(base); mut(p); return { version: 1, presets: [p], favourites: [] }; };
    const keys = (p: UserPreset) => p.payload.keys as Record<string, unknown>;
    expect(classifyLibrary(bad(() => {})).status).toBe('ok');
    expect(classifyLibrary(bad((p) => { keys(p).position = 5; })).status).toBe('readOnly');
    expect(classifyLibrary(bad((p) => { keys(p).opacity = [{ t: 'x', v: 1 }]; })).status).toBe('readOnly');
    expect(classifyLibrary(bad((p) => { keys(p).scale = []; })).status).toBe('readOnly');
    expect(classifyLibrary(bad((p) => { p.payload.effects = [{ type: 'colour', occurrence: 0, keys: { brightness: 'no' } }] as never; })).status).toBe('readOnly');
    expect(classifyLibrary(bad((p) => { (p.payload as unknown as Record<string, unknown>).motion = 3; })).status).toBe('readOnly');
  });

  it('writers run one at a time: concurrent saves lose nothing', async () => {
    const f = fake();
    const lib = createLibrary(f.kv, () => true);
    await Promise.all(Array.from({ length: 8 }, (_, i) => lib.save(preset(`P${i}`, `id${i}`))));
    const s = await lib.load();
    expect(s.status === 'ok' && s.record.presets.map((p) => p.id)).toEqual(Array.from({ length: 8 }, (_, i) => `id${i}`));
  });
});
