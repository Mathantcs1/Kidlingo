import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

/** Display form of a number: at most 2 decimals, never "-0". */
export function formatNumber(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

/**
 * A typed entry as a finite number, or null for blank / non-numeric / infinite text. Accepts the Unicode minus
 * (U+2212) and a comma as the decimal separator when there is no '.'; text with both ',' and '.' is rejected
 * (ambiguous thousands separator).
 */
export function parseEntry(text: string): number | null {
  let s = text.trim().replace(/\u2212/g, '-');
  if (s === '') return null;
  if (s.includes(',')) {
    if (s.includes('.')) return null;
    s = s.replace(/,/g, '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  testId: string;
  label: string;
  unit: string;
  ariaLabel: string;
  /** The current value in the field's own units, unrounded (e.g. scale × 100). */
  value: number;
  step: number;
  /** Range announced to assistive technology (spinbutton); the edit function does the real clamping. */
  min: number;
  max: number;
  disabled: boolean;
  title?: string;
  onCommit: (value: number) => void;
}

/**
 * A numeric text field with a local draft. Typing and the arrow keys (Up/Down = ±step, Shift = ×10) only change
 * the draft; the value is committed ONCE on Enter or blur, and only when the typed number differs from the
 * STORED (unrounded) value by more than 1e-9 — so typing "0" over a stored 0.004 shown as "0" commits — making
 * every edit one undo step (like a native `change`). Enter during IME composition is ignored. Escape reverts the draft. A blank or non-numeric entry
 * reverts to the current value without committing and marks the field invalid until the next edit. The shown
 * value follows `value` live (undo, other gestures); a change of `value` drops any draft.
 */
export default function NumberField({ testId, label, unit, ariaLabel, value, step, min, max, disabled, title, onCommit }: Props) {
  const shown = formatNumber(value);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setDraft(null), [shown]);

  const commit = (): void => {
    if (draft === null) return;
    const n = parseEntry(draft);
    setDraft(null);
    setInvalid(n === null);
    if (n !== null && Math.abs(n - value) > 1e-9) onCommit(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
          role="spinbutton"
          aria-label={ariaLabel}
          aria-valuenow={Number(shown)}
          aria-valuemin={Number(formatNumber(min))}
          aria-valuemax={Number(formatNumber(max))}
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
