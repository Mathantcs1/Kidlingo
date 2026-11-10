import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ExportQuality } from '../export/exporter';
import { cancelJob, closeDialog, startExport, useExportUi } from './exportJob';
import { DEFAULT_EXPORT_NAME, percent } from './exportName';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])';

/** Keeps Tab inside `root` and closes on Escape (unless a job is running). */
function useDialogKeys(rootRef: RefObject<HTMLDivElement | null>, running: boolean): void {
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    const root = rootRef.current;
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (!root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!runningRef.current) closeDialog();
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
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rootRef]);
}

/** Modal for exporting the timeline to MP4 and for showing merge-all progress. */
export default function ExportDialog() {
  const { open, phase, progress, error, url, filename } = useExportUi();
  const [quality, setQuality] = useState<ExportQuality>('1080p');
  const [name, setName] = useState(DEFAULT_EXPORT_NAME);
  const rootRef = useRef<HTMLDivElement>(null);
  const running = phase === 'running';
  useDialogKeys(rootRef, running);

  // Keep focus inside the dialog when the focused control disappears (e.g. Start → Cancel).
  useEffect(() => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) root.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [phase]);

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
          <a className="btn btn-primary" data-testid="export-download" href={url} download={filename}>
            Download {filename}
          </a>
        )}
        <div className="modal-actions">
          {running ? (
            <button type="button" data-testid="btn-export-cancel" onClick={cancelJob}>
              Cancel
            </button>
          ) : (
            <>
              <button type="button" data-testid="btn-export-close" onClick={closeDialog}>
                Close
              </button>
              {!merge && (
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="btn-export-start"
                  onClick={() => void startExport(quality, name)}
                >
                  {phase === 'idle' ? 'Export' : 'Export again'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
