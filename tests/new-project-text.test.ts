import { describe, it, expect } from 'vitest';
import { newProjectWarning } from '../src/ui/projectCommands';

describe('newProjectWarning', () => {
  it('describes a saved project that failed to load', () => {
    expect(newProjectWarning('failed')).toMatch(/could not be loaded.*replaces the saved project and deletes its imported files/);
  });

  it('describes a saved project that was not loaded because the user started editing first', () => {
    const text = newProjectWarning('skipped');
    expect(text).toMatch(/was not loaded because you started editing first.*replaces it and deletes its imported files/);
    expect(text).not.toContain('could not be loaded');
  });

  it('describes clearing the current project otherwise', () => {
    expect(newProjectWarning(null)).toMatch(/timeline and the media bin are cleared/);
  });
});
