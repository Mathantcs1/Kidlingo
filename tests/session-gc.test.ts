import { describe, it, expect, vi, beforeEach } from 'vitest';

const gc = vi.hoisted(() => ({ gcMedia: vi.fn(async () => [] as string[]) }));
vi.mock('../src/media/gc', async (orig) => ({ ...(await orig<typeof import('../src/media/gc')>()), gcMedia: gc.gcMedia }));

import { acquireEditorLock } from '../src/state/tabLock';
import { collectUnusedMedia, gcPermitAfterRestore, gcPermitForNewProject, useRestoreFailure } from '../src/ui/session';
import { autosaveAfter } from '../src/ui/restoreOutcome';

/** A LockManager double that always grants. */
const freeLocks = { request: (_n: string, _o: unknown, cb: (l: unknown) => unknown) => Promise.resolve(cb({})) };

beforeEach(() => {
  gc.gcMedia.mockClear();
  useRestoreFailure.setState({ message: null, kind: null });
});

describe('collectUnusedMedia', () => {
  it('runs with a valid permit in the lock-holding tab', async () => {
    await acquireEditorLock(freeLocks as unknown as LockManager);
    await collectUnusedMedia(gcPermitAfterRestore('restored'));
    expect(gc.gcMedia).toHaveBeenCalledTimes(1);
  });

  it('refuses while a restore failure is unresolved, even with an otherwise valid permit', async () => {
    await acquireEditorLock(freeLocks as unknown as LockManager);
    const permit = gcPermitAfterRestore('restored');
    expect(permit).not.toBeNull();
    useRestoreFailure.setState({ message: 'Could not load your saved project: x', kind: 'failed' });
    await collectUnusedMedia(permit);
    await collectUnusedMedia(gcPermitForNewProject());
    expect(gc.gcMedia).not.toHaveBeenCalled();
  });

  it('gets no startup permit when the lock request failed or Web Locks are missing', async () => {
    await acquireEditorLock({ request: () => Promise.reject(new Error('x')) } as unknown as LockManager);
    expect(gcPermitAfterRestore('restored')).toBeNull();
    expect(gcPermitForNewProject()).toBeNull();
    await collectUnusedMedia(gcPermitAfterRestore('none'));
    await acquireEditorLock(undefined);
    expect(gcPermitAfterRestore('restored')).toBeNull();
    await collectUnusedMedia(gcPermitAfterRestore('restored'));
    expect(gc.gcMedia).not.toHaveBeenCalled();
  });
});

describe('autosaveAfter', () => {
  it('keeps saving only when the saved project was loaded, absent or unavailable', () => {
    expect(autosaveAfter('restored')).toBe(true);
    expect(autosaveAfter('none')).toBe(true);
    expect(autosaveAfter('unavailable')).toBe(true);
    expect(autosaveAfter('failed')).toBe(false);
    expect(autosaveAfter('skipped')).toBe(false);
  });
});
