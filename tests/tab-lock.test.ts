import { describe, it, expect, vi } from 'vitest';
import { acquireEditorLock, lockState, mayTouchSharedStorage } from '../src/state/tabLock';

type Callback = (lock: { name: string } | null) => unknown;

/**
 * A LockManager double: one holder per name; ifAvailable requests get null while it is held; plain requests wait
 * in a queue until `release(name)` frees the lock.
 */
function fakeLocks() {
  const held = new Set<string>();
  const waiting: { name: string; cb: Callback }[] = [];
  const grant = (name: string, cb: Callback): Promise<unknown> => {
    held.add(name);
    return Promise.resolve(cb({ name }));
  };
  return {
    held,
    waiting,
    release(name: string): void {
      held.delete(name);
      const i = waiting.findIndex((w) => w.name === name);
      if (i >= 0) void grant(name, waiting.splice(i, 1)[0].cb);
    },
    request(name: string, a: { ifAvailable?: boolean } | Callback, b?: Callback): Promise<unknown> {
      const opts = typeof a === 'function' ? {} : a;
      const cb = (typeof a === 'function' ? a : b) as Callback;
      if (!held.has(name)) return grant(name, cb);
      if (opts.ifAvailable) return Promise.resolve(cb(null));
      waiting.push({ name, cb });
      return new Promise(() => undefined);
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

  it('reports locked when another tab holds it, and takes over in place once that tab lets go', async () => {
    const locks = fakeLocks();
    await acquireEditorLock(locks as unknown as LockManager);
    const freed = vi.fn();
    expect(await acquireEditorLock(locks as unknown as LockManager, freed)).toBe('locked');
    expect(freed).not.toHaveBeenCalled();
    expect(locks.waiting).toHaveLength(1);
    expect(lockState()).toBe('locked');
    locks.release('clipforge-editor');
    await Promise.resolve();
    expect(freed).toHaveBeenCalledTimes(1);
    // Taken over in place: this tab now holds the lock for good (no reload that would hand it around).
    expect(lockState()).toBe('held');
    expect(locks.held.has('clipforge-editor')).toBe(true);
  });

  it('is unsupported without navigator.locks, and error (not unsupported) when the request fails', async () => {
    expect(await acquireEditorLock(undefined)).toBe('unsupported');
    const broken = { request: () => Promise.reject(new DOMException('no', 'SecurityError')) };
    expect(await acquireEditorLock(broken as unknown as LockManager)).toBe('error');
  });

  it('allows shared-storage cleanup only when the lock is held or Web Locks are missing', async () => {
    await acquireEditorLock(fakeLocks() as unknown as LockManager);
    expect(mayTouchSharedStorage()).toBe(true);
    await acquireEditorLock(undefined);
    expect(mayTouchSharedStorage()).toBe(true);
    const broken = { request: () => Promise.reject(new Error('x')) };
    await acquireEditorLock(broken as unknown as LockManager);
    expect(mayTouchSharedStorage()).toBe(false);
  });
});
