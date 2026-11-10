// User-facing wording for storage failures (OPFS media files, export temp files, IndexedDB autosave).

// Removing media frees its file only at the next start or New project (undo keeps it until then).
export const QUOTA_MESSAGE =
  "Your browser's storage is full. Remove media you no longer need, then reload the page (or start a New project) to free the space.";

/** True for the browser's "storage quota exceeded" error, whichever object carries it. */
export function isQuotaError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'QuotaExceededError';
}

/** The quota message for quota errors, otherwise the error's own message. */
export function describeStorageError(e: unknown): string {
  if (isQuotaError(e)) return QUOTA_MESSAGE;
  return e instanceof Error ? e.message : String(e);
}
