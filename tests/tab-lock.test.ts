import { describe, it, expect } from 'vitest';
import { acquireEditorLock } from '../src/state/tabLock';

type Callback = (lock: { name: string } | null) => unknown;

/** A LockManager double: one holder per name; ifAvailable requests get null while it is held. */
function fakeLocks() {
  const held = new Set<string>();
  return {
    held,
    request(name: string, _opts: { ifAvailable?: boolean }, cb: Callback): Promise<unknown> {
      const free = !held.has(name);
      if (free) held.add(name);
      const result = Promise.resolve(cb(free ? { name } : null));
      return result.finally(() => {
        if (free) held.delete(name);
      });
    },
  };
}

describe('acquireEditorLock', () => {
  it('holds the lock for the life of the page when it is free', async () => {
    const locks = fakeLocks();
    expect(await acquireEditorLock(locks as unknown as LockManager)).toBe('held');
    await new Promise((r) => setTimeout(r, 10));
    expect(locks.held.has('clipforge-editor')).toBe(true);
  });

  it('reports locked when another tab holds it, and does not wait for it', async () => {
    const locks = fakeLocks();
    await acquireEditorLock(locks as unknown as LockManager);
    expect(await acquireEditorLock(locks as unknown as LockManager)).toBe('locked');
  });

  it('proceeds as unsupported without navigator.locks or when the request fails', async () => {
    expect(await acquireEditorLock(undefined)).toBe('unsupported');
    const broken = { request: () => Promise.reject(new DOMException('no', 'SecurityError')) };
    expect(await acquireEditorLock(broken as unknown as LockManager)).toBe('unsupported');
  });
});
