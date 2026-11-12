import { resolvedTransform } from '../core/animate';
import { KEYED_ROTATION_LIMIT } from '../core/keyframes';
import type { TransformProp } from '../core/keyframeEdits';
import type { Clip, Project, Transform } from '../core/model';
import { scaleBounds } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import { TransformKeyframes } from './KeyframeControls';
import { setTransformAtCmd } from './keyframeCommands';
import NumberField from './NumberField';
import { guard } from './Toast';
import { resetClipTransform } from './transformEdits';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

interface FieldSpec {
  key: keyof Transform;
  label: string;
  unit: string;
  ariaLabel: string;
  step: number;
  /** Spinbutton range in shown units, for the format, the transform shown and whether the clip is keyed. */
  range: (fmt: { width: number; height: number }, t: Transform, keyed: boolean) => [number, number];
  /** Transform value → shown number, and back. */
  toShown: (v: number) => number;
  fromShown: (v: number) => number;
}

const same = (v: number): number => v;
const toPercent = (v: number): number => v * 100;
const fromPercent = (v: number): number => v / 100;

// Ranges mirror the edits' clamping: x/y ±4× the format, scale scaleBounds, rotation (−180, 180] (±36 000 keyed, D4).
const FIELDS: FieldSpec[] = [
  {
    key: 'x', label: 'X', unit: 'px', ariaLabel: 'X position in pixels from the centre', step: 1,
    range: (f) => [-4 * f.width, 4 * f.width], toShown: same, fromShown: same,
  },
  {
    key: 'y', label: 'Y', unit: 'px', ariaLabel: 'Y position in pixels from the centre', step: 1,
    range: (f) => [-4 * f.height, 4 * f.height], toShown: same, fromShown: same,
  },
  {
    key: 'scale', label: 'Scale', unit: '%', ariaLabel: 'Scale in percent', step: 1,
    range: (_f, t) => scaleBounds(t.scale).map(toPercent) as [number, number], toShown: toPercent, fromShown: fromPercent,
  },
  {
    key: 'rotation', label: 'Rotation', unit: '°', ariaLabel: 'Rotation in degrees clockwise', step: 1,
    range: (_f, _t, keyed) => (keyed ? [-KEYED_ROTATION_LIMIT, KEYED_ROTATION_LIMIT] : [-180, 180]), toShown: same, fromShown: same,
  },
  {
    key: 'opacity', label: 'Opacity', unit: '%', ariaLabel: 'Opacity in percent', step: 1,
    range: () => [0, 100], toShown: toPercent, fromShown: fromPercent,
  },
];

const LOCKED_HINT = 'Track is locked';
const ALL_PROPS: readonly TransformProp[] = ['position', 'scale', 'rotation', 'opacity'];
const propOf = (k: keyof Transform): TransformProp => (k === 'x' || k === 'y' ? 'position' : k);

/**
 * Position (format px from the canvas centre), scale, rotation and opacity of one picture clip AS SEEN AT THE PLAYHEAD
 * (keys resolved there; Plan 5), plus Reset to the clip's fit framing and a keyframe row per property. Each committed
 * field is one `apply` (one undo step; see NumberField) written at the playhead: a key when the property is animated
 * (refused with a toast off the clip), the static value otherwise. `only` shows just those fields and no Reset (an
 * adjustment layer is full frame: opacity only). Re-renders on playhead moves only while the transform is keyed.
 */
export default function TransformFields({ clip, editable, locked, only }: { clip: Clip; editable: boolean; locked: boolean; only?: readonly (keyof Transform)[] }) {
  const format = useEditor((s) => s.history.present.format);
  const keyed = clip.keys !== undefined;
  const playhead = useEditor((s) => (keyed ? s.playhead : 0));
  const shown = resolvedTransform(clip, playhead, format.fps);
  const disabled = !editable || locked;
  const title = locked ? LOCKED_HINT : undefined;
  const props = only ? ALL_PROPS.filter((prop) => only.some((k) => propOf(k) === prop)) : ALL_PROPS;
  return (
    <div className="inspector-field">
      <span className="inspector-label" id="inspector-transform-label">
        {only ? 'Layer' : 'Position and size'}
      </span>
      <div className="tf-grid" role="group" aria-labelledby="inspector-transform-label" data-testid="inspector-transform">
        {FIELDS.filter((f) => !only || only.includes(f.key)).map((f) => {
          const [min, max] = f.range(format, shown, (clip.keys?.[propOf(f.key)]?.length ?? 0) > 0);
          return (
            <NumberField
              key={f.key}
              testId={`inspector-${f.key}`}
              label={f.label}
              unit={f.unit}
              ariaLabel={f.ariaLabel}
              value={f.toShown(shown[f.key])}
              step={f.step}
              min={min}
              max={max}
              disabled={disabled}
              title={title}
              onCommit={(v) => setTransformAtCmd(clip.id, { [f.key]: f.fromShown(v) })}
            />
          );
        })}
        {!only && <button
          type="button"
          className="tf-reset"
          data-testid="inspector-transform-reset"
          disabled={disabled}
          title={title ?? 'Put the clip back where its frame mode places it'}
          onClick={() => apply((p) => resetClipTransform(p, clip.id))}
        >
          Reset
        </button>}
      </div>
      <TransformKeyframes clip={clip} props={props} disabled={disabled} title={title} />
    </div>
  );
}
