import { useState } from 'react';
import type { Clip, FxType } from '../core/model';
import { FX_SCHEMAS } from '../fx/params';
import type { FxGroup } from '../fx/types';
import { useEditor } from '../state/store';
import './audio.css';
import './fx.css';
import FxRow from './FxRow';
import LookGallery from './LookGallery';
import { addClipFx, copyClipFx, pasteClipFx, toggleFxBypass } from './fxCommands';

const GROUPS: FxGroup[] = ['Colour', 'Looks', 'Blur & sharpen', 'Stylise', 'Key'];
const TYPES = Object.keys(FX_SCHEMAS) as FxType[];

interface Props {
  clip: Clip;
  editable: boolean;
  locked: boolean;
}

/**
 * The selected picture clip's effect stack (applied bottom to top in list order): add an effect, one-click looks,
 * Copy/Paste the whole stack, and the preview-only "Effects off" compare toggle. Every action is one undo step.
 */
export default function FxInspector({ clip, editable, locked }: Props) {
  const bypass = useEditor((s) => s.fxBypass);
  const disabled = !editable || locked;
  // A native <select> fires `change` on every arrow key on some platforms, so choosing a type only stages it.
  const [chosen, setChosen] = useState<FxType | ''>('');
  return (
    <div className="inspector-field effect-list fx-inspector" data-testid="fx-inspector" title={locked ? 'Track is locked' : undefined}>
      <div className="fx-head">
        <span className="inspector-label" id="fx-label">
          Effects
        </span>
        <button type="button" className="effect-btn fx-bypass" data-testid="fx-bypass" aria-pressed={bypass} title="Show the preview without effects (key: \)" onClick={toggleFxBypass}>
          Effects off
        </button>
      </div>
      <div className="effect-tools" role="group" aria-labelledby="fx-label">
        <select data-testid="fx-add" aria-label="Effect to add" value={chosen} disabled={disabled} onChange={(e) => setChosen(e.target.value as FxType | '')}>
          <option value="">Effect…</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {TYPES.filter((t) => FX_SCHEMAS[t].group === g).map((t) => (
                <option key={t} value={t} data-testid={`fx-add-${t}`}>
                  {FX_SCHEMAS[t].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          data-testid="fx-add-button"
          disabled={disabled || !chosen}
          onClick={() => {
            if (!chosen) return;
            addClipFx(clip.id, chosen);
            setChosen('');
          }}
        >
          Add
        </button>
        <button type="button" data-testid="fx-copy" disabled={clip.fx.length === 0} title="Copy this clip's effects" onClick={() => copyClipFx(clip.id)}>
          Copy
        </button>
        <button type="button" data-testid="fx-paste" disabled={disabled} title="Paste the copied effects (replaces this clip's effects)" onClick={() => pasteClipFx(clip.id)}>
          Paste
        </button>
      </div>
      <LookGallery clip={clip} disabled={disabled} />
      {clip.fx.length > 0 && (
        <ol className="effect-rows">
          {clip.fx.map((e, i) => (
            <FxRow key={e.id} clipId={clip.id} fx={e} index={i} count={clip.fx.length} disabled={disabled} />
          ))}
        </ol>
      )}
    </div>
  );
}
