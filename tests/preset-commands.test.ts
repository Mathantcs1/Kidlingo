// Plan 5B Task 9 Part 0: the preset commands report whether the edit went through, so the browser closes only on
// success (a refused edit keeps it open and the toast shows why; a refusal adds no undo step).
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../src/state/store';
import { applyOk } from '../src/ui/applyOk';
import { setPresetCmd } from '../src/ui/presetCommands';
import { useToasts } from '../src/ui/Toast';
import { clipOf, project } from './keyframe-fixtures';

const state = () => useEditor.getState();
const depth = () => state().history.past.length;

beforeEach(() => {
  state().loadProject(project());
  state().setPlayhead(11);
  useToasts.setState({ toasts: [] });
});

describe('setPresetCmd result', () => {
  it('true when applied (one undo step), true again for a no-op repeat', () => {
    expect(setPresetCmd('c', 'in', 'fade')).toBe(true);
    expect(depth()).toBe(1);
    expect(clipOf(state().history.present, 'c').motion?.in?.preset).toBe('fade');
    expect(setPresetCmd('c', 'in', 'fade')).toBe(true);
    expect(depth()).toBe(1);
  });

  it('false when refused (locked track): no step, no change, a toast', () => {
    const before = state().history.present;
    expect(setPresetCmd('lc', 'in', 'fade')).toBe(false);
    expect(state().history.present).toBe(before);
    expect(depth()).toBe(0);
    expect(useToasts.getState().toasts.length).toBe(1);
  });
});

describe('applyOk', () => {
  it('false for a non-timeline throw too (guard reports it) and true for a plain edit', () => {
    expect(applyOk(() => { throw new Error('boom'); })).toBe(false);
    expect(applyOk((p) => p)).toBe(true);
  });
});
