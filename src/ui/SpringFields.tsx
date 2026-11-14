// The spring's parameters (Plan 5B Task 8, D5): four named presets (Gentle, Snappy, Bouncy, Wobbly) and three numeric
// fields (stiffness, damping, mass) that commit on Enter or blur (ONE step each, an unchanged value adds none), plus a
// note when the spring is still moving at the next key (it then jumps there). Used by the ease editor.
import { useState } from 'react';
import { SPRING_LIMITS } from '../core/easing';
import type { SpringParams } from '../core/easing';
import { SPRING_PRESETS, springResidual } from '../core/spring';
import { parseField } from './easeEditorMath';
import './ease.css';

/** Above this distance from rest at the segment end the note appears (D5). */
export const SETTLE_LIMIT = 0.02;
const FIELDS: { key: keyof SpringParams; label: string; step: number }[] = [
  { key: 'stiffness', label: 'Stiffness', step: 10 },
  { key: 'damping', label: 'Damping', step: 1 },
  { key: 'mass', label: 'Mass', step: 0.1 },
];

const same = (a: Readonly<SpringParams>, b: Readonly<SpringParams>): boolean => a.stiffness === b.stiffness && a.damping === b.damping && a.mass === b.mass;

/** The "does not settle" note for a spring over a segment of `seconds`, or null when it settles in time. */
export function springNote(s: SpringParams, seconds: number): string | null {
  const r = springResidual(s, seconds);
  if (!(r > SETTLE_LIMIT)) return null;
  return `Still moving at the next key (${Math.min(100, Math.round(r * 100))}% away): it jumps there. Lengthen the segment or raise the damping.`;
}

interface Props {
  spring: SpringParams;
  /** The segment's physical duration (the note and the curve depend on it). */
  seconds: number;
  disabled: boolean;
  onCommit: (s: SpringParams) => void;
  /** Test id prefix: `<prefix>-gentle`, `<prefix>-stiffness`, `<prefix>-note`. */
  prefix?: string;
}

export default function SpringFields({ spring, seconds, disabled, onCommit, prefix = 'ease-spring' }: Props) {
  const [texts, setTexts] = useState<Partial<Record<keyof SpringParams, string>>>({});
  const note = springNote(spring, seconds);
  const commitField = (key: keyof SpringParams): void => {
    const text = texts[key];
    if (text === undefined) return;
    setTexts((t) => ({ ...t, [key]: undefined }));
    const n = parseField(text);
    if (n === null) return;
    const [lo, hi] = SPRING_LIMITS[key];
    const next = { ...spring, [key]: Math.min(hi, Math.max(lo, n)) };
    if (!same(next, spring)) onCommit(next);
  };
  return (
    <div className="spring-fields" role="group" aria-label="Spring">
      <div className="spring-presets">
        {SPRING_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="ease-preset spring-chip"
            data-testid={`${prefix}-${p.key}`}
            aria-pressed={same(p.spring, spring)}
            disabled={disabled}
            onClick={() => !same(p.spring, spring) && onCommit({ ...p.spring })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="spring-inputs">
        {FIELDS.map(({ key, label, step }) => (
          <label key={key} className="ease-field">
            <span>{label}</span>
            <input
              type="number"
              inputMode="decimal"
              step={step}
              min={SPRING_LIMITS[key][0]}
              max={SPRING_LIMITS[key][1]}
              data-testid={`${prefix}-${key}`}
              aria-label={`Spring ${label.toLowerCase()}`}
              disabled={disabled}
              value={texts[key] ?? String(spring[key])}
              onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                commitField(key);
              }}
              onBlur={() => commitField(key)}
            />
          </label>
        ))}
      </div>
      {note && <p className="ease-note spring-note" data-testid={`${prefix}-note`} role="status">{note}</p>}
    </div>
  );
}
