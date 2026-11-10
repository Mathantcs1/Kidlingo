// Single-tab ownership of the editor: autosave, media GC and export temp cleanup all touch storage shared by every
// tab of the origin, so only the tab holding this Web Lock may run them.

/**
 * 'held': this tab owns the editor; 'locked': another tab does; 'unsupported': no Web Locks (assume one tab, but
 * never prove it: no startup GC); 'error': the lock request failed (editing allowed, no GC or temp cleanup).
 */
export type LockState = 'pending' | 'held' | 'locked' | 'unsupported' | 'error';

const NAME = 'clipforge-editor';
let state: LockState = 'pending';

export function lockState(): LockState {
  return state;
}

/**
 * True unless another tab may own the editor ('pending' counts as ours: nothing can run before the session starts).
 * Export temp cleanup checks this; startup media GC needs 'held' (see ui/restoreOutcome).
 */
export function mayTouchSharedStorage(): boolean {
  return state !== 'locked' && state !== 'error';
}

/**
 * Takes the editor lock for the life of the page if no other tab holds it (never waits for the answer). When
 * another tab holds it, also queues a blocking request whose grant (the other tab closed) calls `onFreed` — by
 * default a reload, so this tab takes over by itself. Without `navigator.locks` the editor proceeds as
 * 'unsupported'; a failing request gives 'error'.
 */
export function acquireEditorLock(
  locks: LockManager | undefined = typeof navigator !== 'undefined' ? navigator.locks : undefined,
  onFreed: () => void = () => location.reload(),
): Promise<LockState> {
  if (!locks) return Promise.resolve((state = 'unsupported'));
  return new Promise((resolve) => {
    locks
      .request(NAME, { ifAvailable: true }, (lock) => {
        state = lock ? 'held' : 'locked';
        resolve(state);
        if (!lock) waitForRelease(locks, onFreed);
        // Holding the returned promise forever keeps the lock until the page goes away.
        return lock ? new Promise<void>(() => undefined) : undefined;
      })
      .catch((e: unknown) => {
        console.error('clipforge: could not take the editor lock', e);
        state = 'error';
        resolve(state);
      });
  });
}

/** Waits (blocking request) until the owning tab lets go, then hands over; holds the lock until the page unloads. */
function waitForRelease(locks: LockManager, onFreed: () => void): void {
  locks
    .request(NAME, () => {
      onFreed();
      return new Promise<void>(() => undefined);
    })
    .catch((e: unknown) => console.error('clipforge: waiting for the editor lock failed', e));
}
