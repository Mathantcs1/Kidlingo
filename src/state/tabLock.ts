// Single-tab ownership of the editor: autosave, media GC and export temp cleanup all touch storage shared by every
// tab of the origin, so only the tab holding this Web Lock may run them.

/** 'held': this tab owns the editor; 'locked': another tab does; 'unsupported': no Web Locks, assume one tab. */
export type LockState = 'pending' | 'held' | 'locked' | 'unsupported';

const NAME = 'clipforge-editor';
let state: LockState = 'pending';

export function lockState(): LockState {
  return state;
}

/** True unless another tab owns the editor (pending counts as ours: nothing can run before the session starts). */
export function mayTouchSharedStorage(): boolean {
  return state !== 'locked';
}

/**
 * Takes the editor lock for the life of the page if no other tab holds it (never waits). Without
 * `navigator.locks`, or if the request fails, the editor proceeds as 'unsupported' (single-tab assumption).
 */
export function acquireEditorLock(
  locks: LockManager | undefined = typeof navigator !== 'undefined' ? navigator.locks : undefined,
): Promise<LockState> {
  if (!locks) return Promise.resolve((state = 'unsupported'));
  return new Promise((resolve) => {
    locks
      .request(NAME, { ifAvailable: true }, (lock) => {
        state = lock ? 'held' : 'locked';
        resolve(state);
        // Holding the returned promise forever keeps the lock until the page goes away.
        return lock ? new Promise<void>(() => undefined) : undefined;
      })
      .catch((e: unknown) => {
        console.error('clipforge: could not take the editor lock', e);
        state = 'unsupported';
        resolve(state);
      });
  });
}
