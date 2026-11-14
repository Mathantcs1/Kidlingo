// "Save as preset" (Plan 5B D9, §7): names the selected clip's whole animation and files it in the personal library.
// Writes the library, not the project (no undo step). Empty or over-long names, a full library, an oversized animation
// and a read-only library are refused with a toast; the dialog then stays open (except where nothing can be saved).
import { useEffect, useRef, useState } from 'react';
import { copyAnimation } from '../core/animPayload';
import type { Id } from '../core/model';
import { CATEGORY_LABEL, MAX_PRESET_NAME, PRESET_CATEGORIES, presetFromAnimation } from '../core/userPresets';
import type { PresetCategory } from '../core/userPresets';
import { useEditor } from '../state/store';
import { saveUserPreset } from './presetLibraryStore';
import { guard } from './Toast';
import { focusAs, currentModality } from './inputModality';

interface Props {
  clipId: Id;
  onClose(): void;
}

export default function SavePresetDialog({ clipId, onClose }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PresetCategory>('custom');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [{ opener, modality }] = useState(() => ({ opener: document.activeElement, modality: currentModality() }));

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-testid="preset-save-name"]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) focusAs(opener, modality);
    };
  }, [onClose, opener, modality]);

  const save = (): void => {
    guard(() => {
      const preset = presetFromAnimation(copyAnimation(useEditor.getState().history.present, clipId), name, category);
      setBusy(true);
      void saveUserPreset(preset).then((ok) => {
        setBusy(false);
        if (ok) onClose();
      });
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="preset-save-title" data-testid="preset-save-dialog" ref={root}>
        <h2 id="preset-save-title">Save as preset</h2>
        <form
          className="modal-fields"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) save();
          }}
        >
          <label>
            Name
            <input data-testid="preset-save-name" value={name} maxLength={MAX_PRESET_NAME + 20} placeholder="My animation" onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Category
            <select data-testid="preset-save-category" value={category} onChange={(e) => setCategory(e.target.value as PresetCategory)}>
              {PRESET_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </label>
          <p className="modal-note">
            Saves this clip's keyframes and animation presets to your library (not to the project). Positions are saved relative to the first position keyframe.
          </p>
          <div className="modal-actions">
            <button type="button" data-testid="preset-save-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" data-testid="preset-save-confirm" disabled={busy}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
