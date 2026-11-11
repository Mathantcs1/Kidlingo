import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Clip, OverlayType, StickerKind } from '../core/model';
import { STICKER_KINDS, STICKER_LABELS } from '../core/overlaySpec';
import { updateOverlayCmd } from './overlayCommands';

/** What each overlay type shows: which text fields it has and how its two colours are called. */
const FIELDS: Record<OverlayType, { text?: string; subtext?: string; colour: string; accent: string }> = {
  lowerThird: { text: 'Title', subtext: 'Subtitle', colour: 'Box colour', accent: 'Accent colour' },
  subscribe: { text: 'Button text', colour: 'Button colour', accent: 'Text and icon colour' },
  progressBar: { colour: 'Track colour', accent: 'Fill colour' },
  sticker: { colour: 'Fill colour', accent: 'Outline colour' },
};

interface FieldProps {
  testId: string;
  label: string;
  value: string;
  disabled: boolean;
  onCommit(v: string): void;
}

/** A text field with a local draft: the clip changes ONCE, on Enter or blur (not per keystroke); Escape reverts. */
function TextField({ testId, label, value, disabled, onCommit }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
    else if (e.key === 'Escape') setDraft(null);
  };
  return (
    <label className="inspector-field">
      <span className="inspector-label">{label}</span>
      <input
        type="text"
        className="overlay-text-input"
        value={draft ?? value}
        disabled={disabled}
        data-testid={testId}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
      />
    </label>
  );
}

/** A native colour picker: uncontrolled, commits once on the native `change` (picker closed or value set). */
function ColourField({ testId, label, value, disabled, onCommit }: FieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  useEffect(() => {
    if (ref.current) ref.current.value = value;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => onCommitRef.current(el.value);
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  return (
    <label className="inspector-field overlay-colour-field">
      <span className="inspector-label">
        {label} <output>{value}</output>
      </span>
      <input ref={ref} type="color" defaultValue={value} disabled={disabled} data-testid={testId} aria-label={label} />
    </label>
  );
}

/** Text, colours and sticker of the selected overlay clip. Each field is one undo step; disabled on a locked track. */
export default function OverlayInspector({ clip, editable, locked }: { clip: Clip; editable: boolean; locked: boolean }) {
  const spec = clip.overlay;
  if (!spec) return null;
  const f = FIELDS[spec.type];
  const disabled = !editable || locked;
  return (
    <section className="inspector-field overlay-panel" data-testid="overlay-panel" aria-label="Overlay settings">
      {f.text && <TextField testId="overlay-text" label={f.text} value={spec.text} disabled={disabled} onCommit={(text) => updateOverlayCmd(clip.id, { text })} />}
      {f.subtext && (
        <TextField testId="overlay-subtext" label={f.subtext} value={spec.subtext} disabled={disabled} onCommit={(subtext) => updateOverlayCmd(clip.id, { subtext })} />
      )}
      {spec.type === 'sticker' && (
        <label className="inspector-field">
          <span className="inspector-label">Sticker</span>
          <select
            data-testid="overlay-sticker"
            aria-label="Sticker"
            value={spec.sticker ?? 'heart'}
            disabled={disabled}
            title={locked ? 'Track is locked' : undefined}
            onChange={(e) => updateOverlayCmd(clip.id, { sticker: e.target.value as StickerKind })}
          >
            {STICKER_KINDS.map((k) => (
              <option key={k} value={k}>
                {STICKER_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <ColourField testId="overlay-colour" label={f.colour} value={spec.colour} disabled={disabled} onCommit={(colour) => updateOverlayCmd(clip.id, { colour })} />
      <ColourField testId="overlay-accent" label={f.accent} value={spec.accent} disabled={disabled} onCommit={(accent) => updateOverlayCmd(clip.id, { accent })} />
    </section>
  );
}
