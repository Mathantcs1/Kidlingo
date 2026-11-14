// The preset browser (Plan 5B D10, §7): a popover beside the inspector with category tabs, a search field and a grid
// of animated preview tiles. Click or Enter applies a tile to ITS slot (the tab's category) in ONE step, closes and
// returns focus to the opener; Escape closes without change. The grid is ONE tab stop (roving tabindex; arrows,
// Home/End move; F stars the focused tile). Keys pressed inside never reach the global shortcuts.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Clip } from '../core/model';
import { ADJUSTMENT_ONLY_FADE } from '../core/motionEdits';
import { MOTION_SLOTS } from '../core/motionTypes';
import type { MotionSlot, PresetKey } from '../core/motionTypes';
import { PRESETS, presetsForSlot } from '../core/presets';
import { setPresetCmd, slotUse } from './presetCommands';
import { useFavourites } from './presetFavourites';
import { searchPresets } from './presetSearch';
import type { PresetEntry } from './presetSearch';
import PresetTile from './PresetTile';
import './presets.css';

export type Category = MotionSlot | 'mine' | 'favourites';
const CATEGORIES: readonly Category[] = [...MOTION_SLOTS, 'mine', 'favourites'];
const CAT_LABEL: Record<Category, string> = { in: 'Entrance', emphasis: 'Emphasis', loop: 'Continuous', out: 'Exit', mine: 'My presets', favourites: 'Favourites' };
const EMPTY: Partial<Record<Category, string>> = {
  mine: 'Presets you save from a clip appear here.',
  favourites: 'Star a preset to keep it here.',
};
const COLS = 3;
const MARGIN = 8;

interface Props {
  clip: Clip;
  slot: MotionSlot;
  /** The button that opened the browser: focus returns to it; presses on it are not "outside". */
  anchor: HTMLElement | null;
  onClose(): void;
}

/** Why `key` cannot go on this clip, or null. */
const reasonFor = (clip: Clip, key: PresetKey): string | null => (clip.kind === 'adjustment' && !PRESETS[key].opacityOnly ? ADJUSTMENT_ONLY_FADE : null);

export default function PresetBrowser({ clip, slot, anchor, onClose }: Props) {
  const [cat, setCat] = useState<Category>(slot);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
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

  useLayoutEffect(() => {
    const place = (): void => {
      const panel = root.current;
      const ref = (anchor?.closest('.inspector') as HTMLElement | null) ?? anchor;
      if (!panel || !ref) return;
      const r = ref.getBoundingClientRect();
      const a = anchor?.getBoundingClientRect() ?? r;
      const h = panel.offsetHeight;
      setPos({
        left: Math.max(MARGIN, r.left - panel.offsetWidth - MARGIN),
        top: Math.min(Math.max(MARGIN, a.top - 40), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  // Focus the search once the panel is placed (a visibility: hidden field cannot take focus).
  const placed = pos !== null;
  useEffect(() => {
    if (placed) search.current?.focus();
  }, [placed]);

  useEffect(() => {
    const onDown = (e: Event): void => {
      const t = e.target as Node;
      if (root.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [anchor, onClose]);

  const apply = (e: PresetEntry): void => {
    if (reasonFor(clip, e.key)) return;
    setPresetCmd(clip.id, e.slot, e.key);
    close(true);
  };

  const move = (i: number): void => {
    const n = Math.min(Math.max(0, i), shown.length - 1);
    setActive(n);
    tiles.current[n]?.focus();
  };

  const onTileKey = (e: KeyboardEvent<HTMLDivElement>, i: number): void => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    if (e.key in steps) move(i + steps[e.key]);
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
      <input
        ref={search}
        type="search"
        className="preset-search"
        data-testid="preset-search"
        placeholder="Search presets"
        aria-label="Search presets"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={onSearchKey}
      />
      <div className="preset-cats" role="tablist" aria-label="Preset categories">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            className="preset-cat"
            data-testid={`preset-cat-${c}`}
            aria-selected={c === cat}
            onClick={() => { setCat(c); setActive(0); }}
          >
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>
      {cat !== slot && MOTION_SLOTS.includes(cat as MotionSlot) && <p className="preset-note">Applies as the {CAT_LABEL[cat].toLowerCase()} preset.</p>}
      <p className="preset-note">Choosing another preset resets its settings (its timing and direction are kept).</p>
      <div className="preset-grid" role="listbox" aria-label={`${CAT_LABEL[cat]} presets`}>
        {shown.length === 0 && <p className="preset-empty" data-testid="preset-empty">{query ? 'No preset matches.' : EMPTY[cat] ?? 'No presets.'}</p>}
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
    </div>
  );
}
