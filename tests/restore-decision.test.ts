import { describe, it, expect } from 'vitest';
import { shouldCollect } from '../src/ui/restoreOutcome';

describe('shouldCollect (startup media GC decision)', () => {
  it('collects only after a successful restore or a verified-absent save, in the lock-holding tab', () => {
    expect(shouldCollect('restored', 'held')).toBe(true);
    expect(shouldCollect('none', 'held')).toBe(true);
  });

  it.each(['failed', 'skipped', 'unavailable'] as const)('never collects after a %s restore', (outcome) => {
    expect(shouldCollect(outcome, 'held')).toBe(false);
  });

  it.each(['unsupported', 'error', 'locked', 'pending'] as const)('never collects when the lock state is %s', (lock) => {
    expect(shouldCollect('restored', lock)).toBe(false);
    expect(shouldCollect('none', lock)).toBe(false);
  });
});
