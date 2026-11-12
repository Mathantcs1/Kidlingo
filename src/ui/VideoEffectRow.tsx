import type { Clip, MediaRef, VideoEffect } from '../core/model';
import { VIDEO_EFFECTS } from '../core/videoEffects';
import { KeyColour, ParamSlider } from './effectParams';
import { moveVideoEffectCmd, removeVideoEffectCmd, updateVideoEffectCmd } from './videoEffectCommands';

const KEY_PARAMS = new Set(['keyR', 'keyG', 'keyB']);

function RowButton(props: { id: string; label: string; glyph: string; disabled: boolean; onClick(): void }) {
  return (
    <button type="button" className="effect-btn" disabled={props.disabled} data-testid={props.id} aria-label={props.label} title={props.label} onClick={props.onClick}>
      {props.glyph}
    </button>
  );
}

interface RowProps {
  clip: Clip;
  effect: VideoEffect;
  index: number;
  count: number;
  disabled: boolean;
  /** The LUT media of a `lut` effect (undefined when it is gone from the project). */
  lut?: MediaRef;
}

/** One effect of the stack: toggle, name, move up/down, remove, then its parameters. */
export default function VideoEffectRow({ clip, effect, index, count, disabled, lut }: RowProps) {
  const clipId = clip.id;
  const schema = VIDEO_EFFECTS[effect.type];
  const id = effect.id;
  const lutMissing = effect.type === 'lut' && (!lut || lut.missing);
  const paramsOff = disabled || !effect.enabled;
  return (
    <li className={`effect-row${effect.enabled ? '' : ' effect-off'}`} data-testid={`fx-${id}`} data-type={effect.type}>
      <div className="effect-head">
        <label className="effect-name">
          <input
            type="checkbox"
            checked={effect.enabled}
            disabled={disabled}
            data-testid={`fx-${id}-toggle`}
            aria-label={`${schema.label} on`}
            onChange={(e) => updateVideoEffectCmd(clipId, id, { enabled: e.target.checked })}
          />
          {schema.label}
        </label>
        <RowButton id={`fx-${id}-up`} label={`Move ${schema.label} up`} glyph="↑" disabled={disabled || index === 0} onClick={() => moveVideoEffectCmd(clipId, id, index - 1)} />
        <RowButton id={`fx-${id}-down`} label={`Move ${schema.label} down`} glyph="↓" disabled={disabled || index === count - 1} onClick={() => moveVideoEffectCmd(clipId, id, index + 1)} />
        <RowButton id={`fx-${id}-remove`} label={`Remove ${schema.label}`} glyph="×" disabled={disabled} onClick={() => removeVideoEffectCmd(clipId, id)} />
      </div>
      {effect.type === 'lut' && (
        <p className="effect-lut-name" title={lut?.fileName ?? lut?.name}>
          {lut ? lut.name : 'LUT file removed'}
          {lutMissing && (
            <span className="badge badge-warn" data-testid={`fx-${id}-missing`} title="The LUT file is missing, so this effect is skipped">
              Missing
            </span>
          )}
        </p>
      )}
      {effect.type === 'chromaKey' && <KeyColour clip={clip} effect={effect} disabled={paramsOff} />}
      {schema.params.filter((d) => !(effect.type === 'chromaKey' && KEY_PARAMS.has(d.key))).map((d) => (
        <ParamSlider key={d.key} clip={clip} effect={effect} def={d} disabled={paramsOff} />
      ))}
    </li>
  );
}
