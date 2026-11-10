import type { Clip, Project, Transform } from '../core/model';
import { scaleBounds } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import NumberField from './NumberField';
import { guard } from './Toast';
import { resetClipTransform, setClipTransform } from './transformEdits';

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

interface FieldSpec {
  key: keyof Transform;
  label: string;
  unit: string;
  ariaLabel: string;
  step: number;
  /** Spinbutton range in shown units, for the format and the clip's current transform. */
  range: (fmt: { width: number; height: number }, t: Transform) => [number, number];
  /** Transform value → shown number, and back. */
  toShown: (v: number) => number;
  fromShown: (v: number) => number;
}

const same = (v: number): number => v;
const toPercent = (v: number): number => v * 100;
const fromPercent = (v: number): number => v / 100;

// Ranges mirror setClipTransform's clamping: x/y ±4× the format, scale scaleBounds, rotation (−180, 180].
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
    range: () => [-180, 180], toShown: same, fromShown: same,
  },
  {
    key: 'opacity', label: 'Opacity', unit: '%', ariaLabel: 'Opacity in percent', step: 1,
    range: () => [0, 100], toShown: toPercent, fromShown: fromPercent,
  },
];

const LOCKED_HINT = 'Track is locked';

/**
 * Position (format px from the canvas centre), scale, rotation and opacity of one video/image clip, plus Reset to
 * the clip's fit framing. Each committed field is one `apply` (one undo step); see NumberField.
 */
export default function TransformFields({ clip, editable, locked }: { clip: Clip; editable: boolean; locked: boolean }) {
  const format = useEditor((s) => s.history.present.format);
  const disabled = !editable || locked;
  const title = locked ? LOCKED_HINT : undefined;
  return (
    <div className="inspector-field">
      <span className="inspector-label" id="inspector-transform-label">
        Position and size
      </span>
      <div className="tf-grid" role="group" aria-labelledby="inspector-transform-label" data-testid="inspector-transform">
        {FIELDS.map((f) => {
          const [min, max] = f.range(format, clip.transform);
          return (
            <NumberField
              key={f.key}
              testId={`inspector-${f.key}`}
              label={f.label}
              unit={f.unit}
              ariaLabel={f.ariaLabel}
              value={f.toShown(clip.transform[f.key])}
              step={f.step}
              min={min}
              max={max}
              disabled={disabled}
              title={title}
              onCommit={(v) => apply((p) => setClipTransform(p, clip.id, { [f.key]: f.fromShown(v) }))}
            />
          );
        })}
        <button
          type="button"
          className="tf-reset"
          data-testid="inspector-transform-reset"
          disabled={disabled}
          title={title ?? 'Put the clip back where its frame mode places it'}
          onClick={() => apply((p) => resetClipTransform(p, clip.id))}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
