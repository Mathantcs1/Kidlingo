// The preset browser (Plan 5B D10, §7): a popover beside the inspector with category tabs, a search field and a grid
// of animated preview tiles (built-in presets) or saved user presets (My presets, Favourites). Click or Enter applies a
// tile in ONE step and closes only when it went through, returning focus to the opener; Escape closes without change.
// The grid is ONE tab stop (roving tabindex; arrows, Home/End move; F stars the focused tile; ArrowUp from the first row
// returns to the search). Keys pressed inside never reach the global shortcuts.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Clip } from '../core/model';
import type { MotionSlot } from '../core/motionTypes';
import type { UserPreset } from '../core/userPresets';
import { askConfirm } from './Confirm';
import { setPresetCmd, slotUse } from './presetCommands';
import { CAT_LABEL, EMPTY, reasonFor } from './presetCategories';
import type { Category } from './presetCategories';
import { deleteUserPreset, ensureLibrary, renameUserPreset, useFavourites, useLibrary, userPresets } from './presetLibraryStore';
import { idOf, refOf, entriesFor } from './presetEntries';
import type { Entry } from './presetEntries';
import PresetTabs from './PresetTabs';
import PresetTile from './PresetTile';
import { applyUserPresetCmd } from './transferCommands';
import UserPresetTile from './UserPresetTile';
import { usePresetPopover } from './usePresetPopover';
import './presets.css';

export type { Category };
const COLS = 3;

interface Props {
  clip: Clip;
  slot: MotionSlot;
  /** The button that opened the browser: focus returns to it; presses on it are not "outside". */
  anchor: HTMLElement | null;
  onClose(): void;
}

export default function PresetBrowser({ clip, slot, anchor, onClose }: Props) {
  const [cat, setCat] = useState<Category>(slot);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const { favourites, isFavourite, toggle } = useFavourites();
  const library = useLibrary((s) => s.state);
  const mine = useLibrary(userPresets);
  const writable = library?.status === 'ok';
  useEffect(() => { void ensureLibrary(); }, []);

  const shown = entriesFor(cat, query, mine, favourites);
  const at = Math.min(active, Math.max(0, shown.length - 1));

  const close = (refocus: boolean): void => {
    onClose();
    if (refocus) anchor?.focus();
  };
  const pos = usePresetPopover(root, search, anchor, onClose);

  const apply = (e: Entry): void => {
    if (e.kind === 'user') {
      if (applyUserPresetCmd(clip.id, e.preset)) close(true);
      return;
    }
    if (reasonFor(clip, e.key)) return;
    // A refused edit (locked track ...) keeps the browser open: the toast says why and another tile can be tried.
    if (setPresetCmd(clip.id, e.slot, e.key)) close(true);
  };

  const remove = async (p: UserPreset): Promise<void> => {
    const ok = await askConfirm({
      title: `Delete "${p.name}"?`,
      message: 'It is removed from your preset library only: clips that used it keep their animation. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (ok) await deleteUserPreset(p.id);
  };

  const move = (i: number): void => {
    const n = Math.min(Math.max(0, i), shown.length - 1);
    setActive(n);
    tiles.current[n]?.focus();
  };

  const onTileKey = (ev: KeyboardEvent<HTMLDivElement>, i: number): void => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    if (ev.key === 'ArrowUp' && i < COLS) search.current?.focus();
    else if (ev.key in steps) move(i + steps[ev.key]);
    else if (ev.key === 'Home') move(0);
    else if (ev.key === 'End') move(shown.length - 1);
    else if (ev.key === 'Enter' || ev.key === ' ') apply(shown[i]);
    else if (ev.key === 'f' || ev.key === 'F') toggle(refOf(shown[i]));
    else return;
    ev.preventDefault();
  };

  // Every key inside stays inside (the EaseEditor pattern): global shortcuts never see it; Escape closes.
  const onRootKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' && shown.length > 0) {
      e.preventDefault();
      move(at);
    }
  };

  const animating = hovered ?? focused;
  const note = (cat === 'mine' || cat === 'favourites') && library && library.status !== 'ok'
    ? library.status === 'readOnly' ? `Your preset library is read-only: ${library.reason}` : 'Presets cannot be saved in this browser.'
    : null;
  return (
    <div
      ref={root}
      className="preset-browser"
      data-testid="preset-browser"
      role="dialog"
      aria-label={`Choose ${CAT_LABEL[slot].toLowerCase()} preset`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      onKeyDown={onRootKey}
    >
      <PresetTabs
        slot={slot}
        cat={cat}
        query={query}
        searchRef={search}
        onQuery={(v) => { setQuery(v); setActive(0); }}
        onCat={(c) => { setCat(c); setActive(0); }}
        onSearchKey={onSearchKey}
      />
      {note && <p className="preset-note" data-testid="preset-library-note">{note}</p>}
      {shown.length === 0 && <p className="preset-empty" data-testid="preset-empty">{query ? 'No preset matches.' : EMPTY[cat] ?? 'No presets.'}</p>}
      {shown.length > 0 && (
        <div className="preset-grid" role="listbox" aria-label={`${CAT_LABEL[cat]} presets`}>
          {shown.map((e, i) => e.kind === 'user' ? (
            <UserPresetTile
              key={idOf(e)}
              preset={e.preset}
              tabbable={i === at}
              favourite={isFavourite(refOf(e))}
              writable={writable}
              renaming={renaming === e.preset.id}
              onRenaming={(on) => setRenaming(on ? e.preset.id : null)}
              setRef={(el) => { tiles.current[i] = el; }}
              onApply={() => apply(e)}
              onToggleFavourite={() => toggle(refOf(e))}
              onRename={(name) => { void renameUserPreset(e.preset.id, name); }}
              onDelete={() => { void remove(e.preset); }}
              onFocus={() => setActive(i)}
              onKeyDown={(ev) => onTileKey(ev, i)}
            />
          ) : (
            <PresetTile
              key={idOf(e)}
              presetKey={e.key}
              slot={e.slot}
              tabbable={i === at}
              animate={animating === idOf(e)}
              disabledReason={reasonFor(clip, e.key)}
              favourite={isFavourite(refOf(e))}
              current={slotUse(clip, e.slot)?.preset === e.key}
              setRef={(el) => { tiles.current[i] = el; }}
              onApply={() => apply(e)}
              onToggleFavourite={() => toggle(refOf(e))}
              onHover={(on) => setHovered((h) => (on ? idOf(e) : h === idOf(e) ? null : h))}
              onFocus={(on) => {
                if (on) setActive(i);
                setFocused((f) => (on ? idOf(e) : f === idOf(e) ? null : f));
              }}
              onKeyDown={(ev) => onTileKey(ev, i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
