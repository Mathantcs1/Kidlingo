import { EFFECT_SCHEMAS } from '../audio/effects/params';
import { PRESET_LABELS, availablePresets } from '../audio/presets';
import type { PresetKey } from '../audio/presets';
import type { AudioEffectType, Clip } from '../core/model';
import EffectRow from './EffectRow';
import { addClipEffect, applyClipPreset, normaliseClip } from './effectCommands';

const ADDABLE = (Object.keys(EFFECT_SCHEMAS) as AudioEffectType[]).filter((t) => EFFECT_SCHEMAS[t].available);

interface Props {
  clip: Clip;
  disabled: boolean;
  title?: string;
}

/**
 * The selected clip's effect chain, applied in list order: add an effect, apply a voice preset (replaces the whole
 * chain), Normalise (sets a gain effect so the peak reaches -1 dBFS), and per effect toggle / reorder / remove /
 * parameters. Every action is one undo step; playback pauses on any change, so effects are heard on the next Play.
 */
export default function EffectList({ clip, disabled, title }: Props) {
  const effects = clip.audio.effects;
  return (
    <div className="inspector-field effect-list" data-testid="effect-list" title={title}>
      <span className="inspector-label" id="effect-list-label">
        Effects
      </span>
      <div className="effect-tools" role="group" aria-labelledby="effect-list-label">
        <select
          data-testid="effect-add"
          aria-label="Add effect"
          value=""
          disabled={disabled}
          onChange={(e) => {
            const type = e.target.value as AudioEffectType;
            if (type) addClipEffect(clip.id, type);
          }}
        >
          <option value="">Add effect…</option>
          {ADDABLE.map((t) => (
            <option key={t} value={t}>
              {EFFECT_SCHEMAS[t].label}
            </option>
          ))}
        </select>
        <select
          data-testid="audio-preset"
          aria-label="Apply a preset (replaces the effects)"
          value=""
          disabled={disabled}
          onChange={(e) => {
            const key = e.target.value as PresetKey;
            if (key) applyClipPreset(clip.id, key);
          }}
        >
          <option value="">Preset…</option>
          {availablePresets().map(([key]) => (
            <option key={key} value={key}>
              {PRESET_LABELS[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="audio-normalise"
          disabled={disabled}
          title="Set a gain effect so the loudest peak of this clip reaches -1 dBFS"
          onClick={() => void normaliseClip(clip.id, clip.mediaId)}
        >
          Normalise
        </button>
      </div>
      {effects.length > 0 && (
        <ol className="effect-rows">
          {effects.map((e, i) => (
            <EffectRow key={e.id} clipId={clip.id} effect={e} index={i} count={effects.length} disabled={disabled} />
          ))}
        </ol>
      )}
    </div>
  );
}
