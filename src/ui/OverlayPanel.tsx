import { STICKER_SHAPES } from '../overlays/spec';
import './fx.css';
import { addOverlayAtPlayhead } from './overlayCommands';

const BUTTONS = [
  { type: 'lowerThird', label: 'Lower third' },
  { type: 'subscribe', label: 'Subscribe button' },
  { type: 'progress', label: 'Progress bar' },
] as const;

/** Add overlays at the playhead: lower third, subscribe button, progress bar and twelve built-in stickers. */
export default function OverlayPanel({ editable }: { editable: boolean }) {
  return (
    <section className="overlay-panel" aria-label="Overlays" data-testid="overlay-panel">
      <div className="panel-head">
        <h2>Overlays</h2>
      </div>
      <div className="overlay-buttons">
        {BUTTONS.map((b) => (
          <button key={b.type} type="button" disabled={!editable} data-testid={`overlay-add-${b.type}`} onClick={() => addOverlayAtPlayhead(b.type)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="overlay-stickers" role="group" aria-label="Stickers">
        {STICKER_SHAPES.map((name, i) => (
          <button key={name} type="button" className="overlay-sticker" disabled={!editable} data-testid={`overlay-sticker-${i}`} title={`Add sticker: ${name}`} onClick={() => addOverlayAtPlayhead('sticker', i)}>
            {name}
          </button>
        ))}
      </div>
    </section>
  );
}
