import { useEffect } from 'react';
import { useEditor } from '../state/store';
import { showError, showInfo, useToasts } from './toastStore';
import type { ToastItem } from './toastStore';

export { showError, showInfo, useToasts } from './toastStore';

const DISMISS_MS = 5000;

/** Runs a UI action; any error it throws becomes a toast instead of an uncaught exception. */
export function guard(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    console.error('clipforge:', e);
    showError(e instanceof Error ? e.message : String(e));
  }
}

// Surface the store's timeline errors as toasts, then clear them so a repeat of the same error shows again.
useEditor.subscribe((s) => {
  if (s.lastError === null) return;
  showError(s.lastError);
  useEditor.setState({ lastError: null });
});

// Autosave: say once when saving starts failing (the toolbar keeps a "Not saved" indicator) and once when it works
// again.
useEditor.subscribe((s, prev) => {
  if (s.saveError === prev.saveError) return;
  if (s.saveError !== null && prev.saveError === null) {
    const reason = s.saveError.replace(/\.$/, '');
    showError(`Couldn't save your project automatically: ${reason}. Export or keep this tab open.`);
  } else if (s.saveError === null) {
    showInfo('Your project is being saved again.');
  }
});

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), DISMISS_MS);
    return () => clearTimeout(t);
  }, [item.id, dismiss]);
  return (
    <div
      className={`toast${item.kind === 'info' ? ' toast-info' : ''}`}
      role={item.kind === 'info' ? 'status' : 'alert'}
      data-testid={item.kind === 'info' ? 'info-toast' : 'error-toast'}
    >
      <span>{item.message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
        ×
      </button>
    </div>
  );
}

export default function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </div>
  );
}
