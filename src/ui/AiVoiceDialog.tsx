import { useEffect, useRef, useState } from 'react';
import { createElevenLabs, ElevenLabsError, MAX_TEXT_CODE_POINTS } from '../ai/elevenlabs';
import type { TtsModel, Voice } from '../ai/elevenlabs';
import { keyStore } from '../ai/keyStore';
import { generateVoiceOver } from './aiVoiceCommands';
import { useAiVoice } from './aiVoiceState';
import { useConfirm } from './Confirm';
import { currentModality, focusAs } from './inputModality';
import './aiVoice.css';

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), textarea:not([disabled])';
const VOICE_KEY = 'clipforge-ai-voice';

const MODELS: { id: TtsModel; label: string }[] = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (best quality)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (fastest, cheaper)' },
];

function rememberedVoice(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(VOICE_KEY, id); // only the voice id, never text or key
  } catch {
    /* storage unavailable: the choice is simply not remembered */
  }
}

/** Esc cancels (aborting any request), Tab stays inside, focus returns to the opener. Ignored while the consent question is open. */
function useDialogKeys(rootRef: React.RefObject<HTMLDivElement | null>, onCancel: () => void): void {
  const [{ opener, modality }] = useState(() => ({ opener: document.activeElement, modality: currentModality() }));
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const root = rootRef.current;
    root?.querySelector<HTMLElement>('[data-testid="ai-voice-text"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (!root || useConfirm.getState().request !== null) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!root.contains(document.activeElement) || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const btn = document.querySelector<HTMLElement>('[data-testid="btn-ai-voice"]');
      const target = opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled') ? opener : btn;
      if (target) focusAs(target, modality);
    };
  }, [rootRef, opener, modality]);
}

/** Type a script, pick a voice and model, and place the generated speech at the playhead. */
export default function AiVoiceDialog() {
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useAiVoice((s) => s.closeDialog);
  const ctl = useRef<AbortController>(new AbortController());
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voiceId, setVoiceId] = useState('');
  const [model, setModel] = useState<TtsModel>('eleven_multilingual_v2');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const cancel = (): void => {
    ctl.current.abort();
    close();
  };
  useDialogKeys(rootRef, cancel);
  useEffect(() => {
    // A fresh controller per mount (StrictMode mounts twice); closing or unmounting aborts voices and generation.
    const c = new AbortController();
    ctl.current = c;
    createElevenLabs({ getKey: keyStore.getKey })
      .listVoices(c.signal)
      .then((list) => {
        if (c.signal.aborted) return;
        const saved = rememberedVoice();
        setVoices(list);
        setVoiceId(list.find((v) => v.id === saved)?.id ?? list[0]?.id ?? '');
        if (list.length === 0) setLoadError('Your ElevenLabs account has no voices to choose from.');
      })
      .catch((e: unknown) => {
        if (c.signal.aborted) return;
        setLoadError(e instanceof ElevenLabsError ? e.message : 'Could not load voices. Try again.');
      });
    return () => c.abort();
  }, []);

  const count = [...text].length;
  const over = count > MAX_TEXT_CODE_POINTS;
  const canGenerate = !busy && voiceId !== '' && text.trim().length > 0 && !over;
  const status = busy ? 'Generating…' : over ? 'The script is over the 5,000 character limit.' : loadError ?? (voices === null ? 'Loading voices…' : '');

  async function generate(): Promise<void> {
    if (!canGenerate || running.current) return;
    running.current = true; // only the call that set busy may clear it
    setBusy(true);
    const c = ctl.current;
    const ok = await generateVoiceOver({ text, voiceId, model }, c.signal);
    running.current = false;
    if (c.signal.aborted) return;
    if (ok) {
      remember(voiceId);
      close();
    } else setBusy(false);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-voice-title" data-testid="ai-voice-dialog" ref={rootRef}>
        <h2 id="ai-voice-title">AI voice</h2>
        <div className="modal-fields">
          <label>
            Script
            <textarea
              className="ai-voice-text"
              data-testid="ai-voice-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              placeholder="Type what the voice should say"
              aria-invalid={over}
              aria-describedby="ai-voice-count"
            />
          </label>
          <span className={`ai-voice-count${over ? ' is-error' : ''}`} id="ai-voice-count" data-testid="ai-voice-count">
            {count.toLocaleString('en-US')} / {MAX_TEXT_CODE_POINTS.toLocaleString('en-US')}
          </span>
          <label>
            Voice
            <select data-testid="ai-voice-voice" value={voiceId} disabled={busy || !voices?.length} onChange={(e) => setVoiceId(e.target.value)}>
              {!voices?.length && <option value="">{loadError ? 'No voices' : 'Loading…'}</option>}
              {voices?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Model
            <select data-testid="ai-voice-model" value={model} disabled={busy} onChange={(e) => setModel(e.target.value as TtsModel)}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={`ai-voice-status${(loadError || over) && !busy ? ' is-error' : ''}`} data-testid="ai-voice-status" aria-live="polite">
          {status}
        </p>
        <div className="modal-actions">
          <button type="button" data-testid="ai-voice-cancel" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" data-testid="ai-voice-generate" disabled={!canGenerate} onClick={() => void generate()}>
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
