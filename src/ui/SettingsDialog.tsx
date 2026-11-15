import { useEffect, useRef, useState } from 'react';
import { createElevenLabs, ElevenLabsError } from '../ai/elevenlabs';
import { keyStore } from '../ai/keyStore';
import { currentModality, focusAs } from './inputModality';
import { useSettings } from './settingsState';
import './settings.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

interface Notice {
  kind: 'ok' | 'error' | 'info';
  text: string;
}

function errorText(e: unknown): string {
  // ElevenLabsError and setKey errors carry fixed messages that never contain the key.
  if (e instanceof ElevenLabsError) return e.message;
  if (e instanceof Error && e.message.length < 120) return e.message;
  return 'Something went wrong. Try again.';
}

/** Esc closes, Tab stays inside, focus returns to the opener (as the export and confirm dialogs do). */
function useDialogKeys(rootRef: React.RefObject<HTMLDivElement | null>): void {
  const [{ opener, modality }] = useState(() => ({ opener: document.activeElement, modality: currentModality() }));
  useEffect(() => {
    const root = rootRef.current;
    root?.querySelector<HTMLElement>('[data-testid="eleven-key-input"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (!root) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        useSettings.getState().closeSettings();
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
      const btn = document.querySelector<HTMLElement>('[data-testid="btn-settings"]');
      const target = opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled') ? opener : btn;
      if (target) focusAs(target, modality);
    };
  }, [rootRef, opener, modality]);
}

/** Add, test and remove the ElevenLabs API key. The key is only ever shown masked and never leaves this browser except to ElevenLabs. */
export default function SettingsDialog() {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeSettings = useSettings((s) => s.closeSettings);
  const [masked, setMasked] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useDialogKeys(rootRef);

  async function load(): Promise<void> {
    const k = await keyStore.getKey();
    setMasked(k ? keyStore.maskKey(k) : null);
    await useSettings.getState().refreshHasKey();
  }
  useEffect(() => {
    void load();
  }, []);

  async function save(): Promise<void> {
    const raw = inputRef.current?.value ?? '';
    try {
      await keyStore.setKey(raw);
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
      return;
    }
    if (inputRef.current) inputRef.current.value = '';
    setNotice({ kind: 'ok', text: 'Key saved in this browser.' });
    await load();
  }

  async function test(): Promise<void> {
    setBusy(true);
    setNotice({ kind: 'info', text: 'Testing…' });
    try {
      const api = createElevenLabs({ getKey: keyStore.getKey });
      await api.listVoices();
      const sub = await api.subscription();
      const left = sub ? ` ${Math.max(0, sub.limit - sub.used).toLocaleString('en-US')} characters left this period.` : '';
      setNotice({ kind: 'ok', text: `Key works.${left}` });
    } catch (e) {
      setNotice({ kind: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    await keyStore.clearKey();
    await keyStore.setConsent(false);
    setNotice({ kind: 'info', text: 'Key removed from this browser.' });
    await load();
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-dialog"
        ref={rootRef}
      >
        <h2 id="settings-title">Settings</h2>
        <div className="settings-status-box" data-testid="eleven-key-status" aria-live="polite">
          <p className="settings-status">{masked ? `ElevenLabs key saved: ${masked}` : 'No key saved'}</p>
          {notice && <p className={`settings-status is-${notice.kind}`}>{notice.text}</p>}
        </div>
        <div className="modal-fields">
          <label>
            ElevenLabs API key
            <span className="settings-key-row">
              <input
                ref={inputRef}
                type="password"
                autoComplete="off"
                spellCheck={false}
                data-testid="eleven-key-input"
                placeholder={masked ? 'Paste a new key to replace it' : 'Paste your API key'}
              />
            </span>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" data-testid="eleven-key-save" onClick={() => void save()}>
            Save
          </button>
          <button type="button" data-testid="eleven-key-test" disabled={busy} onClick={() => void test()}>
            Test key
          </button>
          <button type="button" className="btn-danger" data-testid="eleven-key-remove" disabled={!masked} onClick={() => void remove()}>
            Remove
          </button>
          <button type="button" data-testid="settings-done" onClick={closeSettings}>
            Done
          </button>
        </div>
        <p className="settings-privacy" data-testid="eleven-privacy-note">
          Your key is kept only in this browser and is never uploaded by ClipForge, which has no server. When you
          generate a voice, the text you type is sent to ElevenLabs, which has its own terms and privacy policy. Your
          video and audio files are never sent.
        </p>
      </div>
    </div>
  );
}
