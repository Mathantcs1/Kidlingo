// Page session: editor lock, startup restore (media missing from storage flagged), then storage cleanup.
import { create } from 'zustand';
import { gcMedia, referencedMedia } from '../media/gc';
import { hasMedia, settleMedia } from '../media/storage';
import { loadProject, reconcileMedia } from '../state/persist';
import { flushOnHide, setAutosaveEnabled, useEditor } from '../state/store';
import { acquireEditorLock, lockState } from '../state/tabLock';
import { cleanTemp } from './exportTemp';
import { shouldCollect } from './restoreOutcome';
import type { RestoreOutcome } from './restoreOutcome';

export type SessionState = 'loading' | 'ready' | 'locked';

/**
 * Why the saved project could not be loaded, or null. While set, autosave is off (the saved project is kept as it
 * is) and no media is collected, until Retry succeeds or the user starts a new project.
 */
export const useRestoreFailure = create<{ message: string | null }>()(() => ({ message: null }));

function fail(reason: string): RestoreOutcome {
  setAutosaveEnabled(false);
  useRestoreFailure.setState({
    message: `Could not load your saved project: ${reason.replace(/\.$/, '')}. It is kept as it was, and nothing is saved until you retry or start a new project.`,
  });
  return 'failed';
}

/**
 * Loads the saved project into the store and says how that went (see RestoreOutcome). Never rejects. Without
 * `force`, a project the user started editing meanwhile is kept ('skipped').
 */
export async function restoreSession(opts: { force?: boolean } = {}): Promise<RestoreOutcome> {
  const initial = useEditor.getState().history.present;
  try {
    const saved = await loadProject();
    if (saved.status === 'unavailable' || saved.status === 'none') return saved.status;
    if (saved.status === 'unsupported') return fail(saved.reason);
    const reconciled = await reconcileMedia(saved.project, hasMedia);
    if (!opts.force && useEditor.getState().history.present !== initial) return 'skipped';
    useEditor.getState().loadProject(reconciled);
    return 'restored';
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

declare const permitBrand: unique symbol;
/** Proof that the project state is complete, so files it does not reference really are unused. */
export type GcPermit = { readonly [permitBrand]: true };
const PERMIT = {} as GcPermit;

/** A permit after the startup restore, only for a restored or verifiably absent project in the lock-holding tab. */
export function gcPermitAfterRestore(outcome: RestoreOutcome): GcPermit | null {
  return shouldCollect(outcome, lockState()) ? PERMIT : null;
}

/** A permit after New project (an explicit decision to discard), unless another tab may own the media. */
export function gcPermitForNewProject(): GcPermit | null {
  const s = lockState();
  return s === 'held' || s === 'unsupported' ? PERMIT : null;
}

/**
 * Deletes imported media files no state of the editor history references. Needs a permit (see above) and never
 * runs while a failed restore is unresolved. Never rejects.
 */
export async function collectUnusedMedia(permit: GcPermit | null): Promise<void> {
  if (permit !== PERMIT || useRestoreFailure.getState().message !== null) return;
  await gcMedia(() => referencedMedia(useEditor.getState().history), { emptyIsVerified: true });
}

/** Re-runs the restore after a failure (replacing any unsaved edits made since); on success saving resumes. */
export async function retryRestore(): Promise<void> {
  const outcome = await restoreSession({ force: true });
  if (outcome !== 'restored' && outcome !== 'none') return;
  useRestoreFailure.setState({ message: null });
  setAutosaveEnabled(true);
  await collectUnusedMedia(gcPermitAfterRestore(outcome));
}

/** Clears a failed-restore state: saving resumes (the caller then replaces the saved project). */
export function resolveRestoreFailure(): void {
  useRestoreFailure.setState({ message: null });
  setAutosaveEnabled(true);
}

/**
 * Takes the editor lock; another tab already editing leaves this one 'locked' (inert: no restore, autosave, GC or
 * temp cleanup ever runs here; it reloads by itself once the other tab closes). Otherwise restores the saved
 * project, then — only if the restore succeeded or there was verifiably nothing to restore, and only in the
 * lock-holding tab — frees unreferenced media files and the previous session's export temp files.
 */
export async function startSession(): Promise<SessionState> {
  const lock = await acquireEditorLock();
  if (lock === 'locked') {
    setAutosaveEnabled(false);
    return 'locked';
  }
  // Imported files become collectable once the project references them (see media/storage unsettled ids).
  useEditor.subscribe((s, prev) => {
    if (s.history.present.media !== prev.history.present.media) settleMedia(Object.keys(s.history.present.media));
  });
  const outcome = await restoreSession();
  flushOnHide(window, document);
  void collectUnusedMedia(gcPermitAfterRestore(outcome));
  if (lock === 'held') void cleanTemp();
  return 'ready';
}

let started: Promise<SessionState> | null = null;

/** `startSession` at most once per page load (safe under StrictMode's double effects). */
export function startSessionOnce(): Promise<SessionState> {
  started ??= startSession();
  return started;
}
