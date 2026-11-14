// The settings of one filled preset slot (Plan 5B §7): duration (the cycle on a loop), delay (in/out), the emphasis
// position ("at playhead"), a direction segmented control, a slider per other param and the ease. Sliders follow the
// pointer locally and commit ONCE on the native `change` (release / key press); buttons and the select commit once
// per choice. Every commit is one undo step (presetCommands).
import { useEffect, useRef, useState } from 'react';
import { SPRING_DEFAULT } from '../core/easing';
import type { Ease, EaseKind } from '../core/easing';
import { localRange } from '../core/keyframes';
import type { Clip } from '../core/model';
import type { PresetPatch } from '../core/motionEdits';
import { MOTION_LIMITS } from '../core/motionTypes';
import type { MotionSlot } from '../core/motionTypes';
import { PRESET_SCHEMA } from '../core/presets';
import { formatNumber } from './NumberField';
import { emphasisHereCmd, paramOf, setPresetParamsCmd } from './presetCommands';
import type { SlotUse } from './presetCommands';

const DIRECTIONS = ['Left', 'Right', 'Up', 'Down', 'Up-left', 'Up-right', 'Down-left', 'Down-right'];
const ARROWS = ['←', '→', '↑', '↓', '↖', '↗', '↙', '↘'];
const EASES: [EaseKind, string][] = [
  ['linear', 'Linear'], ['easeIn', 'Ease in'], ['easeOut', 'Ease out'], ['easeInOut', 'Ease in-out'], ['back', 'Back'],
  ['elastic', 'Elastic'], ['bounce', 'Bounce'], ['hold', 'Hold'], ['spring', 'Spring'], ['bezier', 'Custom'],
];
/** Hidden params: the seed is set once when the preset is chosen. */
const HIDDEN = new Set(['direction', 'seed']);

interface SliderProps {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled: boolean;
  onCommit(v: number): void;
}

/** A range input that commits once per release (native `change`), like 5A's ParamSlider. */
export function PresetSlider({ testId, label, value, min, max, step, unit, disabled, onCommit }: SliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => setDraft(null), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => {
      setDraft(null);
      commitRef.current(Number(el.value));
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  const shown = draft ?? value;
  const text = `${formatNumber(shown)}${unit ? ` ${unit}` : ''}`;
  return (
    <label className="anim-param">
      <span>
        {label} <output>{text}</output>
      </span>
      <input
        ref={ref}
        type="range"
        min={min}
        max={Math.max(max, value)}
        step={step}
        value={shown}
        disabled={disabled}
        data-testid={testId}
        aria-valuetext={text}
        onChange={(e) => setDraft(Number(e.target.value))}
      />
    </label>
  );
}

const easeFor = (kind: EaseKind, cur: Ease): Ease =>
  kind === 'spring' ? { kind, spring: { ...SPRING_DEFAULT } } : kind === 'bezier' ? cur : { kind };

interface Props {
  clip: Clip;
  slot: MotionSlot;
  use: SlotUse;
  disabled: boolean;
}

export default function PresetParams({ clip, slot, use, disabled }: Props) {
  const set = (patch: PresetPatch): void => setPresetParamsCmd(clip.id, slot, patch);
  const schema = PRESET_SCHEMA[use.preset];
  const dir = schema.params.find((d) => d.key === 'direction');
  const direction = paramOf(use, 'direction');
  const kenBurns = use.preset === 'kenBurns';
  const [lo] = localRange(clip);
  const id = (k: string): string => `anim-${slot}-${k}`;
  return (
    <div className="anim-params" data-testid={id('params')}>
      {!kenBurns && (
        <PresetSlider
          testId={id('duration')} label={slot === 'loop' ? 'Cycle' : 'Duration'} unit="s" value={use.duration} disabled={disabled}
          min={slot === 'loop' ? MOTION_LIMITS.period[0] : MOTION_LIMITS.duration[0]} max={10} step={0.05} onCommit={(duration) => set({ duration })}
        />
      )}
      {(slot === 'in' || slot === 'out') && (
        <PresetSlider testId={id('delay')} label="Delay" unit="s" value={use.delay} min={0} max={10} step={0.05} disabled={disabled} onCommit={(delay) => set({ delay })} />
      )}
      {slot === 'emphasis' && use.at !== undefined && (
        <div className="anim-at">
          <span>
            At <output data-testid="anim-emphasis-at">{formatNumber(clip.start + use.at - lo)} s</output>
          </span>
          <button type="button" data-testid="anim-emphasis-here" disabled={disabled} onClick={() => emphasisHereCmd(clip.id)}>
            At playhead
          </button>
        </div>
      )}
      {dir && direction !== undefined && (
        <div className="anim-direction" role="radiogroup" aria-label={dir.label} data-testid={id('direction')}>
          {DIRECTIONS.slice(0, dir.max + 1).map((name, i) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={direction === i}
              aria-label={name}
              title={name}
              data-testid={id(`direction-${i}`)}
              disabled={disabled}
              onClick={() => direction !== i && set({ params: { direction: i } })}
            >
              {ARROWS[i]}
            </button>
          ))}
        </div>
      )}
      {schema.params.filter((d) => !HIDDEN.has(d.key)).map((d) => (
        <PresetSlider
          key={d.key} testId={id(d.key)} label={d.label} unit={d.unit} value={paramOf(use, d.key) ?? d.def}
          min={d.min} max={d.max} step={d.step} disabled={disabled} onCommit={(v) => set({ params: { [d.key]: v } })}
        />
      ))}
      <label className="anim-param">
        <span>Ease</span>
        <select data-testid={id('ease')} aria-label="Ease" value={use.ease.kind} disabled={disabled} onChange={(e) => set({ ease: easeFor(e.target.value as EaseKind, use.ease) })}>
          {EASES.filter(([k]) => k !== 'bezier' || use.ease.kind === 'bezier').map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
