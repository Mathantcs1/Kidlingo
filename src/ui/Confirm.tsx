import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { currentModality, focusAs } from './inputModality';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Label of the destructive button. */
  confirmLabel: string;
}

interface ConfirmState {
  request: (ConfirmRequest & { resolve(ok: boolean): void }) | null;
}

export const useConfirm = create<ConfirmState>()(() => ({ request: null }));

/** Asks the user a yes/no question in a modal; resolves true for the confirm button, false for Cancel/Escape. */
export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  useConfirm.getState().request?.resolve(false);
  return new Promise((resolve) => {
    useConfirm.setState({
      request: {
        ...req,
        resolve: (ok) => {
          useConfirm.setState({ request: null });
          resolve(ok);
        },
      },
    });
  });
}

/** The confirmation modal (focus starts on Cancel, the safe answer; focus returns to the opener on close). */
export default function ConfirmDialog() {
  const request = useConfirm((s) => s.request);
  const rootRef = useRef<HTMLDivElement>(null);
  // The opener and how the dialog was opened (mouse or keyboard): focus goes back to it the same way.
  const [{ opener, modality }] = useState(() => ({ opener: document.activeElement, modality: currentModality() }));

  useEffect(() => {
    const root = rootRef.current;
    root?.querySelector<HTMLElement>('[data-testid="btn-confirm-cancel"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useConfirm.getState().request?.resolve(false);
      } else if (e.key === 'Tab' && root) {
        // Two buttons: Tab and Shift+Tab alternate between them.
        e.preventDefault();
        const buttons = [...root.querySelectorAll<HTMLElement>('button')];
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        buttons[(i + 1) % buttons.length]?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) focusAs(opener, modality);
    };
  }, [opener, modality]);

  if (!request) return null;
  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-small"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        data-testid="confirm-dialog"
        ref={rootRef}
      >
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-message" className="modal-note">
          {request.message}
        </p>
        <div className="modal-actions">
          <button type="button" data-testid="btn-confirm-cancel" onClick={() => request.resolve(false)}>
            Cancel
          </button>
          <button type="button" className="btn-danger" data-testid="btn-confirm-ok" onClick={() => request.resolve(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
