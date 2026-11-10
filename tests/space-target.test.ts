import { describe, it, expect } from 'vitest';
import { MAX_TRACK_NAME, renameTrack } from '../src/core/tracks';
import { emptyProject } from '../src/core/model';
import { nativeSpaceTarget } from '../src/ui/keys';

describe('nativeSpaceTarget', () => {
  it('is true for controls that Space activates natively', () => {
    expect(nativeSpaceTarget({ tagName: 'BUTTON' })).toBe(true);
    expect(nativeSpaceTarget({ tagName: 'summary' })).toBe(true);
    expect(nativeSpaceTarget({ tagName: 'A', hasHref: true })).toBe(true);
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset', 'CHECKBOX']) {
      expect(nativeSpaceTarget({ tagName: 'INPUT', type }), type).toBe(true);
    }
    for (const role of ['button', 'switch', 'checkbox']) {
      expect(nativeSpaceTarget({ tagName: 'SPAN', role }), role).toBe(true);
    }
  });

  it('is false for everything else', () => {
    expect(nativeSpaceTarget({ tagName: 'A' })).toBe(false);
    expect(nativeSpaceTarget({ tagName: 'DIV' })).toBe(false);
    expect(nativeSpaceTarget({ tagName: 'BODY' })).toBe(false);
    expect(nativeSpaceTarget({ tagName: 'DIV', role: 'group' })).toBe(false);
    expect(nativeSpaceTarget({ tagName: 'INPUT', type: 'text' })).toBe(false);
    expect(nativeSpaceTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(nativeSpaceTarget({ tagName: 'SELECT' })).toBe(false);
  });
});

describe('MAX_TRACK_NAME', () => {
  it('is the 40 code-point limit renameTrack applies', () => {
    expect(MAX_TRACK_NAME).toBe(40);
    const p = emptyProject();
    const named = renameTrack(p, p.tracks[0].id, 'x'.repeat(50));
    expect(named.tracks[0].name).toHaveLength(MAX_TRACK_NAME);
  });
});
