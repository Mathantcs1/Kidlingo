import type { Clip, Project, Transform } from '../core/model';
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
  /** Transform value → shown number, and back. */
  toShown: (v: number) => number;
  fromShown: (v: number) => number;
}

const same = (v: number): number => v;
const toPercent = (v: number): number => v * 100;
const fromPercent = (v: number): number => v / 100;

const FIELDS: FieldSpec[] = [
  { key: 'x', label: 'X', unit: 'px', ariaLabel: 'X position in pixels from the centre', step: 1, toShown: same, fromShown: same },
  { key: 'y', label: 'Y', unit: 'px', ariaLabel: 'Y position in pixels from the centre', step: 1, toShown: same, fromShown: same },
  { key: 'scale', label: 'Scale', unit: '%', ariaLabel: 'Scale in percent', step: 1, toShown: toPercent, fromShown: fromPercent },
  { key: 'rotation', label: 'Rotation', unit: '°', ariaLabel: 'Rotation in degrees clockwise', step: 1, toShown: same, fromShown: same },
  { key: 'opacity', label: 'Opacity', unit: '%', ariaLabel: 'Opacity in percent', step: 1, toShown: toPercent, fromShown: fromPercent },
];

const LOCKED_HINT = 'Track is locked';

/**
 * Position (format px from the canvas centre), scale, rotation and opacity of one video/image clip, plus Reset to
 * the clip's fit framing. Each committed field is one `apply` (one undo step); see NumberField.
 */
export default function TransformFields({ clip, editable, locked }: { clip: Clip; editable: boolean; locked: boolean }) {
  const disabled = !editable || locked;
  const title = locked ? LOCKED_HINT : undefined;
  return (
    <div className="inspector-field">
      <span className="inspector-label" id="inspector-transform-label">
        Position and size
      </span>
      <div className="tf-grid" role="group" aria-labelledby="inspector-transform-label" data-testid="inspector-transform">
        {FIELDS.map((f) => (
          <NumberField
            key={f.key}
            testId={`inspector-${f.key}`}
            label={f.label}
            unit={f.unit}
            ariaLabel={f.ariaLabel}
            value={f.toShown(clip.transform[f.key])}
            step={f.step}
            disabled={disabled}
            title={title}
            onCommit={(v) => apply((p) => setClipTransform(p, clip.id, { [f.key]: f.fromShown(v) }))}
          />
        ))}
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
