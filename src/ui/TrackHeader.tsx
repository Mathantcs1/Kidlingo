import type { MouseEvent, ReactNode } from 'react';
import type { Track } from '../core/model';
import { useEditor } from '../state/store';
import { ArrowIcon, CloseIcon, EyeIcon, LockIcon } from './TrackIcons';
import TrackName from './TrackName';
import { moveLayer, removeLayer, toggleTrackFlag } from './trackCommands';
import type { TrackFlag } from './trackCommands';
import { trackHeight } from './trackLayout';

interface TrackHeaderProps {
  track: Track;
  label: string;
  active: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
}

interface BtnProps {
  id: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick(): void;
  children: ReactNode;
}

function Btn({ id, label, pressed, disabled, className, onClick, children }: BtnProps) {
  return (
    <button
      type="button"
      className={`track-btn${className ? ` ${className}` : ''}`}
      data-testid={`track-btn-${id}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** The left-hand header of one track row: name, flags (mute/solo/lock/hide), layer order and remove. */
export default function TrackHeader({ track, label, active, canMoveUp, canMoveDown, canRemove }: TrackHeaderProps) {
  const id = track.id;
  const flag = (f: TrackFlag) => () => toggleTrackFlag(id, f);
  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    useEditor.getState().setActiveTrack(id);
  };
  const classes = ['track-header', `track-header-${track.kind}`];
  if (active) classes.push('is-active');
  if (track.locked) classes.push('is-locked');
  if (track.hidden) classes.push('is-hidden');
  if (track.muted) classes.push('is-muted');

  return (
    <div
      className={classes.join(' ')}
      style={{ height: trackHeight(track.kind) }}
      data-testid="track-header"
      data-track-id={id}
      data-track-kind={track.kind}
      data-active={String(active)}
      role="group"
      aria-label={`${label}${active ? ' (active)' : ''}`}
      onClick={onClick}
    >
      <div className="track-header-main">
        <TrackName trackId={id} label={label} name={track.name} />
        <div className="track-btns track-btns-order">
          <Btn id="up" label={`Move ${label} up`} disabled={!canMoveUp} onClick={() => moveLayer(id, 'up')}>
            <ArrowIcon dir="up" />
          </Btn>
          <Btn id="down" label={`Move ${label} down`} disabled={!canMoveDown} onClick={() => moveLayer(id, 'down')}>
            <ArrowIcon dir="down" />
          </Btn>
          <Btn id="remove" label={`Remove ${label}`} disabled={!canRemove} onClick={() => void removeLayer(id)}>
            <CloseIcon />
          </Btn>
        </div>
      </div>
      <div className="track-btns track-btns-flags">
        <Btn id="mute" label={`Mute ${label}`} pressed={track.muted} className="is-mute" onClick={flag('muted')}>
          M
        </Btn>
        <Btn id="solo" label={`Solo ${label}`} pressed={track.solo} className="is-solo" onClick={flag('solo')}>
          S
        </Btn>
        <Btn id="lock" label={`Lock ${label}`} pressed={track.locked} className="is-lock" onClick={flag('locked')}>
          <LockIcon locked={track.locked} />
        </Btn>
        {track.kind === 'video' && (
          <Btn id="hide" label={`Hide ${label}`} pressed={track.hidden} className="is-hide" onClick={flag('hidden')}>
            <EyeIcon hidden={track.hidden} />
          </Btn>
        )}
      </div>
    </div>
  );
}
