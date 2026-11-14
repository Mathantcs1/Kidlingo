// The preset browser (Plan 5B D10, §7): a popover beside the inspector with category tabs, a search field and a grid
// of animated preview tiles. Click or Enter applies a tile to ITS slot (the tab's category) in ONE step, closes and
// returns focus to the opener; Escape closes without change. The grid is ONE tab stop (roving tabindex; arrows,
// Home/End move; F stars the focused tile). Keys pressed inside never reach the global shortcuts.
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Clip } from '../core/model';
import type { MotionSlot } from '../core/motionTypes';
import { presetsForSlot } from '../core/presets';
import { setPresetCmd, slotUse } from './presetCommands';
import { useFavourites } from './presetFavourites';
import { CAT_LABEL, EMPTY, reasonFor } from './presetCategories';
import type { Category } from './presetCategories';
import { searchPresets } from './presetSearch';
import type { PresetEntry } from './presetSearch';
import PresetTabs from './PresetTabs';
import PresetTile from './PresetTile';
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
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const { favourites, isFavourite, toggle } = useFavourites();

  const all: PresetEntry[] = cat === 'mine' ? [] : cat === 'favourites' ? favourites : presetsForSlot(cat).map((key) => ({ key, slot: cat }));
  const shown = searchPresets(all, query);
  const at = Math.min(active, Math.max(0, shown.length - 1));

  const close = (refocus: boolean): void => {
    onClose();
    if (refocus) anchor?.focus();
  };

  const pos = usePresetPopover(root, search, anchor, onClose);

  const apply = (e: PresetEntry): void => {
    if (reasonFor(clip, e.key)) return;
    // A refused edit (locked track ...) keeps the browser open: the toast says why and another tile can be tried.
    if (setPresetCmd(clip.id, e.slot, e.key)) close(true);
  };

  const move = (i: number): void => {
    const n = Math.min(Math.max(0, i), shown.length - 1);
    setActive(n);
    tiles.current[n]?.focus();
  };

  const onTileKey = (e: KeyboardEvent<HTMLDivElement>, i: number): void => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    if (e.key === 'ArrowUp' && i < COLS) search.current?.focus();
    else if (e.key in steps) move(i + steps[e.key]);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(shown.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') apply(shown[i]);
    else if (e.key === 'f' || e.key === 'F') toggle(shown[i]);
    else return;
    e.preventDefault();
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

  const id = (e: PresetEntry): string => `${e.slot}:${e.key}`;
  const animating = hovered ?? focused;
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
        onQuery={(q) => { setQuery(q); setActive(0); }}
        onCat={(c) => { setCat(c); setActive(0); }}
        onSearchKey={onSearchKey}
      />
      {shown.length === 0 && <p className="preset-empty" data-testid="preset-empty">{query ? 'No preset matches.' : EMPTY[cat] ?? 'No presets.'}</p>}
      {shown.length > 0 && (
      <div className="preset-grid" role="listbox" aria-label={`${CAT_LABEL[cat]} presets`}>
        {shown.map((e, i) => (
          <PresetTile
            key={id(e)}
            presetKey={e.key}
            slot={e.slot}
            tabbable={i === at}
            animate={animating === id(e)}
            disabledReason={reasonFor(clip, e.key)}
            favourite={isFavourite(e)}
            current={slotUse(clip, e.slot)?.preset === e.key}
            setRef={(el) => { tiles.current[i] = el; }}
            onApply={() => apply(e)}
            onToggleFavourite={() => toggle(e)}
            onHover={(on) => setHovered((h) => (on ? id(e) : h === id(e) ? null : h))}
            onFocus={(on) => {
              if (on) setActive(i);
              setFocused((f) => (on ? id(e) : f === id(e) ? null : f));
            }}
            onKeyDown={(ev) => onTileKey(ev, i)}
          />
        ))}
      </div>
      )}
    </div>
  );
}
