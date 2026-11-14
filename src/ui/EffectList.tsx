import { useState } from 'react';
import { EFFECT_SCHEMAS } from '../audio/effects/params';
import { PRESET_LABELS, availablePresets } from '../audio/presets';
import type { PresetKey } from '../audio/presets';
import type { AudioEffectType, Clip } from '../core/model';
import EffectRow, { DENOISE_NOTE } from './EffectRow';
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
  // A native <select> fires `change` on every arrow key on some platforms, so choosing a type only stages it.
  const [chosen, setChosen] = useState<AudioEffectType | ''>('');
  return (
    <div className="inspector-field effect-list" data-testid="effect-list" title={title}>
      <span className="inspector-label" id="effect-list-label">
        Audio effects
      </span>
      <div className="effect-tools" role="group" aria-labelledby="effect-list-label">
        <select
          data-testid="effect-add"
          aria-label="Effect to add"
          value={chosen}
          disabled={disabled}
          onChange={(e) => setChosen(e.target.value as AudioEffectType | '')}
        >
          <option value="">Effect…</option>
          {ADDABLE.map((t) => (
            <option key={t} value={t} title={t === 'denoise' ? DENOISE_NOTE : undefined}>
              {EFFECT_SCHEMAS[t].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="effect-add-button"
          disabled={disabled || !chosen}
          onClick={() => {
            if (!chosen) return;
            addClipEffect(clip.id, chosen);
            setChosen('');
          }}
        >
          Add
        </button>
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
          title="Sets a gain effect so the clip's loudest SOURCE peak reaches -1 dBFS (ignores the clip volume and other effects)"
          aria-label="Normalise: gain effect bringing the clip's source peak to -1 dBFS, ignoring volume and other effects"
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
