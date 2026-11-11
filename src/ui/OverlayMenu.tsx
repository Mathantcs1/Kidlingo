import './overlays.css';
import { useEffect, useRef, useState } from 'react';
import { OVERLAY_LABELS, OVERLAY_TYPES } from '../core/overlaySpec';
import { ADJUSTMENT_LABEL } from '../core/adjustment';
import { addAdjustmentCmd, addOverlayCmd } from './overlayCommands';

/**
 * "Add overlay": a small menu of overlay types plus "Adjustment layer". Choosing one adds it at the playhead on the
 * active video layer in one undo step. Escape or a click elsewhere closes it; the button and items are keyboard operable.
 */
export default function OverlayMenu({ editable }: { editable: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => {
    if (!editable) setOpen(false);
  }, [editable]);
  return (
    <div
      className="overlay-menu"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        data-testid="overlay-add"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!editable}
        title="Add a lower third, subscribe button, progress bar, sticker or adjustment layer at the playhead"
        onClick={() => setOpen(!open)}
      >
        Add overlay
      </button>
      {open && (
        <ul className="overlay-menu-list" role="menu" aria-label="Overlay types">
          {OVERLAY_TYPES.map((type) => (
            <li key={type} role="none">
              <button
                type="button"
                role="menuitem"
                data-testid={`overlay-add-${type}`}
                onClick={() => {
                  setOpen(false);
                  addOverlayCmd(type);
                }}
              >
                {OVERLAY_LABELS[type]}
              </button>
            </li>
          ))}
          <li role="separator" className="overlay-menu-separator" />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              data-testid="overlay-add-adjustment"
              title="Effects, blend mode and opacity on this layer apply to every layer below it"
              onClick={() => {
                setOpen(false);
                addAdjustmentCmd();
              }}
            >
              {ADJUSTMENT_LABEL}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
