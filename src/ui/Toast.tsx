import { useEffect } from 'react';
import { create } from 'zustand';
import { useEditor } from '../state/store';

const DISMISS_MS = 5000;

interface ToastItem {
  id: number;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push(message: string): void;
  dismiss(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push(message) {
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id: ++seq, message }] }));
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export function showError(message: string): void {
  useToasts.getState().push(message);
}

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

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), DISMISS_MS);
    return () => clearTimeout(t);
  }, [item.id, dismiss]);
  return (
    <div className="toast" role="alert" data-testid="error-toast">
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
