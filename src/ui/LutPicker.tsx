import type { Id } from '../core/model';
import { useEditor } from '../state/store';
import { importLutFiles } from './lutCommands';
import { removeMediaItem } from './projectCommands';
import { addVideoEffectCmd } from './videoEffectCommands';

interface Props {
  clipId: Id;
  /** The clip's effects cannot change (locked track, project not ready). */
  disabled: boolean;
  /** The project can change (import / remove a LUT file). */
  editable: boolean;
}

/**
 * The project's .cube LUTs: import one, add it to the clip as an effect, or remove an unused one (a LUT a clip still
 * uses is refused with the usual in-use message). Each shows its name and, in small print, its file name.
 */
export default function LutPicker({ clipId, disabled, editable }: Props) {
  const media = useEditor((s) => s.history.present.media);
  const luts = Object.values(media).filter((m) => m.kind === 'lut');
  return (
    <div className="inspector-field lut-picker" data-testid="fx-luts">
      <span className="inspector-label">LUTs</span>
      {luts.length === 0 && <p className="effect-hint">Import a .cube file to colour-grade with a LUT.</p>}
      <ul className="lut-list">
        {luts.map((m) => (
          <li key={m.id} className="lut-item" data-testid={`fx-lut-${m.id}`}>
            <span className="lut-names" title={m.fileName ?? m.name}>
              <span className="lut-name">{m.name}</span>
              {m.fileName && m.fileName !== m.name && <span className="lut-file">{m.fileName}</span>}
              {m.missing && <span className="badge badge-warn">Missing</span>}
            </span>
            <button type="button" data-testid={`fx-lut-select-${m.id}`} disabled={disabled || m.missing} title="Add this LUT to the clip" onClick={() => addVideoEffectCmd(clipId, 'lut', m.id)}>
              Use
            </button>
            <button
              type="button"
              className="effect-btn"
              data-testid={`fx-lut-remove-${m.id}`}
              disabled={!editable}
              aria-label={`Remove LUT ${m.name} from the project`}
              title="Remove this LUT from the project (refused while a clip uses it)"
              onClick={() => void removeMediaItem(m.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <label className={`btn${editable ? '' : ' is-disabled'}`}>
        Import LUT…
        <input
          className="visually-hidden"
          type="file"
          accept=".cube"
          multiple
          disabled={!editable}
          data-testid="fx-lut-import"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length > 0) void importLutFiles(files);
          }}
        />
      </label>
    </div>
  );
}
