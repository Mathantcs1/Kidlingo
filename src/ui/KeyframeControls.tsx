import { targetKeys } from '../core/keyframeEdits';
import type { AnimTarget, TransformProp } from '../core/keyframeEdits';
import type { Clip } from '../core/model';
import { useEditor } from '../state/store';
import KeyframeStrip from './KeyframeStrip';
import KeyLoopControl from './KeyLoopControl';
import { openEase } from './easeEditorStore';
import { groupRefsAt, jumpToKeyCmd, keyAtPlayhead, keyJumpTime, toggleAnimatedCmd, toggleKeyAtPlayheadCmd } from './keyframeCommands';
import './animation.css';

/** Test ids of one row's controls (Plan 5 §3.5). */
export interface KeyframeIds {
  toggle: string;
  prev: string;
  next: string;
  key: string;
  strip: string;
  /** The loop select and its cycle count (5B Task 8). */
  loop: string;
  loopCount: string;
}

export const transformKeyIds = (prop: TransformProp): KeyframeIds => ({
  toggle: `kf-toggle-${prop}`,
  prev: `kf-prev-${prop}`,
  next: `kf-next-${prop}`,
  key: `kf-key-${prop}`,
  strip: `kf-strip-${prop}`,
  loop: `kf-loop-${prop}`,
  loopCount: `kf-loop-count-${prop}`,
});

interface Props {
  clip: Clip;
  target: AnimTarget;
  /** Targets that switch and key together with `target` (the chroma key colour's three params); `target` leads. */
  group?: readonly AnimTarget[];
  label: string;
  ids: KeyframeIds;
  /** Edits are off (locked track, project not ready); navigation (previous/next, strip) stays available. */
  disabled: boolean;
  title?: string;
}

function Stopwatch() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="kf-icon">
      <circle cx="8" cy="9.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 2h4M8 2v2M8 9.5V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One animatable property's keyframe controls: the stopwatch (animate on/off, ONE step each), previous/next key
 * (playhead only), the key diamond (add a key holding the shown value, or remove the key under the playhead; pressed
 * while one is there) and the mini key strip. Re-renders on playhead moves only while the property is animated.
 */
export default function KeyframeControls({ clip, target, group, label, ids, disabled, title }: Props) {
  const animated = targetKeys(clip, target) !== undefined;
  const playhead = useEditor((s) => (animated ? s.playhead : 0));
  const fps = useEditor((s) => s.history.present.format.fps);
  const here = animated ? keyAtPlayhead(clip, target, playhead, fps) : null;
  const atKey = here !== null;
  const prev = animated ? keyJumpTime(clip, target, playhead, fps, -1) : null;
  const next = animated ? keyJumpTime(clip, target, playhead, fps, 1) : null;
  return (
    <div className="kf-row" role="group" aria-label={`${label} keyframes`} data-animated={animated || undefined}>
      <span className="kf-label">{label}</span>
      <button
        type="button"
        className="kf-btn kf-toggle"
        data-testid={ids.toggle}
        aria-pressed={animated}
        aria-label={`Animate ${label}`}
        title={title ?? (animated ? `Stop animating ${label} (keeps the value at the playhead)` : `Animate ${label} from the playhead`)}
        disabled={disabled}
        onClick={() => toggleAnimatedCmd(clip.id, target, group)}
      >
        <Stopwatch />
      </button>
      <button
        type="button"
        className="kf-btn"
        data-testid={ids.prev}
        aria-label={`Previous ${label} keyframe`}
        title={`Previous ${label} keyframe`}
        aria-disabled={prev === null || undefined}
        onClick={() => prev !== null && jumpToKeyCmd(clip.id, target, -1)}
      >
        <span aria-hidden="true">◀</span>
      </button>
      <button
        type="button"
        className="kf-btn kf-key"
        data-testid={ids.key}
        aria-pressed={atKey}
        aria-label={`${label} keyframe at the playhead`}
        title={title ?? (atKey ? `Remove the ${label} keyframe here` : `Add a ${label} keyframe here`)}
        disabled={disabled}
        onClick={() => toggleKeyAtPlayheadCmd(clip.id, target, group)}
      >
        <span aria-hidden="true">◆</span>
      </button>
      <button
        type="button"
        className="kf-btn"
        data-testid={ids.next}
        aria-label={`Next ${label} keyframe`}
        title={`Next ${label} keyframe`}
        aria-disabled={next === null || undefined}
        onClick={() => next !== null && jumpToKeyCmd(clip.id, target, 1)}
      >
        <span aria-hidden="true">▶</span>
      </button>
      <button
        type="button"
        className="kf-btn kf-ease"
        data-testid="kf-ease-open"
        aria-label={`Ease of the ${label} keyframe at the playhead`}
        title={atKey ? `Edit the ease of the ${label} keyframe here` : `Move the playhead onto a ${label} keyframe to edit its ease`}
        aria-disabled={!atKey || undefined}
        onClick={() => here && openEase(clip.id, groupRefsAt(clip, group ?? [target], here.t))}
      >
        <span aria-hidden="true">∿</span>
      </button>
      {animated && <KeyframeStrip clip={clip} target={target} group={group} label={label} testId={ids.strip} playhead={playhead} fps={fps} />}
      {animated && (
        <KeyLoopControl clip={clip} target={target} group={group ?? [target]} label={label} ids={{ loop: ids.loop, count: ids.loopCount }} disabled={disabled} title={title} playhead={playhead} fps={fps} />
      )}
    </div>
  );
}

const PROP_LABELS: Record<TransformProp, string> = { position: 'Position', scale: 'Scale', rotation: 'Rotation', opacity: 'Opacity' };

/** The keyframe rows of a clip's transform properties (`props`: an adjustment layer animates opacity only). */
export function TransformKeyframes({ clip, props, disabled, title }: { clip: Clip; props: readonly TransformProp[]; disabled: boolean; title?: string }) {
  return (
    <div className="kf-rows" data-testid="inspector-keyframes">
      {props.map((prop) => (
        <KeyframeControls
          key={prop}
          clip={clip}
          target={{ kind: 'transform', prop }}
          label={PROP_LABELS[prop]}
          ids={transformKeyIds(prop)}
          disabled={disabled}
          title={title}
        />
      ))}
    </div>
  );
}
