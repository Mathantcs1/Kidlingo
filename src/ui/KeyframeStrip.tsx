import { localRange } from '../core/keyframes';
import { targetKeys } from '../core/keyframeEdits';
import type { AnimTarget } from '../core/keyframeEdits';
import type { Clip } from '../core/model';
import { keyAtPlayhead, keyTimelineTime, onClip, seekToKeyCmd } from './keyframeCommands';

interface Props {
  clip: Clip;
  target: AnimTarget;
  label: string;
  testId: string;
  playhead: number;
  fps: number;
}

const pct = (v: number): string => `${Math.min(100, Math.max(0, v * 100))}%`;

/**
 * A mini timeline of one property's keys over the clip's visible range: one diamond button per key (Tab-reachable,
 * "Keyframe at 1.20 s"; a click moves the playhead there, no history) and a playhead marker while it is on the clip.
 * Keys beyond the clip's edges (kept by trims, D9) are not shown.
 */
export default function KeyframeStrip({ clip, target, label, testId, playhead, fps }: Props) {
  const [lo, hi] = localRange(clip);
  const span = hi - lo;
  const keys = (targetKeys(clip, target) ?? []).filter((k) => k.t >= lo - 1e-9 && k.t <= hi + 1e-9);
  const current = keyAtPlayhead(clip, target, playhead, fps);
  return (
    <div className="kf-strip" data-testid={testId} role="group" aria-label={`${label} keyframes on the clip`}>
      <span className="kf-strip-track" aria-hidden="true" />
      {onClip(clip, playhead) && span > 0 && (
        <span className="kf-strip-playhead" aria-hidden="true" style={{ left: pct((playhead - clip.start) / span) }} />
      )}
      {keys.map((k) => {
        const time = keyTimelineTime(clip, k.t);
        const here = current !== null && current.t === k.t;
        return (
          <button
            key={k.t}
            type="button"
            className="kf-strip-key"
            data-testid="kf-strip-key"
            data-time={time.toFixed(4)}
            aria-label={`Keyframe at ${time.toFixed(2)} s`}
            aria-current={here || undefined}
            title={`${label} keyframe at ${time.toFixed(2)} s`}
            style={{ left: pct(span > 0 ? (k.t - lo) / span : 0) }}
            onClick={() => seekToKeyCmd(clip.id, k.t)}
          />
        );
      })}
    </div>
  );
}
