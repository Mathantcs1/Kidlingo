import type { BlendMode, Clip } from '../core/model';
import { BLEND_MODES } from '../core/videoEffects';
import { setBlendCmd } from './videoEffectCommands';

export const BLEND_LABEL: Record<BlendMode, string> = {
  normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten',
  colourDodge: 'Colour dodge', colourBurn: 'Colour burn', hardLight: 'Hard light', softLight: 'Soft light',
  difference: 'Difference', exclusion: 'Exclusion',
};

/**
 * How the selected picture clip mixes with the layers below it. Each choice is ONE undo step; disabled for a clip on a
 * locked track (like the transform fields).
 */
export default function BlendModeSelect({ clip, editable, locked }: { clip: Clip; editable: boolean; locked: boolean }) {
  return (
    <label className="inspector-field">
      <span className="inspector-label">Blend</span>
      <select
        data-testid="blend-mode-select"
        aria-label="Blend mode with the layers below"
        title={locked ? 'Track is locked' : 'How this clip mixes with the layers below it'}
        value={clip.blend ?? 'normal'}
        disabled={!editable || locked}
        onChange={(e) => setBlendCmd(clip.id, e.target.value as BlendMode)}
      >
        {BLEND_MODES.map((m) => (
          <option key={m} value={m}>
            {BLEND_LABEL[m]}
          </option>
        ))}
      </select>
    </label>
  );
}
