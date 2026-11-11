// Voice-over recording: one toggle starts capturing at the playhead (optionally playing the timeline along) and
// stopping imports the WAV and places it in ONE undoable apply. Cancel/Escape discards the take entirely.
import { create } from 'zustand';
import { unlockAudio } from '../audio/context';
import { MIN_CLIP } from '../core/timeline';
import { loadChunk } from '../loadChunk';
import { createRecorder } from '../media/recorder';
import type { Recorder } from '../media/recorder';
import { removeMedia } from '../media/storage';
import { describeStorageError } from '../media/storageErrors';
import { useEditor } from '../state/store';
import { useExportUi } from './exportJobState';
import { placeRecording, voiceOverName } from './recordEdits';
import { showError, showInfo } from './Toast';

export type RecordStatus = 'idle' | 'starting' | 'recording' | 'saving';

interface RecordUi {
  status: RecordStatus;
  /** Seconds recorded so far (updated a few times a second while recording). */
  elapsed: number;
  /** Play the timeline while recording, so the voice can follow the picture. */
  playAlong: boolean;
}

export const useRecording = create<RecordUi>()(() => ({ status: 'idle', elapsed: 0, playAlong: true }));

const ui = () => useRecording.getState();
const set = (s: Partial<RecordUi>): void => useRecording.setState(s);
const editor = () => useEditor.getState();

let rec: Recorder | null = null;
let startAt = 0;
let ticker: ReturnType<typeof setInterval> | undefined;
let playedAlong = false;

export function setPlayAlong(on: boolean): void {
  set({ playAlong: on });
}

function stopSideEffects(): void {
  if (ticker !== undefined) clearInterval(ticker);
  ticker = undefined;
  if (playedAlong) editor().setPlaying(false);
  playedAlong = false;
}

/** Starts recording, or stops it and places the take. Call from the user gesture (audio must start there). */
export function recordVoiceOver(): void {
  const { status } = ui();
  if (status === 'idle') void begin();
  else if (status === 'recording') void finish();
}

/** Discards the take in progress (nothing is imported, no undo step). */
export function cancelRecording(): void {
  const { status } = ui();
  if (status !== 'starting' && status !== 'recording') return;
  rec?.cancel();
  rec = null;
  stopSideEffects();
  set({ status: 'idle', elapsed: 0 });
}

async function begin(): Promise<void> {
  if (useExportUi.getState().open !== null) return;
  const { playAlong } = ui();
  // Inside the gesture: the playback context must be unlocked here, not after the permission prompt.
  if (playAlong) unlockAudio();
  editor().setPlaying(false);
  const r = createRecorder();
  rec = r;
  r.onLimit = () => {
    showInfo('Recording stopped at the 30-minute limit. The take was kept.');
    void finish();
  };
  r.onEnded = () => {
    showError('The microphone was disconnected. What was recorded so far was kept.');
    void finish();
  };
  set({ status: 'starting', elapsed: 0 });
  try {
    await r.start();
  } catch (e) {
    if (rec !== r) return; // cancelled while asking
    rec = null;
    set({ status: 'idle' });
    if (e instanceof DOMException && e.name === 'AbortError') return;
    if (!(e instanceof Error && e.name === 'RecorderError')) console.error('clipforge: recording failed', e);
    showError(e instanceof Error && e.name === 'RecorderError' ? e.message : `Could not start recording: ${describeStorageError(e)}`);
    return;
  }
  if (rec !== r) return;
  startAt = editor().playhead;
  set({ status: 'recording' });
  ticker = setInterval(() => set({ elapsed: r.elapsed() }), 200);
  if (playAlong) {
    playedAlong = true;
    editor().setPlaying(true);
  }
}

async function finish(): Promise<void> {
  const r = rec;
  if (!r || ui().status !== 'recording') return;
  set({ status: 'saving' });
  stopSideEffects();
  let mediaId: string | null = null;
  try {
    const { blob, seconds } = await r.stop();
    if (seconds < MIN_CLIP) {
      showInfo('Nothing was recorded.');
      return;
    }
    const { importFile } = await loadChunk(() => import('../media/import'));
    const name = voiceOverName(editor().history.present);
    const m = await importFile(new File([blob], `${name}.wav`, { type: 'audio/wav' }));
    mediaId = m.id;
    const before = editor().history.present;
    const track = editor().activeTrackId;
    editor().apply((p) => placeRecording(p, { ...m, name: voiceOverName(p) }, startAt, track));
    // apply() keeps a TimelineError in lastError (shown as a toast) instead of throwing.
    if (editor().history.present === before) await removeMedia(m.id).catch(() => undefined);
    void navigator.storage?.persist?.().catch(() => false);
  } catch (e) {
    console.error('clipforge: saving the recording failed', e);
    showError(`Could not save the recording: ${describeStorageError(e)}`);
    if (mediaId) await removeMedia(mediaId).catch(() => undefined);
  } finally {
    rec = null;
    set({ status: 'idle', elapsed: 0 });
  }
}
