import { useEffect, useRef, useState } from 'react';
import type { Id, MediaRef, VideoEffect } from '../core/model';
import { VIDEO_EFFECTS } from '../core/videoEffects';
import type { ParamDef } from '../core/videoEffects';
import { formatNumber } from './NumberField';
import {
  keyToHex, moveVideoEffectCmd, removeVideoEffectCmd, setKeyColourCmd, updateVideoEffectCmd,
} from './videoEffectCommands';

const MIRROR_MODES = ['Left to right', 'Right to left', 'Top to bottom', 'Four-way'];
export const KEY_HINT = 'A white, grey or black key colour removes all whites, greys and blacks, whatever their brightness.';
const KEY_PARAMS = new Set(['keyR', 'keyG', 'keyB']);

interface SliderProps {
  clipId: Id;
  effect: VideoEffect;
  def: ParamDef;
  disabled: boolean;
}

/** Follows the slider as a local draft; the project changes ONCE on the native `change` event (release / key press). */
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
      updateVideoEffectCmd(clipId, effect.id, { params: { [def.key]: Number(el.value) } });
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clipId, effect.id, def.key]);
  const named = effect.type === 'mirror' && def.key === 'mode' ? MIRROR_MODES[Math.round(value)] : undefined;
  const text = named ?? `${formatNumber(value)}${def.unit ? ` ${def.unit}` : ''}`;
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
        data-testid={`fx-${effect.id}-${def.key}`}
        aria-valuetext={text}
        onChange={(e) => setDraft(Number(e.target.value))}
      />
    </label>
  );
}

/** The key colour: the native picker commits keyR/keyG/keyB together, once, when the picker closes or the value is set. */
function KeyColour({ clipId, effect, disabled }: { clipId: Id; effect: VideoEffect; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const hex = keyToHex({ keyR: effect.params.keyR, keyG: effect.params.keyG, keyB: effect.params.keyB });
  // Uncontrolled (so the picker keeps focus while open); follows the stored colour after Undo/Redo.
  useEffect(() => {
    if (ref.current) ref.current.value = hex;
  }, [hex]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => setKeyColourCmd(clipId, effect.id, el.value);
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clipId, effect.id]);
  return (
    <>
      <label className="effect-param effect-colour">
        <span>
          Key colour <output>{hex}</output>
        </span>
        <input ref={ref} type="color" defaultValue={hex} disabled={disabled} data-testid={`fx-${effect.id}-colour`} />
      </label>
      <p className="effect-hint" data-testid={`fx-${effect.id}-hint`}>
        {KEY_HINT}
      </p>
    </>
  );
}

function RowButton(props: { id: string; label: string; glyph: string; disabled: boolean; onClick(): void }) {
  return (
    <button type="button" className="effect-btn" disabled={props.disabled} data-testid={props.id} aria-label={props.label} title={props.label} onClick={props.onClick}>
      {props.glyph}
    </button>
  );
}

interface RowProps {
  clipId: Id;
  effect: VideoEffect;
  index: number;
  count: number;
  disabled: boolean;
  /** The LUT media of a `lut` effect (undefined when it is gone from the project). */
  lut?: MediaRef;
}

/** One effect of the stack: toggle, name, move up/down, remove, then its parameters. */
export default function VideoEffectRow({ clipId, effect, index, count, disabled, lut }: RowProps) {
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
      {effect.type === 'chromaKey' && <KeyColour clipId={clipId} effect={effect} disabled={paramsOff} />}
      {schema.params.filter((d) => !(effect.type === 'chromaKey' && KEY_PARAMS.has(d.key))).map((d) => (
        <ParamSlider key={d.key} clipId={clipId} effect={effect} def={d} disabled={paramsOff} />
      ))}
    </li>
  );
}
