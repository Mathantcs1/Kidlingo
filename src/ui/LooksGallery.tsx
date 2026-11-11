import { LOOKS } from '../core/looks';
import type { LookKey } from '../core/looks';
import type { Id } from '../core/model';
import { applyLookCmd } from './videoEffectCommands';

/** One-click looks: each REPLACES the clip's whole effect stack in ONE undo step (Undo brings the old stack back). */
export default function LooksGallery({ clipId, disabled }: { clipId: Id; disabled: boolean }) {
  return (
    <div className="inspector-field looks-gallery" data-testid="fx-looks">
      <span className="inspector-label" id="fx-looks-label">
        Looks <span className="effect-note">replace the effects below</span>
      </span>
      <div className="looks-grid" role="group" aria-labelledby="fx-looks-label">
        {(Object.keys(LOOKS) as LookKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className="look-btn"
            data-testid={`fx-look-${key}`}
            disabled={disabled}
            onClick={() => applyLookCmd(clipId, key)}
          >
            {LOOKS[key].label}
          </button>
        ))}
      </div>
    </div>
  );
}
