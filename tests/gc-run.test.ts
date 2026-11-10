import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = vi.hoisted(() => ({
  listMediaIds: vi.fn<() => Promise<string[]>>(),
  removeMedia: vi.fn<(id: string) => Promise<void>>(),
  unsettledMedia: vi.fn(() => new Set<string>()),
}));
vi.mock('../src/media/storage', () => storage);

import { gcMedia } from '../src/media/gc';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  storage.listMediaIds.mockReset().mockResolvedValue(['a', 'b', 'c']);
  storage.removeMedia.mockReset().mockResolvedValue(undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('gcMedia', () => {
  it('refuses an empty referenced set unless the caller vouches for it', async () => {
    expect(await gcMedia(() => new Set())).toEqual([]);
    expect(storage.listMediaIds).not.toHaveBeenCalled();
    expect(storage.removeMedia).not.toHaveBeenCalled();
    expect(await gcMedia(() => new Set(), { emptyIsVerified: true })).toEqual(['a', 'b', 'c']);
  });

  it('removes unreferenced files', async () => {
    expect(await gcMedia(() => new Set(['b']))).toEqual(['a', 'c']);
  });

  it('keeps going when one removal fails, warns once, and never throws', async () => {
    storage.removeMedia.mockImplementation(async (id) => {
      if (id !== 'b') throw new DOMException('locked', 'NoModificationAllowedError');
    });
    expect(await gcMedia(() => new Set(['x']))).toEqual(['b']);
    expect(storage.removeMedia).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never throws when listing fails', async () => {
    storage.listMediaIds.mockRejectedValue(new Error('no opfs'));
    expect(await gcMedia(() => new Set(['x']))).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
