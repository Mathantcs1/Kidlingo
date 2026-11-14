// The ease editor panel's window behaviour (moved out of EasePanel.tsx, Plan 5B Task 8, no logic change): Escape closes
// without committing anything pending, a press outside commits a pending number (blur) and closes, focus goes to the
// active preset on open, and the panel is placed under (or over) the opener, kept inside the window.
import { useEffect, useLayoutEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { closeEase, useEaseEditor } from './easeEditorStore';
import type { EaseOpen } from './easeEditorStore';

export function useEasePanelChrome(panel: RefObject<HTMLDivElement | null>, open: EaseOpen, cancelled: MutableRefObject<boolean>): void {
  // Escape closes without committing anything pending (capture: the global shortcuts and drags never see it);
  // a press outside commits a pending number (blur) and closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Only when focus is in the panel, on its opener, or nowhere: other consumers (a number draft, a dialog) own their Escape.
      const a = document.activeElement;
      const mine = !a || a === document.body || !!panel.current?.contains(a) || a === useEaseEditor.getState().open?.returnTo;
      if (!mine) return;
      cancelled.current = true;
      e.preventDefault();
      e.stopPropagation();
      closeEase();
    };
    const onDown = (e: Event): void => {
      if (panel.current?.contains(e.target as Node)) return;
      if (panel.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      closeEase();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    (panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel.current?.querySelector<HTMLElement>('button'))?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Placed under (or over) the diamond that opened it, kept inside the window.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const a = open.anchor;
    const left = a ? Math.min(Math.max(8, a.left - w / 2), window.innerWidth - w - 8) : (window.innerWidth - w) / 2;
    const below = a ? a.bottom + 8 : 8;
    const top = a && below + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 8) : below;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${top}px`;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
