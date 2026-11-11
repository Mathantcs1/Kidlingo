import type { Clip, MediaRef } from '../core/model';
import { clipDuration } from '../core/model';
import { findDetachedTwin, formatPan } from '../core/audioQueries';
import { useEditor } from '../state/store';
import './audio.css';
import { attachSelectedAudio, setSelectedClipAudio } from './audioCommands';
import EffectList from './EffectList';
import NumberField from './NumberField';

interface Props {
  clip: Clip;
  media: MediaRef | undefined;
  editable: boolean;
  locked: boolean;
}

/**
 * Fade in/out (seconds) and pan of the selected clip, plus "Attach back" for a video whose sound was detached.
 * Pan is shown as a signed percentage: −100 = full left, 0 = centre, +100 = full right. Each committed field is
 * one undo step (see NumberField). Disabled on a locked track.
 */
export default function AudioInspector({ clip, media, editable, locked }: Props) {
  const twin = useEditor((s) => (clip.kind === 'video' ? findDetachedTwin(s.history.present, clip.id) : null));
  const detached = clip.audio.silent;
  const disabled = !editable || locked || detached;
  const title = locked ? 'Track is locked' : detached ? 'Audio is detached from this clip' : undefined;
  const dur = clipDuration(clip);
  return (
    <div className="inspector-field audio-fields" data-testid="inspector-audio" tabIndex={-1}>
      <span className="inspector-label" id="inspector-audio-label">
        Fades and pan
      </span>
      <div className="tf-grid" role="group" aria-labelledby="inspector-audio-label">
        <NumberField
          testId="audio-fade-in"
          label="Fade in"
          unit="s"
          ariaLabel="Fade in, seconds"
          value={clip.audio.fadeIn}
          step={0.1}
          min={0}
          max={dur}
          disabled={disabled}
          title={title}
          onCommit={(v) => setSelectedClipAudio({ fadeIn: v })}
        />
        <NumberField
          testId="audio-fade-out"
          label="Fade out"
          unit="s"
          ariaLabel="Fade out, seconds"
          value={clip.audio.fadeOut}
          step={0.1}
          min={0}
          max={dur}
          disabled={disabled}
          title={title}
          onCommit={(v) => setSelectedClipAudio({ fadeOut: v })}
        />
        <NumberField
          testId="audio-pan"
          label="Pan"
          unit="%"
          ariaLabel="Pan in percent: -100 is full left, 0 is centre, 100 is full right"
          value={clip.audio.pan * 100}
          step={5}
          min={-100}
          max={100}
          disabled={disabled}
          title={title ?? 'Pan: −100 full left, 0 centre, +100 full right'}
          onCommit={(v) => setSelectedClipAudio({ pan: v / 100 })}
        />
      </div>
      <span className="audio-pan-label" data-testid="audio-pan-label">
        Pan {formatPan(clip.audio.pan)}
      </span>
      <EffectList clip={clip} disabled={disabled} title={title} />
      {detached && (
        <div className="audio-actions">
          <span>{media?.name ?? 'Clip'}: audio detached</span>
          {twin && (
            <button
              type="button"
              data-testid="audio-attach"
              disabled={!editable || locked}
              title={locked ? 'Track is locked' : 'Deletes the detached audio clip and makes this clip play its sound again'}
              onClick={attachSelectedAudio}
            >
              Attach back
            </button>
          )}
        </div>
      )}
    </div>
  );
}
