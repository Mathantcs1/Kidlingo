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

  it('loadProject returns null when absent', async () => {
    kv.get.mockResolvedValue(undefined);
    expect(await loadProject()).toBeNull();
    expect(kv.get).toHaveBeenCalledWith('clipforge:current');
  });

  it('loadProject returns null when version !== 1', async () => {
    kv.get.mockResolvedValue({ ...emptyProject(), version: 2 });
    expect(await loadProject()).toBeNull();
  });

  it('loadProject returns the stored project', async () => {
    const p = emptyProject();
    kv.get.mockResolvedValue(p);
    expect(await loadProject()).toBe(p);
  });

  it('is a no-op without indexedDB', async () => {
    vi.unstubAllGlobals();
    await saveProject(emptyProject());
    expect(await loadProject()).toBeNull();
    expect(kv.set).not.toHaveBeenCalled();
    expect(kv.get).not.toHaveBeenCalled();
  });
});
