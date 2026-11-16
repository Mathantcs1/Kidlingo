// Plan 5C Task 8: Delete routing tiers: selected keys first, then a selected transition, then the clips.
import { describe, it, expect } from 'vitest';
import { keyRouted } from '../src/ui/keys';

describe('keyRouted with transitions', () => {
  it('keys win over a transition, a transition over the clips, nothing selected leaves the key alone', () => {
    expect(keyRouted('delete', true, true)).toBe('deleteKeys');
    expect(keyRouted('rippleDelete', false, true)).toBe('deleteTransition');
    expect(keyRouted('delete', false, true)).toBe('deleteTransition');
    expect(keyRouted('delete', false, false)).toBe('delete');
    expect(keyRouted('split', false, true)).toBe('split');
    expect(keyRouted('copy', true, true)).toBe('copyKeys');
  });
});
