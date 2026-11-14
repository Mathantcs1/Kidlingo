// One "My presets" tile of the preset browser (Plan 5B D9/D10): the saved name and category, a favourite star, and
// rename / delete (mouse buttons; F2 and Delete on the focused tile are the keyboard way, so the buttons stay out of the
// tab order like the star). Static: a saved animation has no single preview frame.
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CATEGORY_LABEL } from '../core/userPresets';
import type { UserPreset } from '../core/userPresets';

interface Props {
  preset: UserPreset;
  tabbable: boolean;
  favourite: boolean;
  /** False while the library is read-only: rename and delete are hidden. */
  writable: boolean;
  setRef(el: HTMLDivElement | null): void;
  onApply(): void;
  onToggleFavourite(): void;
  onRename(name: string): void;
  onDelete(): void;
  onFocus(): void;
  onKeyDown(e: KeyboardEvent<HTMLDivElement>): void;
  /** Set by the browser when F2 is pressed on this tile. */
  renaming: boolean;
  onRenaming(on: boolean): void;
}

export default function UserPresetTile(p: Props) {
  const { preset } = p;
  const [draft, setDraft] = useState(preset.name);
  const finish = (commit: boolean): void => {
    p.onRenaming(false);
    if (commit && draft.trim() !== preset.name) p.onRename(draft);
  };
  return (
    <div className="preset-tile-wrap" role="presentation">
      <div
        ref={p.setRef}
        role="option"
        className="preset-tile preset-tile-user"
        data-testid={`preset-tile-user-${preset.id}`}
        tabIndex={p.tabbable ? 0 : -1}
        aria-selected={false}
        aria-label={`${preset.name}, ${CATEGORY_LABEL[preset.category]}${p.favourite ? ', favourite' : ''}`}
        aria-keyshortcuts="F F2 Delete"
        title={`${preset.name} (${CATEGORY_LABEL[preset.category]})`}
        onClick={() => !p.renaming && p.onApply()}
        onFocus={p.onFocus}
        onKeyDown={(e) => {
          if (p.renaming) return;
          if (e.key === 'F2' && p.writable) {
            e.preventDefault();
            setDraft(preset.name);
            p.onRenaming(true);
          } else if ((e.key === 'Delete' || e.key === 'Backspace') && p.writable) {
            e.preventDefault();
            p.onDelete();
          } else p.onKeyDown(e);
        }}
      >
        <span className="preset-user-body">
          {p.renaming ? (
            <input
              className="preset-user-input"
              data-testid={`preset-user-rename-input-${preset.id}`}
              aria-label="Preset name"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => finish(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); finish(true); }
                else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
              }}
            />
          ) : (
            <span className="preset-name" data-testid={`preset-user-name-${preset.id}`}>{preset.name}</span>
          )}
          <span className="preset-user-cat">{CATEGORY_LABEL[preset.category]}</span>
        </span>
      </div>
      <button
        type="button"
        className="preset-fav"
        data-testid={`preset-fav-user-${preset.id}`}
        tabIndex={-1}
        aria-hidden="true"
        aria-pressed={p.favourite}
        title={p.favourite ? 'Remove from favourites (F)' : 'Add to favourites (F)'}
        onClick={p.onToggleFavourite}
      >
        {p.favourite ? '★' : '☆'}
      </button>
      {p.writable && (
        <span className="preset-user-actions">
          <button type="button" tabIndex={-1} aria-hidden="true" data-testid={`preset-user-rename-${preset.id}`} title="Rename (F2)" onClick={() => { setDraft(preset.name); p.onRenaming(true); }}>
            ✎
          </button>
          <button type="button" tabIndex={-1} aria-hidden="true" data-testid={`preset-user-delete-${preset.id}`} title="Delete from your library (Delete)" onClick={p.onDelete}>
            🗑
          </button>
        </span>
      )}
    </div>
  );
}
