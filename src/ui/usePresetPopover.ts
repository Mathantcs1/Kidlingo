// Placement and dismissal of the preset browser popover (Plan 5B D10): left of the inspector next to the opener,
// kept on screen; focus goes to the search field once placed (a visibility: hidden field cannot take focus); a press
// outside (not on the opener) closes it.
import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

const MARGIN = 8;

export function usePresetPopover(
  root: RefObject<HTMLElement | null>,
  search: RefObject<HTMLInputElement | null>,
  anchor: HTMLElement | null,
  onClose: () => void,
): { left: number; top: number } | null {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = (): void => {
      const panel = root.current;
      const ref = (anchor?.closest('.inspector') as HTMLElement | null) ?? anchor;
      if (!panel || !ref) return;
      const r = ref.getBoundingClientRect();
      const a = anchor?.getBoundingClientRect() ?? r;
      const h = panel.offsetHeight;
      setPos({
        left: Math.max(MARGIN, r.left - panel.offsetWidth - MARGIN),
        top: Math.min(Math.max(MARGIN, a.top - 40), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor, root]);

  const placed = pos !== null;
  useEffect(() => {
    if (placed) search.current?.focus();
  }, [placed, search]);

  useEffect(() => {
    const onDown = (e: Event): void => {
      const t = e.target as Node;
      // Presses in a modal opened from the browser (delete confirmation) are not "outside" either.
      if (root.current?.contains(t) || anchor?.contains(t) || (t instanceof Element && t.closest('.modal-backdrop'))) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [anchor, onClose, root]);

  return pos;
}
