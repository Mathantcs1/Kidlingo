import { useEffect } from 'react';
import { useExportUi } from './exportJobState';
import { cancelRecording, recordVoiceOver, setPlayAlong, useRecording } from './recordCommands';
import './audio.css';

const PLAY_ALONG_TIP = 'Play the timeline while recording. Use headphones, or the microphone will pick up the playback.';

/** mm:ss (minutes keep growing past 59). */
export function formatRecordTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Record voice-over toggle with its timer, Cancel and the "Play along" option. */
export default function RecordButton({ editable }: { editable: boolean }) {
  const status = useRecording((s) => s.status);
  const elapsed = useRecording((s) => s.elapsed);
  const playAlong = useRecording((s) => s.playAlong);
  const jobOpen = useExportUi((s) => s.open !== null);
  const active = status === 'starting' || status === 'recording';

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || useExportUi.getState().open !== null) return;
      e.preventDefault();
      e.stopPropagation();
      cancelRecording();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  const label = active ? 'Stop recording' : status === 'saving' ? 'Saving recording…' : 'Record voice-over';
  return (
    <div className="record-group" role="group" aria-label="Voice-over">
      <button
        type="button"
        data-testid="record-button"
        className={`btn-record${active ? ' is-recording' : ''}`}
        onClick={recordVoiceOver}
        disabled={(!editable || jobOpen || status === 'saving') && !active}
        aria-pressed={active}
        aria-label={label}
        title={active ? 'Stop recording and add the voice-over at the start position' : 'Record a voice-over from the microphone, starting at the playhead'}
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
            onClick={cancelRecording}
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
