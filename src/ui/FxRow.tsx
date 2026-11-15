import { useEffect, useRef, useState } from 'react';
import type { FxParamDef } from '../fx/types';
import { FX_SCHEMAS } from '../fx/params';
import type { Id, VisualEffect } from '../core/model';
import { formatNumber } from './NumberField';
import { moveClipFx, removeClipFx, resetClipFx, updateClipFx } from './fxCommands';
import LutPicker from './LutPicker';

interface ParamProps {
  clipId: Id;
  fx: VisualEffect;
  def: FxParamDef;
  disabled: boolean;
}

const hex = (n: number): string => `#${Math.round(n).toString(16).padStart(6, '0')}`;

/** A slider that follows a local draft and commits ONCE on the native `change` event (pointer release / key press). */
function NumberParam({ clipId, fx, def, disabled }: ParamProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const stored = fx.params[def.key] ?? def.def;
  const value = draft ?? stored;
  useEffect(() => setDraft(null), [stored]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => {
      updateClipFx(clipId, fx.id, { params: { [def.key]: Number(el.value) } });
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clipId, fx.id, def.key]);
  const text = `${formatNumber(value)}${def.unit ? ` ${def.unit}` : ''}`;
  return (
    <label className="effect-param">
      <span>
        {def.label} <output>{text}</output>
      </span>
      <input ref={ref} type="range" min={def.min} max={def.max} step={def.step} value={value} disabled={disabled} data-testid={`fx-${fx.id}-${def.key}`} aria-valuetext={text} onChange={(e) => setDraft(Number(e.target.value))} />
    </label>
  );
}

/** A colour picker; the native `change` event (picker closed) commits once. */
function ColorParam({ clipId, fx, def, disabled }: ParamProps) {
  const ref = useRef<HTMLInputElement>(null);
  const stored = fx.params[def.key] ?? def.def;
  // Uncontrolled: React would reset a controlled colour input on every `input` event and the picker could not be used.
  useEffect(() => {
    if (ref.current) ref.current.value = hex(stored);
  }, [stored]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => updateClipFx(clipId, fx.id, { params: { [def.key]: parseInt(el.value.slice(1), 16) } });
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clipId, fx.id, def.key]);
  return (
    <label className="effect-param fx-color">
      <span>{def.label}</span>
      <input ref={ref} type="color" defaultValue={hex(stored)} disabled={disabled} data-testid={`fx-${fx.id}-${def.key}`} aria-label={def.label} />
    </label>
  );
}

function SelectParam({ clipId, fx, def, disabled }: ParamProps) {
  return (
    <label className="effect-param">
      <span>{def.label}</span>
      <select value={fx.params[def.key] ?? def.def} disabled={disabled} data-testid={`fx-${fx.id}-${def.key}`} onChange={(e) => updateClipFx(clipId, fx.id, { params: { [def.key]: Number(e.target.value) } })}>
        {(def.options ?? []).map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Param(props: ParamProps) {
  if (props.def.kind === 'color') return <ColorParam {...props} />;
  if (props.def.kind === 'select') return <SelectParam {...props} />;
  return <NumberParam {...props} />;
}

function RowButton({ id, label, glyph, disabled, onClick }: { id: string; label: string; glyph: string; disabled: boolean; onClick(): void }) {
  return (
    <button type="button" className="effect-btn" disabled={disabled} data-testid={id} aria-label={label} title={label} onClick={onClick}>
      {glyph}
    </button>
  );
}

interface RowProps {
  clipId: Id;
  fx: VisualEffect;
  index: number;
  count: number;
  disabled: boolean;
}

/** One effect of the stack: enable toggle, name, reset, move up/down, remove, then its parameter controls. */
export default function FxRow({ clipId, fx, index, count, disabled }: RowProps) {
  const schema = FX_SCHEMAS[fx.type];
  const id = fx.id;
  return (
    <li className={`effect-row${fx.enabled ? '' : ' effect-off'}`} data-testid={`fx-${id}`} data-type={fx.type}>
      <div className="effect-head">
        <label className="effect-name">
          <input type="checkbox" checked={fx.enabled} disabled={disabled} data-testid={`fx-${id}-toggle`} aria-label={`${schema.label} on`} onChange={(e) => updateClipFx(clipId, id, { enabled: e.target.checked })} />
          {schema.label}
        </label>
        <RowButton id={`fx-${id}-reset`} label={`Reset ${schema.label}`} glyph="↺" disabled={disabled} onClick={() => resetClipFx(clipId, id, fx.type)} />
        <RowButton id={`fx-${id}-up`} label={`Move ${schema.label} up`} glyph="↑" disabled={disabled || index === 0} onClick={() => moveClipFx(clipId, id, index - 1)} />
        <RowButton id={`fx-${id}-down`} label={`Move ${schema.label} down`} glyph="↓" disabled={disabled || index === count - 1} onClick={() => moveClipFx(clipId, id, index + 1)} />
        <RowButton id={`fx-${id}-remove`} label={`Remove ${schema.label}`} glyph="×" disabled={disabled} onClick={() => removeClipFx(clipId, id)} />
      </div>
      {schema.needsLut && <LutPicker clipId={clipId} fx={fx} disabled={disabled} />}
      {schema.params.map((def) => (
        <Param key={def.key} clipId={clipId} fx={fx} def={def} disabled={disabled || !fx.enabled} />
      ))}
    </li>
  );
}
