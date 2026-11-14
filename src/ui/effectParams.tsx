// The parameter controls of one picture effect row (Plan 4 Task 10, keyframes Plan 5 Task 7): a slider per param and
// the chroma key colour picker. Each shows the RESOLVED value at the playhead (the playhead is subscribed only while
// the param is animated) and, for animatable params, the keyframe controls (stopwatch, previous/key/next, strip).
import { useEffect, useRef, useState } from 'react';
import { targetKeys, targetValueAt } from '../core/keyframeEdits';
import type { AnimTarget } from '../core/keyframeEdits';
import type { Clip, VideoEffect } from '../core/model';
import { animatableParam, defaultParams } from '../core/videoEffects';
import type { ParamDef } from '../core/videoEffects';
import { useEditor } from '../state/store';
import KeyframeControls from './KeyframeControls';
import { formatNumber } from './NumberField';
import { KEY_TARGETS, keyToHex, setEffectParamCmd, setKeyColourCmd } from './videoEffectCommands';

const MIRROR_MODES = ['Left to right', 'Right to left', 'Top to bottom', 'Four-way'];
export const KEY_HINT = 'A white, grey or black key colour removes all whites, greys and blacks, whatever their brightness.';

const effectKeyIds = (effectId: string, param: string) => {
  const base = `fx-${effectId}-${param}-kf`;
  const loop = `fx-${effectId}-${param}-loop`;
  return { toggle: base, prev: `${base}-prev`, next: `${base}-next`, key: `${base}-key`, strip: `${base}-strip`, loop, loopCount: `${loop}-count` };
};

/** The value of `param` seen at the playhead: evaluated while animated, else the stored value. */
function useShown(clip: Clip, effect: VideoEffect, key: string, fallback: number): number {
  const target: AnimTarget = { kind: 'effect', effectId: effect.id, param: key };
  const animated = targetKeys(clip, target) !== undefined;
  const playhead = useEditor((s) => (animated ? s.playhead : 0));
  const fps = useEditor((s) => s.history.present.format.fps);
  return animated ? (targetValueAt(clip, target, playhead, fps) as number) : (effect.params[key] ?? fallback);
}

interface Common {
  clip: Clip;
  effect: VideoEffect;
  disabled: boolean;
}

/** Follows the slider as a local draft; the project changes ONCE on the native `change` event (release / key press). */
export function ParamSlider({ clip, effect, def, disabled }: Common & { def: ParamDef }) {
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const shown = useShown(clip, effect, def.key, def.def);
  const value = draft ?? shown;
  useEffect(() => setDraft(null), [shown]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => {
      setEffectParamCmd(clip.id, effect.id, def.key, Number(el.value));
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clip.id, effect.id, def.key]);
  const named = effect.type === 'mirror' && def.key === 'mode' ? MIRROR_MODES[Math.round(value)] : undefined;
  const text = named ?? `${formatNumber(value)}${def.unit ? ` ${def.unit}` : ''}`;
  return (
    <>
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
      {animatableParam(effect.type, def.key) && (
        <KeyframeControls clip={clip} target={{ kind: 'effect', effectId: effect.id, param: def.key }} label={def.label} ids={effectKeyIds(effect.id, def.key)} disabled={disabled} />
      )}
    </>
  );
}

/**
 * The key colour: the native picker commits keyR/keyG/keyB together, once, when the picker closes or the value is set
 * (keys at the playhead while the colour is animated). One stopwatch, key diamond and strip cover all three params.
 */
export function KeyColour({ clip, effect, disabled }: Common) {
  const ref = useRef<HTMLInputElement>(null);
  const dflt = defaultParams('chromaKey');
  const keyR = useShown(clip, effect, 'keyR', dflt.keyR);
  const keyG = useShown(clip, effect, 'keyG', dflt.keyG);
  const keyB = useShown(clip, effect, 'keyB', dflt.keyB);
  const hex = keyToHex({ keyR, keyG, keyB });
  // Uncontrolled (so the picker keeps focus while open); follows the shown colour after Undo/Redo and scrubbing.
  useEffect(() => {
    if (ref.current) ref.current.value = hex;
  }, [hex]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => setKeyColourCmd(clip.id, effect.id, el.value);
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clip.id, effect.id]);
  const targets = KEY_TARGETS(effect.id);
  return (
    <>
      <label className="effect-param effect-colour">
        <span>
          Key colour <output>{hex}</output>
        </span>
        <input ref={ref} type="color" defaultValue={hex} disabled={disabled} data-testid={`fx-${effect.id}-colour`} />
      </label>
      <KeyframeControls clip={clip} target={targets[0]} group={targets} label="Key colour" ids={effectKeyIds(effect.id, 'colour')} disabled={disabled} />
      <p className="effect-hint" data-testid={`fx-${effect.id}-hint`}>
        {KEY_HINT}
      </p>
    </>
  );
}
