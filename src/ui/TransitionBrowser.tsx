import type { ReactElement } from 'react';
import type { TransitionType } from '../core/transitionTypes';
import { addTransitionAtPlayheadCmd } from './transitionCommands';
import { TRANSITION_MIME, setDraggedTransition } from './transitionDnd';
import './transitions.css';

const TILES: { type: TransitionType; label: string; hint: string; glyph: ReactElement }[] = [
  { type: 'dip', label: 'Dip to black', hint: 'Fade out to black, then in', glyph: <><rect x="2" y="4" width="14" height="16" fill="#ccc" /><rect x="22" y="4" width="14" height="16" fill="#456" /><rect x="14" y="4" width="10" height="16" fill="#000" /></> },
  { type: 'dissolve', label: 'Dissolve', hint: 'Crossfade between the two clips', glyph: <><defs><linearGradient id="tg-d"><stop offset="0" stopColor="#ccc" /><stop offset="1" stopColor="#456" /></linearGradient></defs><rect x="2" y="4" width="34" height="16" fill="url(#tg-d)" /></> },
  { type: 'wipe', label: 'Wipe', hint: 'A soft edge sweeps across', glyph: <><rect x="2" y="4" width="17" height="16" fill="#ccc" /><rect x="19" y="4" width="17" height="16" fill="#456" /><rect x="16" y="4" width="6" height="16" fill="#89a" /></> },
  { type: 'slide', label: 'Slide', hint: 'The new clip slides in over the old one', glyph: <><rect x="2" y="4" width="34" height="16" fill="#ccc" /><rect x="14" y="4" width="22" height="16" fill="#456" /></> },
  { type: 'push', label: 'Push', hint: 'The new clip pushes the old one out', glyph: <><rect x="2" y="4" width="14" height="16" fill="#ccc" /><rect x="16" y="4" width="20" height="16" fill="#456" /><path d="M8 12h12m-4-4l4 4-4 4" stroke="#fff" fill="none" /></> },
  { type: 'zoom', label: 'Zoom', hint: 'Zoom through the cut', glyph: <><rect x="2" y="4" width="34" height="16" fill="#ccc" /><rect x="10" y="7" width="18" height="10" fill="#456" /></> },
  { type: 'glitch', label: 'Glitch', hint: 'Blocky digital glitch', glyph: <><rect x="2" y="4" width="34" height="16" fill="#ccc" /><rect x="6" y="6" width="10" height="4" fill="#456" /><rect x="20" y="12" width="12" height="4" fill="#456" /><rect x="10" y="16" width="8" height="3" fill="#a46" /></> },
  { type: 'audio', label: 'Audio crossfade', hint: 'Crossfade two audio clips (audio tracks)', glyph: <path d="M2 18 L36 6 M2 6 L36 18" stroke="#8ab" strokeWidth="2" fill="none" /> },
];

/**
 * The transition tiles (Plan 5C): press one (Enter or Space on the keyboard) to add it at the cut nearest the playhead on the
 * selected clip's track, or drag it onto a cut of the timeline. Each add is ONE undo step.
 */
export default function TransitionBrowser({ disabled }: { disabled: boolean }) {
  return (
    <div className="transition-browser" data-testid="transition-browser" role="group" aria-label="Transitions">
      {TILES.map((t) => (
        <button
          key={t.type}
          type="button"
          className="transition-tile"
          data-testid={`transition-tile-${t.type}`}
          draggable={!disabled}
          disabled={disabled}
          title={`${t.hint}. Click to add at the cut nearest the playhead, or drag onto a cut.`}
          onClick={() => addTransitionAtPlayheadCmd(t.type)}
          onDragStart={(e) => {
            e.dataTransfer.setData(TRANSITION_MIME, t.type);
            e.dataTransfer.effectAllowed = 'copy';
            setDraggedTransition(t.type);
          }}
          onDragEnd={() => setDraggedTransition(null)}
        >
          <svg viewBox="0 0 38 24" width="38" height="24" aria-hidden="true">
            {t.glyph}
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
