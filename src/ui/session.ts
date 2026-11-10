// Page session: editor lock, startup restore (media missing from storage flagged), then storage cleanup.
import { create } from 'zustand';
import { gcMedia, referencedMedia } from '../media/gc';
import { hasMedia, settleMedia } from '../media/storage';
import { loadProject, reconcileMedia } from '../state/persist';
import { flushOnHide, setAutosaveEnabled, useEditor } from '../state/store';
import { acquireEditorLock, lockState } from '../state/tabLock';
import { cleanTemp } from './exportTemp';
import { askConfirm } from './Confirm';
import { projectHasWork } from './edits';
import { autosaveAfter, shouldCollect } from './restoreOutcome';
import type { RestoreOutcome } from './restoreOutcome';

export type SessionState = 'loading' | 'ready' | 'locked';

/** The page's session state, shown as data-session on the app (a locked tab turns 'ready' when it takes over). */
export const useSessionState = create<{ state: SessionState }>()(() => ({ state: 'loading' }));

/**
 * Why the saved project was not loaded, or null: it could not be read ('failed'), or the user started editing first
 * ('skipped'). While set, autosave is off (the saved project is kept as it is) and no media is collected, until the
 * saved project is loaded or the user starts a new project.
 */
export const useRestoreFailure = create<{ message: string | null; kind: 'failed' | 'skipped' | null }>()(() => ({
  message: null,
  kind: null,
}));

function fail(reason: string): RestoreOutcome {
  setAutosaveEnabled(false);
  useRestoreFailure.setState({
    kind: 'failed',
    message: `Could not load your saved project: ${reason.replace(/\.$/, '')}. It is kept as it was, and nothing is saved until you retry or start a new project.`,
  });
  return 'failed';
}

function skipped(): RestoreOutcome {
  setAutosaveEnabled(false);
  useRestoreFailure.setState({
    kind: 'skipped',
    message:
      'Your saved project was not loaded because you started editing first. Load it (discarding what you did) or start a new project; nothing is saved until then.',
  });
  return 'skipped';
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
    if (!opts.force && useEditor.getState().history.present !== initial) return skipped();
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

/**
 * Loads the saved project after a failed or skipped restore. If the editor holds work done since (media or clips in
 * any undo/redo state), asks first: loading replaces it. On success saving resumes and unused media is collected.
 */
export async function retryRestore(): Promise<void> {
  if (projectHasWork(useEditor.getState().history)) {
    const ok = await askConfirm({
      title: 'Load the saved project?',
      message: 'Loading the saved project discards what you did since. Continue?',
      confirmLabel: 'Load saved project',
    });
    if (!ok) return;
  }
  const outcome = await restoreSession({ force: true });
  if (outcome !== 'restored' && outcome !== 'none') return;
  useRestoreFailure.setState({ message: null, kind: null });
  setAutosaveEnabled(true);
  await collectUnusedMedia(gcPermitAfterRestore(outcome));
}

/** Clears a failed-restore state: saving resumes (the caller then replaces the saved project). */
export function resolveRestoreFailure(): void {
  useRestoreFailure.setState({ message: null, kind: null });
  setAutosaveEnabled(true);
}

/**
 * The editing session of the tab that owns the editor: restores the saved project (autosave is off until that is
 * settled, so an edit racing the restore cannot overwrite the saved project), then — only if the restore succeeded
 * or there was verifiably nothing to restore, and only in the lock-holding tab — frees unreferenced media files and
 * the previous session's export temp files.
 */
async function beginEditing(): Promise<void> {
  setAutosaveEnabled(false);
  // Imported files become collectable once the project references them (see media/storage unsettled ids).
  useEditor.subscribe((s, prev) => {
    if (s.history.present.media !== prev.history.present.media) settleMedia(Object.keys(s.history.present.media));
  });
  const outcome = await restoreSession();
  if (autosaveAfter(outcome)) setAutosaveEnabled(true);
  flushOnHide(window, document);
  void collectUnusedMedia(gcPermitAfterRestore(outcome));
  if (lockState() === 'held') void cleanTemp();
}

/**
 * Takes the editor lock. Another tab already editing leaves this one 'locked' (inert: no restore, autosave, GC or
 * temp cleanup runs here) until that tab closes or reloads; then this tab takes the lock and starts editing in
 * place (no reload) and its state turns 'ready'.
 */
export async function startSession(): Promise<SessionState> {
  const takeOver = (): void => {
    void beginEditing().then(() => useSessionState.setState({ state: 'ready' }));
  };
  const lock = await acquireEditorLock(typeof navigator !== 'undefined' ? navigator.locks : undefined, takeOver);
  if (lock === 'locked') {
    setAutosaveEnabled(false);
    useSessionState.setState({ state: 'locked' });
    return 'locked';
  }
  await beginEditing();
  useSessionState.setState({ state: 'ready' });
  return 'ready';
}

let started: Promise<SessionState> | null = null;

/** `startSession` at most once per page load (safe under StrictMode's double effects). */
export function startSessionOnce(): Promise<SessionState> {
  started ??= startSession();
  return started;
}
