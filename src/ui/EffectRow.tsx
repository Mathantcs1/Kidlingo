import { useEffect, useRef, useState } from 'react';
import { EFFECT_SCHEMAS } from '../audio/effects/params';
import type { ParamDef } from '../audio/effects/params';
import type { AudioEffect, Id } from '../core/model';
import { formatNumber } from './NumberField';
import { moveClipEffect, removeClipEffect, updateClipEffect } from './effectCommands';

interface SliderProps {
  clipId: Id;
  effect: AudioEffect;
  def: ParamDef;
  disabled: boolean;
}

/**
 * One parameter: follows the slider as a local draft; the project changes ONCE on the native `change` event
 * (pointer release, or each key press), so a drag is one undo step (D10: heard on the next Play).
 */
function ParamSlider({ clipId, effect, def, disabled }: SliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const stored = effect.params[def.key] ?? def.def;
  const value = draft ?? stored;
  useEffect(() => setDraft(null), [stored]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => {
      updateClipEffect(clipId, effect.id, { params: { [def.key]: Number(el.value) } });
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clipId, effect.id, def.key]);
  const text = `${formatNumber(value)}${def.unit ? ` ${def.unit}` : ''}`;
  return (
    <label className="effect-param">
      <span>
        {def.label} <output>{text}</output>
      </span>
      <input
        ref={ref}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        disabled={disabled}
        data-testid={`effect-${effect.id}-${def.key}`}
        aria-valuetext={text}
        onChange={(e) => setDraft(Number(e.target.value))}
      />
    </label>
  );
}

interface ButtonProps {
  id: string;
  label: string;
  glyph: string;
  disabled: boolean;
  onClick(): void;
}

function RowButton({ id, label, glyph, disabled, onClick }: ButtonProps) {
  return (
    <button type="button" className="effect-btn" disabled={disabled} data-testid={id} aria-label={label} title={label} onClick={onClick}>
      {glyph}
    </button>
  );
}

interface RowProps {
  clipId: Id;
  effect: AudioEffect;
  index: number;
  count: number;
  disabled: boolean;
}

/** One effect of the chain: enable toggle, name, move up/down, remove, then its parameter sliders. */
export default function EffectRow({ clipId, effect, index, count, disabled }: RowProps) {
  const schema = EFFECT_SCHEMAS[effect.type];
  const id = effect.id;
  return (
    <li className={`effect-row${effect.enabled ? '' : ' effect-off'}`} data-testid={`effect-${id}`} data-type={effect.type}>
      <div className="effect-head">
        <label className="effect-name">
          <input
            type="checkbox"
            checked={effect.enabled}
            disabled={disabled}
            data-testid={`effect-${id}-toggle`}
            aria-label={`${schema.label} on`}
            onChange={(e) => updateClipEffect(clipId, id, { enabled: e.target.checked })}
          />
          {schema.label}
        </label>
        <RowButton
          id={`effect-${id}-up`}
          label={`Move ${schema.label} up`}
          glyph="↑"
          disabled={disabled || index === 0}
          onClick={() => moveClipEffect(clipId, id, index - 1)}
        />
        <RowButton
          id={`effect-${id}-down`}
          label={`Move ${schema.label} down`}
          glyph="↓"
          disabled={disabled || index === count - 1}
          onClick={() => moveClipEffect(clipId, id, index + 1)}
        />
        <RowButton
          id={`effect-${id}-remove`}
          label={`Remove ${schema.label}`}
          glyph="×"
          disabled={disabled}
          onClick={() => removeClipEffect(clipId, id)}
        />
      </div>
      {schema.params.map((def) => (
        <ParamSlider key={def.key} clipId={clipId} effect={effect} def={def} disabled={disabled || !effect.enabled} />
      ))}
    </li>
  );
}
