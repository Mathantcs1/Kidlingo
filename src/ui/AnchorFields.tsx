import { targetValueAt } from '../core/keyframeEdits';
import type { Clip } from '../core/model';
import { useEditor } from '../state/store';
import { ANCHOR_TARGET, anchorToCropCentreCmd, resetAnchorCmd, setAnchorAtCmd } from './cropCommands';
import { TransformKeyframes } from './KeyframeControls';
import NumberField from './NumberField';

const ANCHOR_ONLY = ['anchor'] as const;

/**
 * The pivot of scale and rotation as a percent of the full frame from its centre (Plan 5E D4), AS SEEN AT THE PLAYHEAD,
 * with its stopwatch row. A commit is a key when the anchor is animated, else the static value (one undo step); moving
 * it moves the picture (no compensation). Reset and "Anchor to crop centre" refuse while it is animated.
 */
export default function AnchorFields({ clip, disabled, title }: { clip: Clip; disabled: boolean; title?: string }) {
  const keyed = (clip.keys?.anchor?.length ?? 0) > 0;
  const playhead = useEditor((s) => (keyed ? s.playhead : 0));
  const fps = useEditor((s) => s.history.present.format.fps);
  const v = targetValueAt(clip, ANCHOR_TARGET, playhead, fps) as { x: number; y: number };
  const field = (axis: 'x' | 'y', label: string) => (
    <NumberField
      testId={`anchor-${axis}`}
      label={label}
      unit="%"
      ariaLabel={`Anchor ${axis} in percent of the frame from its centre`}
      value={v[axis] * 100}
      step={1}
      min={-200}
      max={200}
      disabled={disabled}
      title={title}
      onCommit={(n) => setAnchorAtCmd(clip.id, { ...v, [axis]: n / 100 })}
    />
  );
  return (
    <div className="inspector-field" data-testid="anchor-section">
      <div className="tf-grid" role="group" aria-label="Anchor point">
        {field('x', 'X')}
        {field('y', 'Y')}
      </div>
      <div className="crop-actions">
        <button type="button" className="tf-reset" data-testid="anchor-to-crop" disabled={disabled || keyed || !clip.crop} title={title ?? 'Put the pivot at the centre of the cropped area'} onClick={() => anchorToCropCentreCmd(clip.id)}>
          To crop centre
        </button>
        <button type="button" className="tf-reset" data-testid="anchor-reset" disabled={disabled || keyed || !clip.anchor} title={title ?? 'Put the pivot back at the centre'} onClick={() => resetAnchorCmd(clip.id)}>
          Reset
        </button>
      </div>
      <TransformKeyframes clip={clip} props={ANCHOR_ONLY} disabled={disabled} title={title} />
    </div>
  );
}
