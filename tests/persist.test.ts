import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const kv = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('idb-keyval', () => kv);

import { emptyProject } from '../src/core/model';
import { loadProject, saveProject } from '../src/state/persist';

beforeEach(() => {
  kv.get.mockReset();
  kv.set.mockReset();
  vi.stubGlobal('indexedDB', {});
});
afterEach(() => vi.unstubAllGlobals());

describe('persist', () => {
  it('saveProject writes under clipforge:current', async () => {
    const p = emptyProject();
    await saveProject(p);
    expect(kv.set).toHaveBeenCalledWith('clipforge:current', p);
  });

  it('loadProject reports a verified-absent key as none', async () => {
    kv.get.mockResolvedValue(undefined);
    expect(await loadProject()).toEqual({ status: 'none' });
    expect(kv.get).toHaveBeenCalledWith('clipforge:current');
  });

  it('loadProject reports a newer version as unsupported, never as absent', async () => {
    kv.get.mockResolvedValue({ ...emptyProject(), version: 2 });
    expect(await loadProject()).toEqual({ status: 'unsupported', reason: expect.stringContaining('newer version') });
  });

  it.each([null, 42, 'x', { version: 1 }, { version: 1, format: {}, tracks: 'no', media: {} }])(
    'loadProject reports a malformed value (%j) as unsupported',
    async (v) => {
      kv.get.mockResolvedValue(v);
      expect((await loadProject()).status).toBe('unsupported');
    },
  );

  it('loadProject returns the stored project', async () => {
    const p = emptyProject();
    kv.get.mockResolvedValue(p);
    expect(await loadProject()).toEqual({ status: 'ok', project: p });
  });

  it('loadProject lets read failures reject (the caller must not treat them as "no project")', async () => {
    kv.get.mockRejectedValue(new DOMException('backing store', 'UnknownError'));
    await expect(loadProject()).rejects.toThrow('backing store');
  });

  it('is a no-op without indexedDB', async () => {
    vi.unstubAllGlobals();
    await saveProject(emptyProject());
    expect(await loadProject()).toEqual({ status: 'unavailable' });
    expect(kv.set).not.toHaveBeenCalled();
    expect(kv.get).not.toHaveBeenCalled();
  });
});
