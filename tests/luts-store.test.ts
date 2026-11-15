import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emptyProject } from '../src/core/model';
import type { Project } from '../src/core/model';
import { commit, createHistory } from '../src/state/history';

const store = vi.hoisted(() => ({
  listLutIds: vi.fn<() => Promise<string[]>>(),
  removeLutFile: vi.fn<(id: string) => Promise<void>>(),
  unsettledLuts: vi.fn(() => new Set<string>()),
  putLutText: vi.fn<(id: string, text: string) => Promise<void>>(),
}));
vi.mock('../src/media/luts', () => store);
vi.mock('../src/media/storage', () => ({ listMediaIds: vi.fn(), removeMedia: vi.fn(), unsettledMedia: vi.fn(() => new Set()) }));

import { gcLuts, referencedLuts } from '../src/media/gc';
import { MAX_LUT_BYTES, importLut } from '../src/media/lutImport';

const withLuts = (...ids: string[]): Project => ({ ...emptyProject(), luts: Object.fromEntries(ids.map((id) => [id, { id, name: id, size: 33 }])) });

beforeEach(() => {
  store.listLutIds.mockReset().mockResolvedValue(['a', 'b', 'c']);
  store.removeLutFile.mockReset().mockResolvedValue(undefined);
  store.putLutText.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('referencedLuts', () => {
  it('collects ids from the present state, every undo state, every redo state and effect refs', () => {
    let h = createHistory(withLuts('a'));
    h = commit(h, withLuts('a', 'b'));
    h = commit(h, withLuts());
    h = { ...h, future: [withLuts('d')] };
    const orphan: Project = { ...withLuts(), tracks: [{ ...emptyProject().tracks[0], clips: [{ id: 'c', mediaId: 'm', kind: 'image', start: 0, in: 0, out: 1, volume: 1, fit: 'fit', transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] }, fx: [{ id: 'e', type: 'lut', enabled: false, params: {}, ref: 'z' }] }] }] };
    h = { ...h, past: [...h.past, orphan] };
    expect([...referencedLuts(h)].sort()).toEqual(['a', 'b', 'd', 'z']);
  });
});

describe('gcLuts', () => {
  it('refuses an empty reference set unless the caller vouches for it', async () => {
    expect(await gcLuts(() => new Set())).toEqual([]);
    expect(store.listLutIds).not.toHaveBeenCalled();
    expect(await gcLuts(() => new Set(), { emptyIsVerified: true })).toEqual(['a', 'b', 'c']);
  });

  it('removes only unreferenced files and spares ones still being imported', async () => {
    store.unsettledLuts.mockReturnValue(new Set(['c']));
    expect(await gcLuts(() => new Set(['b']))).toEqual(['a']);
  });

  it('keeps going when a removal fails and never throws, even when listing fails', async () => {
    store.removeLutFile.mockImplementation(async (id) => {
      if (id !== 'b') throw new DOMException('locked', 'NoModificationAllowedError');
    });
    expect(await gcLuts(() => new Set(['x']))).toEqual(['b']);
    store.listLutIds.mockRejectedValue(new Error('no opfs'));
    expect(await gcLuts(() => new Set(['x']))).toEqual([]);
  });
});

describe('importLut', () => {
  const cube = 'TITLE "Warm"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
  const file = (text: string, name = 'warm.cube'): File => new File([text], name);

  it('validates, stores the text and returns a library entry named from TITLE, else the file name', async () => {
    const ref = await importLut(file(cube));
    expect(ref).toMatchObject({ name: 'Warm', size: 2 });
    expect(store.putLutText).toHaveBeenCalledWith(ref.id, cube);
    const plain = await importLut(file(cube.replace('TITLE "Warm"\n', ''), 'Teal Look.cube'));
    expect(plain.name).toBe('Teal Look');
  });

  it('refuses a bad file with the parser reason and stores nothing', async () => {
    await expect(importLut(file('LUT_1D_SIZE 2\n0 0 0\n1 1 1\n'))).rejects.toThrow(/1D/);
    expect(store.putLutText).not.toHaveBeenCalled();
  });

  it('refuses a file over the size limit before reading it', async () => {
    const big = { size: MAX_LUT_BYTES + 1, name: 'x.cube', text: vi.fn() } as unknown as File;
    await expect(importLut(big)).rejects.toThrow(/20 MB/);
    expect(big.text).not.toHaveBeenCalled();
  });
});
