import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ExportQuality } from '../export/exporter';
import {
  cancelDiscard,
  cancelJob,
  closeDialog,
  confirmDiscard,
  markDownloaded,
  startExport,
  useExportUi,
} from './exportJob';
import { DEFAULT_EXPORT_NAME, percent } from './exportName';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])';

/**
 * Keeps Tab inside `root`; Escape answers a pending discard question with "keep", else closes (unless a job is
 * running). Focus returns to the element that opened the dialog when it closes.
 */
function useDialogKeys(rootRef: RefObject<HTMLDivElement | null>, running: boolean, confirming: boolean): void {
  const state = useRef({ running, confirming });
  state.current = { running, confirming };
  // Read during the first render, before the dialog takes focus (stable across StrictMode's effect replay).
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const root = rootRef.current;
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (!root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.current.confirming) cancelDiscard();
        else if (!state.current.running) closeDialog();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [rootRef, opener]);
}

/** Cancel while a job runs; otherwise Close and (export only) Export / Export again. */
function JobActions(props: { running: boolean; merge: boolean; idle: boolean; onStart(): void }) {
  if (props.running) {
    return (
      <div className="modal-actions">
        <button type="button" data-testid="btn-export-cancel" onClick={cancelJob}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="modal-actions">
      <button type="button" data-testid="btn-export-close" onClick={closeDialog}>
        Close
      </button>
      {!props.merge && (
        <button type="button" className="btn-primary" data-testid="btn-export-start" onClick={props.onStart}>
          {props.idle ? 'Export' : 'Export again'}
        </button>
      )}
    </div>
  );
}

/** Modal for exporting the timeline to MP4 and for showing merge-all progress. */
export default function ExportDialog() {
  const { open, phase, progress, error, url, filename, confirm } = useExportUi();
  const [quality, setQuality] = useState<ExportQuality>('1080p');
  const [name, setName] = useState(DEFAULT_EXPORT_NAME);
  const rootRef = useRef<HTMLDivElement>(null);
  const running = phase === 'running';
  useDialogKeys(rootRef, running, confirm !== null);

  // Keep focus inside the dialog when the focused control disappears (e.g. Start → Cancel); a discard question
  // takes focus on its safe answer.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (confirm) root.querySelector<HTMLElement>('[data-testid="btn-discard-keep"]')?.focus();
    else if (!root.contains(document.activeElement)) root.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [phase, confirm]);

  const merge = open === 'merge';
  const title = merge ? 'Merge all into one clip' : 'Export video';
  const showProgress = running || phase === 'done';

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" data-testid="export-dialog" ref={rootRef}>
        <h2 id="export-title">{title}</h2>
        {!merge && (
          <div className="modal-fields">
            <label>
              Quality
              <select
                data-testid="export-quality"
                value={quality}
                disabled={running}
                onChange={(e) => setQuality(e.target.value as ExportQuality)}
              >
                <option value="1080p">1080p</option>
                <option value="4k">4K</option>
              </select>
            </label>
            <label>
              File name
              <input type="text" value={name} disabled={running} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
        )}
        {showProgress && (
          <div className="modal-progress">
            <span>{running ? (merge ? 'Merging…' : 'Exporting…') : 'Done'}</span>
            <progress data-testid="export-progress" max={1} value={progress} />
            <span className="modal-percent">{percent(progress)}</span>
          </div>
        )}
        {phase === 'cancelled' && <p className="modal-note">{merge ? 'Merge cancelled' : 'Export cancelled'}</p>}
        {phase === 'error' && (
          <p className="modal-error" role="alert" data-testid="export-error">
            {merge ? 'Merge failed' : 'Export failed'}: {error}
          </p>
        )}
        {phase === 'done' && url && filename && (
          <a className="btn btn-primary" data-testid="export-download" href={url} download={filename} onClick={markDownloaded}>
            Download {filename}
          </a>
        )}
        {confirm ? (
          <div className="modal-confirm" role="group" aria-labelledby="discard-question" data-testid="export-discard-confirm">
            <p id="discard-question">Discard the finished export? It has not been downloaded.</p>
            <div className="modal-actions">
              <button type="button" data-testid="btn-discard-keep" onClick={cancelDiscard}>
                Keep it
              </button>
              <button type="button" data-testid="btn-discard-confirm" onClick={confirmDiscard}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <JobActions running={running} merge={merge} idle={phase === 'idle'} onStart={() => void startExport(quality, name)} />
        )}
      </div>
    </div>
  );
}
