// Plan 5B Task 7: the preset browser search (D10): case-insensitive, label matches rank above synonym matches, ties
// keep the library order, an empty query keeps everything.
import { describe, expect, it } from 'vitest';
import { presetsForSlot } from '../src/core/presets';
import { searchPresets } from '../src/ui/presetSearch';
import type { PresetEntry } from '../src/ui/presetSearch';

const entries = (slot: PresetEntry['slot']): PresetEntry[] => presetsForSlot(slot).map((key) => ({ key, slot }));
const keys = (r: PresetEntry[]): string[] => r.map((e) => e.key);

describe('searchPresets', () => {
  it('an empty or blank query keeps every entry in order', () => {
    const all = entries('in');
    expect(searchPresets(all, '')).toEqual(all);
    expect(searchPresets(all, '   ')).toEqual(all);
  });

  it('is case-insensitive and matches labels and synonyms', () => {
    expect(keys(searchPresets(entries('in'), 'FADE'))).toEqual(['fade', 'rise']); // Rise: synonym 'fade up'
    expect(keys(searchPresets(entries('in'), 'rotate'))).toEqual(['spin']);
    expect(keys(searchPresets(entries('emphasis'), 'Earthquake'))).toEqual(['shake']);
    expect(searchPresets(entries('in'), 'nothing like this')).toEqual([]);
  });

  it('ranks a label match above a synonym match, whatever the library order', () => {
    // Breathe lists 'pulse' as a synonym and comes first here; Pulse's label wins.
    const mixed: PresetEntry[] = [{ key: 'breathe', slot: 'loop' }, { key: 'pulse', slot: 'emphasis' }];
    expect(keys(searchPresets(mixed, 'pulse'))).toEqual(['pulse', 'breathe']);
    // Blink's synonym 'flash' vs Flash's label.
    expect(keys(searchPresets([{ key: 'blink', slot: 'loop' }, { key: 'flash', slot: 'emphasis' }], 'Flash'))).toEqual(['flash', 'blink']);
    // Several label matches keep the given order; a label substring counts as a label match.
    expect(keys(searchPresets([{ key: 'spinLoop', slot: 'loop' }, { key: 'spin360', slot: 'emphasis' }, { key: 'spin', slot: 'in' }], 'spin'))).toEqual(['spinLoop', 'spin360', 'spin']);
    expect(keys(searchPresets([{ key: 'kenBurns', slot: 'loop' }, { key: 'pop', slot: 'in' }], 'burns'))).toEqual(['kenBurns']);
  });

  it('uses the exit names in the Exit list (Rise is Sink on the way out)', () => {
    expect(keys(searchPresets(entries('out'), 'sink'))).toEqual(['rise']);
    expect(keys(searchPresets(entries('in'), 'rise'))).toEqual(['rise']);
  });

  it('ties keep the given order (several synonym matches)', () => {
    expect(keys(searchPresets(entries('in'), 'bounce'))).toEqual(['pop', 'drop']);
  });
});
