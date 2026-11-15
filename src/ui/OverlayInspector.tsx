import { useEffect, useRef, useState } from 'react';
import type { Clip, Id } from '../core/model';
import { MAX_OVERLAY_SUBTEXT, MAX_OVERLAY_TEXT, OVERLAY_PARAMS, clampOverlayParams } from '../overlays/spec';
import type { OverlayParamDef } from '../overlays/spec';
import './fx.css';
import { formatNumber } from './NumberField';
import { updateOverlayClip } from './overlayCommands';

const TEST_IDS: Record<string, string> = { accent: 'overlay-accent', background: 'overlay-background', textColor: 'overlay-textcolor', corner: 'overlay-corner', source: 'overlay-progress-source', shape: 'overlay-shape' };
const hex = (n: number): string => `#${Math.round(n).toString(16).padStart(6, '0')}`;

/** A text field that commits once on Enter or leaving it; Escape puts the old text back. Typing is not an undo step. */
function CommitText({ testId, label, value, maxLength, disabled, onCommit }: { testId: string; label: string; value: string; maxLength: number; disabled: boolean; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="effect-param">
      <span>{label}</span>
      <input
        type="text"
        value={draft}
        maxLength={maxLength}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            setDraft(value);
          } else if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** A native input whose `change` event (slider released / picker closed) commits once. */
function ParamInput({ clipId, def, value, disabled }: { clipId: Id; def: OverlayParamDef; value: number; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  useEffect(() => setDraft(null), [value]);
  useEffect(() => {
    if (def.kind === 'color' && ref.current) ref.current.value = hex(value);
  }, [def.kind, value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => {
      updateOverlayClip(clipId, { params: { [def.key]: def.kind === 'color' ? parseInt(el.value.slice(1), 16) : Number(el.value) } });
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clipId, def.key, def.kind]);
  const testId = TEST_IDS[def.key] ?? `overlay-${def.key}`;
  if (def.kind === 'color') {
    // Uncontrolled: React would reset a controlled colour input on every `input` event and the picker could not be used.
    return (
      <label className="effect-param fx-color">
        <span>{def.label}</span>
        <input ref={ref} type="color" defaultValue={hex(value)} disabled={disabled} data-testid={testId} aria-label={def.label} />
      </label>
    );
  }
  return (
    <label className="effect-param">
      <span>
        {def.label} {def.kind === 'number' && <output>{formatNumber(shown)}</output>}
      </span>
      <input ref={ref} type="range" min={def.min} max={def.max} step={def.kind === 'number' ? 0.01 : 1} value={shown} disabled={disabled} data-testid={testId} aria-label={def.label} onChange={(e) => setDraft(Number(e.target.value))} />
    </label>
  );
}

function SelectInput({ clipId, def, value, disabled }: { clipId: Id; def: OverlayParamDef; value: number; disabled: boolean }) {
  return (
    <label className="effect-param">
      <span>{def.label}</span>
      <select value={value} disabled={disabled} data-testid={TEST_IDS[def.key] ?? `overlay-${def.key}`} onChange={(e) => updateOverlayClip(clipId, { params: { [def.key]: Number(e.target.value) } })}>
        {(def.options ?? []).map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Text, colours and shape settings of the selected overlay clip. Every committed change is one undo step. */
export default function OverlayInspector({ clip, editable, locked }: { clip: Clip; editable: boolean; locked: boolean }) {
  const spec = clip.overlay;
  if (!spec) return null;
  const disabled = !editable || locked;
  const params = clampOverlayParams(spec.type, spec.params);
  const hasText = spec.type === 'lowerThird' || spec.type === 'subscribe';
  return (
    <div className="inspector-field overlay-inspector" data-testid="overlay-inspector" title={locked ? 'Track is locked' : undefined}>
      <span className="inspector-label">Overlay</span>
      {hasText && (
        <CommitText testId="overlay-text" label={spec.type === 'subscribe' ? 'Label' : 'Title'} value={spec.text} maxLength={MAX_OVERLAY_TEXT} disabled={disabled} onCommit={(text) => updateOverlayClip(clip.id, { text })} />
      )}
      {spec.type === 'lowerThird' && (
        <CommitText testId="overlay-subtext" label="Subtitle" value={spec.subtext} maxLength={MAX_OVERLAY_SUBTEXT} disabled={disabled} onCommit={(subtext) => updateOverlayClip(clip.id, { subtext })} />
      )}
      {OVERLAY_PARAMS[spec.type].map((def) =>
        def.options ? (
          <SelectInput key={def.key} clipId={clip.id} def={def} value={params[def.key]} disabled={disabled} />
        ) : (
          <ParamInput key={def.key} clipId={clip.id} def={def} value={params[def.key]} disabled={disabled} />
        ),
      )}
    </div>
  );
}
