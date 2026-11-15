// Autosave (split out of store.ts, Plan 5C Task 1): debounced 500 ms on history.present change only; no-op without
// IndexedDB or while disabled (a tab that does not hold the editor lock never writes the shared saved project).
import type { Project } from '../core/model';
import { describeStorageError } from '../media/storageErrors';
import { saveProject } from './persist';

/** The slice of the editor store autosave reads and writes (bound once by store.ts, avoiding an import cycle). */
interface StoreLike {
  getState(): { history: { present: Project }; saveError: string | null };
  setState(partial: { saveError: string | null }): void;
}
let store: StoreLike;
export function bindAutosave(s: StoreLike): void {
  store = s;
}

const hasIdb = (): boolean => typeof indexedDB !== 'undefined';
let enabled = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty: Project | null = null;
// Serialises writes; never rejects (failures are reported to the caller of enqueue()).
let chain: Promise<void> = Promise.resolve();

/**
 * Turns autosave off (pending changes are dropped) or on. Switching it on saves the current project soon, so an
 * edit made while it was off is not lost.
 */
export function setAutosaveEnabled(on: boolean): void {
  if (on) {
    if (!enabled) {
      enabled = true;
      schedule(store.getState().history.present);
    }
    return;
  }
  enabled = false;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  dirty = null;
}

/** Records the outcome in `saveError` (only on change, so the UI reports a failure and the recovery once each). */
function report(error: unknown): void {
  const saveError = error === null ? null : describeStorageError(error);
  if (store.getState().saveError !== saveError) store.setState({ saveError });
}

function enqueue(): Promise<void> {
  const p = dirty;
  dirty = null;
  if (!p || !hasIdb() || !enabled) return Promise.resolve();
  const run = chain.then(() => saveProject(p));
  chain = run.catch(() => undefined);
  return run.then(
    () => report(null),
    (e: unknown) => {
      // Keep the failed project for retry unless a newer change has arrived.
      if (dirty === null) dirty = p;
      report(e);
      throw e;
    },
  );
}

/** Saves any pending change now and resolves once all writes are durable; rejects if a save fails. */
export async function flushAutosave(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  await chain;
  await enqueue();
}

/**
 * Flushes the pending change when the page is hidden or unloaded (closing within the 500 ms debounce would
 * otherwise lose the last edit). Returns a function that removes the listeners.
 */
export function flushOnHide(win: EventTarget, doc: EventTarget & { visibilityState: DocumentVisibilityState }): () => void {
  const flush = (): void => {
    if (timer === undefined && dirty === null) return;
    flushAutosave().catch(() => undefined); // reported through saveError
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') flush();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', flush);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', flush);
  };
}

export function schedule(p: Project): void {
  if (!hasIdb() || !enabled) return;
  dirty = p;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    enqueue().catch(() => undefined); // reported through saveError (the UI shows it)
  }, 500);
}

