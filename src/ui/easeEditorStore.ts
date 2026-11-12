// Which keys the ease editor is open on (Plan 5 Task 9). UI state, never history. Opening remembers the focused
// element (a diamond or strip key) so closing can hand focus back to it, and where to place the panel.
import { create } from 'zustand';
import type { KeyRef } from '../core/keyframeEdits';
import type { Id } from '../core/model';

export interface EaseOpen {
  /** Distinct per opening, so the panel starts fresh each time. */
  id: number;
  clipId: Id;
  refs: KeyRef[];
  returnTo: HTMLElement | null;
  anchor: { left: number; top: number; bottom: number } | null;
}

export const useEaseEditor = create<{ open: EaseOpen | null }>()(() => ({ open: null }));

let serial = 0;

export function openEase(clipId: Id, refs: KeyRef[]): void {
  if (refs.length === 0) return;
  const el = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const r = el?.getBoundingClientRect();
  useEaseEditor.setState({ open: { id: ++serial, clipId, refs, returnTo: el, anchor: r ? { left: r.left, top: r.top, bottom: r.bottom } : null } });
}

/** Closes the editor and returns focus to what opened it (when it is still on the page). */
export function closeEase(): void {
  const o = useEaseEditor.getState().open;
  if (!o) return;
  useEaseEditor.setState({ open: null });
  if (o.returnTo?.isConnected) o.returnTo.focus();
}
