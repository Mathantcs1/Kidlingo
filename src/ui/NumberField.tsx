import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

/** Display form of a number: at most 2 decimals, never "-0". */
export function formatNumber(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

/** A typed entry as a finite number, or null for blank / non-numeric / infinite text. */
export function parseEntry(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  testId: string;
  label: string;
  unit: string;
  ariaLabel: string;
  value: number;
  step: number;
  disabled: boolean;
  title?: string;
  onCommit: (value: number) => void;
}

/**
 * A numeric text field with a local draft. Typing and the arrow keys (Up/Down = ±step, Shift = ×10) only change
 * the draft; the value is committed ONCE on Enter or blur, and only when it differs from the current value, so
 * every edit is one undo step (like a native `change`). Escape reverts the draft. A blank or non-numeric entry
 * reverts to the current value without committing and marks the field invalid until the next edit. The shown
 * value follows `value` live (undo, other gestures); a change of `value` drops any draft.
 */
export default function NumberField({ testId, label, unit, ariaLabel, value, step, disabled, title, onCommit }: Props) {
  const shown = formatNumber(value);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(null), [shown]);

  const commit = (): void => {
    if (draft === null) return;
    const n = parseEntry(draft);
    setDraft(null);
    setInvalid(n === null);
    if (n !== null && n !== Number(shown)) onCommit(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape' && draft !== null) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
      setInvalid(false);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = parseEntry(draft ?? shown) ?? value;
      const delta = (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1);
      setDraft(formatNumber(base + delta));
      setInvalid(false);
    }
  };

  return (
    <label className="tf-field" title={title}>
      <span className="tf-label">{label}</span>
      <span className="tf-input">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-testid={testId}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          title={title}
          disabled={disabled}
          value={draft ?? shown}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
        <span className="tf-unit" aria-hidden="true">
          {unit}
        </span>
      </span>
    </label>
  );
}
