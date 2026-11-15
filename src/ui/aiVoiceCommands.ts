// AI voice: asks for consent once, synthesizes speech with ElevenLabs, imports the MP3 and places it in ONE undoable
// apply at the time the user pressed Generate. SECURITY: only ElevenLabsError messages (fixed strings) are ever shown;
// any other error becomes a generic message and is never logged with its text, so a key can never reach a toast or log.
import { createElevenLabs, ElevenLabsError } from '../ai/elevenlabs';
import type { TtsModel } from '../ai/elevenlabs';
import { keyStore } from '../ai/keyStore';
import type { MediaRef } from '../core/model';
import { loadChunk } from '../loadChunk';
import { removeMedia } from '../media/storage';
import { useEditor } from '../state/store';
import { askConfirm } from './Confirm';
import type { ConfirmRequest } from './Confirm';
import { aiVoiceName, placeAudioMedia } from './recordEdits';
import { showError } from './Toast';

export interface VoiceRequest {
  text: string;
  voiceId: string;
  model: TtsModel;
}

export interface VoiceDeps {
  synthesize(req: VoiceRequest, signal: AbortSignal): Promise<Blob>;
  importFile(file: File): Promise<MediaRef>;
  removeMedia(id: string): Promise<void>;
  askConfirm(req: ConfirmRequest): Promise<boolean>;
  getConsent(): Promise<boolean>;
  setConsent(v: boolean): Promise<void>;
}

const CONSENT: ConfirmRequest = {
  title: 'Send your script to ElevenLabs?',
  message:
    'The text you typed is sent to ElevenLabs to create the voice, together with your API key. ElevenLabs has its own ' +
    'terms and privacy policy. Your video and audio files are never sent. You are asked only once.',
  confirmLabel: 'Send and generate',
};

function defaultDeps(): VoiceDeps {
  const api = createElevenLabs({ getKey: keyStore.getKey });
  return {
    synthesize: (req, signal) => api.synthesize(req, signal),
    importFile: async (f) => (await loadChunk(() => import('../media/import'))).importFile(f),
    removeMedia,
    askConfirm,
    getConsent: keyStore.getConsent,
    setConsent: keyStore.setConsent,
  };
}

/** The signal of the call in flight; a second call while it is live is ignored (double click). */
let current: AbortSignal | null = null;

const editor = () => useEditor.getState();

/**
 * Generates speech for `req` and places it as audio at the playhead position captured NOW (not where the playhead is
 * when the audio arrives), on the active audio track when it has room, else the first audio track with room, else a
 * new one. Resolves true when a clip was added; false when cancelled, refused or failed (a plain toast says why,
 * except for a cancel). Failures remove any imported media and leave the project untouched.
 */
export async function generateVoiceOver(req: VoiceRequest, signal: AbortSignal, deps: VoiceDeps = defaultDeps()): Promise<boolean> {
  if (current && !current.aborted) return false;
  current = signal;
  const startAt = editor().playhead;
  let mediaId: string | null = null;
  try {
    if (!(await deps.getConsent())) {
      if (!(await deps.askConfirm(CONSENT))) return false;
      await deps.setConsent(true);
    }
    if (signal.aborted) return false;
    const blob = await deps.synthesize(req, signal);
    if (signal.aborted) return false;
    const name = aiVoiceName(editor().history.present);
    const m = await deps.importFile(new File([blob], `${name}.mp3`, { type: 'audio/mpeg' }));
    mediaId = m.id;
    if (signal.aborted) throw new ElevenLabsError('aborted');
    const before = editor().history.present;
    const track = editor().activeTrackId;
    editor().apply((p) => placeAudioMedia(p, { ...m, name: aiVoiceName(p) }, startAt, track));
    // apply() keeps a TimelineError in lastError (shown as a toast) instead of throwing.
    if (editor().history.present === before) throw new RefusedPlacement();
    mediaId = null;
    void navigator.storage?.persist?.().catch(() => false);
    return true;
  } catch (e) {
    if (mediaId) await deps.removeMedia(mediaId).catch(() => undefined);
    if (e instanceof RefusedPlacement) return false; // the store already toasted the refusal
    if (e instanceof ElevenLabsError) {
      if (e.reason !== 'aborted') showError(e.message);
    } else {
      console.error('clipforge: AI voice failed', e instanceof Error ? e.name : 'error');
      showError('Could not add the generated voice to the project.');
    }
    return false;
  } finally {
    if (current === signal) current = null;
  }
}

class RefusedPlacement extends Error {}
