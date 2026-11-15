import { useState } from 'react';
import { clipDuration } from '../core/clipTime';
import type { Clip, MediaRef } from '../core/model';
import { MAX_SPEED, MIN_SPEED } from '../core/speedTypes';
import { useEditor } from '../state/store';
import { onClip } from './keyframeCommands';
import NumberField from './NumberField';
import SpeedRamp from './SpeedRamp';
import { freezeFrameCmd, setDurationCmd, setPreservePitchCmd, setReverseCmd, setSpeedCmd } from './speedCommands';
import './speed.css';

/**
 * Speed (Plan 5D): constant speed in percent, the resulting Duration, Reverse, Preserve pitch, Freeze frame at the playhead and
 * the ramp presets. A change keeps the clip's start; "Push later clips" moves the rest of the track instead of refusing an overlap.
 */
export default function SpeedFields({ clip, media, disabled, title }: { clip: Clip; media: MediaRef | undefined; disabled: boolean; title?: string }) {
  const [ripple, setRipple] = useState(false);
  const onPlayhead = useEditor((s) => onClip(clip, s.playhead));
  const ramped = clip.speedKeys !== undefined && clip.speedKeys.length > 0;
  const audible = clip.kind === 'audio' || media?.hasAudio !== false;
  return (
    <div className="inspector-field" data-testid="speed-section">
      <div className="tf-grid" role="group" aria-label="Speed">
        <NumberField
          testId="speed-value"
          label="Speed"
          unit="%"
          ariaLabel="Speed in percent"
          value={ramped ? 100 : (clip.speed ?? 1) * 100}
          step={5}
          min={MIN_SPEED * 100}
          max={MAX_SPEED * 100}
          disabled={disabled}
          title={title ?? (ramped ? 'A speed ramp is set: typing a speed replaces it' : undefined)}
          onCommit={(v) => setSpeedCmd([clip.id], v / 100, ripple)}
        />
        <NumberField
          testId="speed-duration"
          label="Duration"
          unit="s"
          ariaLabel="Clip duration in seconds"
          value={clipDuration(clip)}
          step={0.1}
          min={0.05}
          max={100000}
          disabled={disabled}
          title={title}
          onCommit={(v) => setDurationCmd(clip.id, v, ripple)}
        />
      </div>
      <div className="crop-actions" role="group" aria-label="Speed options">
        <button type="button" className="tf-reset" data-testid="speed-reverse" aria-pressed={clip.reverse === true} disabled={disabled} title={title ?? 'Play the clip backwards'} onClick={() => setReverseCmd([clip.id], clip.reverse !== true)}>
          Reverse
        </button>
        {audible && (
          <label className="speed-check" title={title ?? 'Keep the pitch of the sound when the speed changes'}>
            <input type="checkbox" data-testid="speed-pitch" checked={clip.preservePitch !== false} disabled={disabled} onChange={(e) => setPreservePitchCmd([clip.id], e.target.checked)} />
            Preserve pitch
          </label>
        )}
        <label className="speed-check" title="When the clip gets longer, move the clips after it on this track instead of refusing">
          <input type="checkbox" data-testid="speed-ripple" checked={ripple} onChange={(e) => setRipple(e.target.checked)} />
          Push later clips
        </label>
        <button type="button" className="tf-reset" data-testid="speed-reset" disabled={disabled || (clip.speed === undefined && !ramped)} title={title ?? 'Back to normal speed'} onClick={() => setSpeedCmd([clip.id], 1, ripple)}>
          Reset speed
        </button>
        {clip.kind === 'video' && (
          <button type="button" className="tf-reset" data-testid="speed-freeze" disabled={disabled || !onPlayhead} title={title ?? (onPlayhead ? 'Hold the frame at the playhead for 2 seconds' : 'Move the playhead onto the clip')} onClick={() => freezeFrameCmd(clip.id)}>
            Freeze frame
          </button>
        )}
      </div>
      <SpeedRamp clip={clip} disabled={disabled} title={title} ripple={ripple} />
    </div>
  );
}
