// The toast list and the functions that add to it, without the store subscriptions Toast.tsx installs (so pure job
// modules can show a toast without changing how the editor store's lastError behaves).
import { create } from 'zustand';

export interface ToastItem {
  id: number;
  message: string;
  kind: 'error' | 'info';
}

interface ToastState {
  toasts: ToastItem[];
  push(message: string, kind?: ToastItem['kind']): void;
  dismiss(id: number): void;
}

let seq = 0;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push(message, kind = 'error') {
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id: ++seq, message, kind }] }));
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export function showError(message: string): void {
  useToasts.getState().push(message);
}

export function showInfo(message: string): void {
  useToasts.getState().push(message, 'info');
}
