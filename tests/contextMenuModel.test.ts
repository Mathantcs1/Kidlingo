import { describe, expect, it } from 'vitest';
import { firstEnabled, formatShortcut, lastEnabled, placeMenu, stepIndex } from '../src/ui/contextMenuModel';
import type { MenuItem } from '../src/ui/contextMenuModel';

const a = (id: string, disabled = false): MenuItem => ({ id, label: id, disabled, onSelect: () => {} });
const items: MenuItem[] = [a('a', true), a('b'), 'separator', a('c'), a('d', true)];

describe('placeMenu', () => {
  const view = { width: 800, height: 600 };
  const size = { width: 200, height: 100 };
  it('keeps a menu that fits where it was opened', () => {
    expect(placeMenu({ x: 10, y: 20 }, size, view)).toEqual({ x: 10, y: 20 });
  });
  it('moves a menu back inside at the right and bottom edges', () => {
    expect(placeMenu({ x: 790, y: 590 }, size, view)).toEqual({ x: 596, y: 496 });
  });
  it('never goes past the top-left corner', () => {
    expect(placeMenu({ x: -5, y: -5 }, { width: 900, height: 700 }, view)).toEqual({ x: 4, y: 4 });
  });
});

describe('stepIndex', () => {
  it('skips disabled items and separators and wraps', () => {
    expect(firstEnabled(items)).toBe(1);
    expect(lastEnabled(items)).toBe(3);
    expect(stepIndex(items, 1, 1)).toBe(3);
    expect(stepIndex(items, 3, 1)).toBe(1);
    expect(stepIndex(items, 1, -1)).toBe(3);
  });
  it('returns -1 when nothing is enabled', () => {
    expect(stepIndex([a('x', true), 'separator'], null, 1)).toBe(-1);
  });
});

describe('formatShortcut', () => {
  it('spells Mod as Ctrl or the Mac symbols', () => {
    expect(formatShortcut('Mod+Alt+C', false)).toBe('Ctrl+Alt+C');
    expect(formatShortcut('Mod+Alt+C', true)).toBe('⌘⌥C');
    expect(formatShortcut('Shift+Delete', false)).toBe('Shift+Delete');
  });
});
