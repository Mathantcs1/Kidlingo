import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { trackLabel } from '../core/tracks';
import type { Track } from '../core/model';
import { useEditor } from '../state/store';
import { setTrackDuckCmd } from './audioCommands';
import NumberField from './NumberField';
import './audio.css';

interface Props {
  track: Track;
  label: string;
}

/**
 * Auto-ducking of one track (D5): a small "D" toggle in the track header opens a popover (portal, fixed position,
 * so the header keeps its height) with the source track, amount (dB), attack, release and Off. Every change is
 * ONE store apply through setTrackDuckCmd; a cycle is refused with a toast. Works on locked tracks, like volume.
 * Escape or a click outside closes the popover and returns focus to the toggle.
 */
export default function DuckControls({ track, label }: Props) {
  const id = track.id;
  const duck = track.duck;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const sources = useEditor((s) => {
    const p = s.history.present;
    return p.tracks.filter((t) => t.id !== id).map((t) => `${t.id}\u0000${trackLabel(p, t.id)}`).join('\u0001');
  });
  const options = sources ? sources.split('\u0001').map((x) => x.split('\u0000') as [string, string]) : [];
  const sourceId = duck && options.some(([tid]) => tid === duck.sourceTrackId) ? duck.sourceTrackId : '';

  useLayoutEffect(() => {
    if (!open || !toggle.current) return;
    // Below the toggle, or above it when it would not fit (the lowest tracks sit at the bottom of the window).
    const r = toggle.current.getBoundingClientRect();
    const width = panel.current?.offsetWidth ?? 220;
    const height = panel.current?.offsetHeight ?? 0;
    const below = r.bottom + 4 + height <= window.innerHeight;
    const top = below ? r.bottom + 4 : Math.max(4, r.top - 4 - height);
    setPos({ top, left: Math.max(4, Math.min(r.left, window.innerWidth - width - 4)) });
    panel.current?.querySelector('select')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !toggle.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  const close = (): void => {
    setOpen(false);
    toggle.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const title = duck ? `Ducking ${label} under ${trackLabelOf(options, duck.sourceTrackId)}` : `Ducking of ${label}: off`;
  return (
    <>
      <button
        ref={toggle}
        type="button"
        className={`track-btn is-duck${duck ? ' is-on' : ''}`}
        data-testid={`duck-toggle-${id}`}
        aria-label={`Ducking of ${label}`}
        title={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-pressed={!!duck}
        onClick={() => setOpen((o) => !o)}
      >
        D
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="duck-panel"
            role="dialog"
            aria-label={`Ducking of ${label}`}
            data-testid={`duck-panel-${id}`}
            style={{ top: pos.top, left: pos.left }}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
          >
            <label className="duck-source">
              <span className="tf-label">Duck under</span>
              <select
                data-testid={`duck-source-${id}`}
                aria-label={`Duck ${label} under`}
                value={sourceId}
                onChange={(e) => setTrackDuckCmd(id, e.target.value ? { sourceTrackId: e.target.value } : null)}
              >
                <option value="">Off</option>
                {options.map(([tid, name]) => (
                  <option key={tid} value={tid}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="tf-grid duck-grid">
              <NumberField
                testId={`duck-amount-${id}`}
                label="Amount"
                unit="dB"
                ariaLabel={`Duck amount of ${label} in dB`}
                value={duck?.amountDb ?? -12}
                step={1}
                min={-40}
                max={0}
                disabled={!duck}
                onCommit={(v) => setTrackDuckCmd(id, { amountDb: v })}
              />
              <NumberField
                testId={`duck-attack-${id}`}
                label="Attack"
                unit="s"
                ariaLabel={`Duck attack of ${label} in seconds`}
                value={duck?.attack ?? 0.2}
                step={0.05}
                min={0.01}
                max={2}
                disabled={!duck}
                onCommit={(v) => setTrackDuckCmd(id, { attack: v })}
              />
              <NumberField
                testId={`duck-release-${id}`}
                label="Release"
                unit="s"
                ariaLabel={`Duck release of ${label} in seconds`}
                value={duck?.release ?? 0.5}
                step={0.05}
                min={0.01}
                max={2}
                disabled={!duck}
                onCommit={(v) => setTrackDuckCmd(id, { release: v })}
              />
            </div>
            <div className="duck-actions">
              <button
                type="button"
                data-testid={`duck-off-${id}`}
                disabled={!duck}
                onClick={() => setTrackDuckCmd(id, null)}
              >
                Off
              </button>
              <button type="button" data-testid={`duck-close-${id}`} onClick={close}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function trackLabelOf(options: [string, string][], tid: string): string {
  return options.find(([x]) => x === tid)?.[1] ?? 'a removed track';
}
