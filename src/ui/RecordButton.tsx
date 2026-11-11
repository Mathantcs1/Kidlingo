import { useEffect, useRef } from 'react';
import { useConfirm } from './Confirm';
import { useExportUi } from './exportJobState';
import { currentModality, focusAs } from './inputModality';
import { isTextEntry } from './keys';
import { cancelRecording, confirmDiscard, recordVoiceOver, setPlayAlong, useRecording } from './recordCommands';
import { TRANSFORMING_CLASS } from './useTransformDrag';
import './audio.css';

const PLAY_ALONG_TIP =
  'Play the timeline while recording. Use headphones, or the microphone will pick up the playback. The voice can land ' +
  'slightly early against the picture (no latency compensation).';

/** mm:ss (minutes keep growing past 59). */
export function formatRecordTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Escape discards the take only when nothing else used it: checked after the whole dispatch (so handlers that run
 * later still get to call preventDefault), never while typing in a field, in a dialog, or during a drag.
 */
function escapeIsOurs(e: KeyboardEvent): boolean {
  const t = e.target;
  if (e.defaultPrevented || useConfirm.getState().request !== null || useExportUi.getState().open !== null) return false;
  if (t instanceof HTMLElement && isTextEntry(t as HTMLElement & { type?: string })) return false;
  return !document.documentElement.classList.contains(TRANSFORMING_CLASS);
}

/** Record voice-over toggle with its timer, Cancel and the "Play along" option. */
export default function RecordButton({ editable }: { editable: boolean }) {
  const status = useRecording((s) => s.status);
  const elapsed = useRecording((s) => s.elapsed);
  const playAlong = useRecording((s) => s.playAlong);
  const jobOpen = useExportUi((s) => s.open !== null);
  const active = status === 'starting' || status === 'recording';
  const groupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Whether focus was last inside this group (so it can come back when Cancel/Stop removes the focused control). */
  const owned = useRef(false);

  /** Discards (asking first for long takes); focus returns to Record if it was in this group before. */
  const discard = async (fromGroup: boolean): Promise<void> => {
    if (!(await confirmDiscard())) return;
    owned.current = fromGroup;
    cancelRecording();
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.repeat) return;
      setTimeout(() => {
        if (escapeIsOurs(e)) void discard(owned.current);
      }, 0);
    };
    // `discard` only touches refs and module commands, so the listener need not be re-registered when it changes.
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  useEffect(() => {
    const focused = document.activeElement;
    if (owned.current && (focused === null || focused === document.body) && buttonRef.current && !buttonRef.current.disabled) {
      focusAs(buttonRef.current, currentModality());
    }
  }, [status]);

  const title =
    status === 'starting'
      ? 'Waiting for the microphone (click to cancel)'
      : active
        ? 'Stop recording and add the voice-over at the start position'
        : 'Record a voice-over from the microphone, starting at the playhead';
  return (
    <div
      ref={groupRef}
      className="record-group"
      role="group"
      aria-label="Voice-over"
      onFocus={() => (owned.current = true)}
      onBlur={(e) => (owned.current = e.relatedTarget === null || groupRef.current?.contains(e.relatedTarget) === true)}
    >
      <button
        ref={buttonRef}
        type="button"
        data-testid="record-button"
        className={`btn-record${active ? ' is-recording' : ''}`}
        onClick={status === 'starting' ? cancelRecording : recordVoiceOver}
        disabled={(!editable || jobOpen || status === 'saving') && !active}
        aria-pressed={status === 'recording'}
        aria-label="Record voice-over"
        title={title}
      >
        <span className="record-dot" aria-hidden="true" />
        {active ? 'Stop' : status === 'saving' ? 'Saving…' : 'Record'}
      </button>
      {active && (
        <>
          <span className="record-timer" data-testid="record-timer" role="timer" aria-label="Recording time">
            {status === 'starting' ? 'Starting…' : formatRecordTime(elapsed)}
          </span>
          <button
            type="button"
            data-testid="record-cancel"
            onClick={() => void discard(true)}
            title="Discard this recording (Esc)"
          >
            Cancel
          </button>
        </>
      )}
      <label className="record-playalong" title={PLAY_ALONG_TIP}>
        <input
          type="checkbox"
          data-testid="record-playalong"
          checked={playAlong}
          disabled={active}
          onChange={(e) => setPlayAlong(e.target.checked)}
        />
        Play along
      </label>
    </div>
  );
}
