// The search field and the category tabs of the preset browser (Plan 5B D10).
import type { KeyboardEvent, RefObject } from 'react';
import { MOTION_SLOTS } from '../core/motionTypes';
import type { MotionSlot } from '../core/motionTypes';
import { CATEGORIES, CAT_LABEL } from './presetCategories';
import type { Category } from './presetCategories';

interface Props {
  slot: MotionSlot;
  cat: Category;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery(q: string): void;
  onCat(c: Category): void;
  onSearchKey(e: KeyboardEvent<HTMLInputElement>): void;
}

export default function PresetTabs({ slot, cat, query, searchRef, onQuery, onCat, onSearchKey }: Props) {
  return (
    <>
      <input
        ref={searchRef}
        type="search"
        className="preset-search"
        data-testid="preset-search"
        placeholder="Search presets"
        aria-label="Search presets"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onSearchKey}
      />
      <div className="preset-cats" role="tablist" aria-label="Preset categories">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" className="preset-cat" data-testid={`preset-cat-${c}`} aria-selected={c === cat} onClick={() => onCat(c)}>
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>
      {cat !== slot && MOTION_SLOTS.includes(cat as MotionSlot) && <p className="preset-note">Applies as the {CAT_LABEL[cat].toLowerCase()} preset.</p>}
      <p className="preset-note">Choosing another preset resets its settings (its timing and direction are kept).</p>
    </>
  );
}
