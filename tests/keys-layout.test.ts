// Clipboard chords on non-Latin layouts (Plan 5B final review M6): Ctrl/Cmd+C/V/D fall back to the physical key
// (event.code) when event.key is not a Latin letter; a Latin key (AZERTY, Dvorak) still wins.
import { describe, expect, it } from 'vitest';
import { shortcutFor } from '../src/ui/keys';

const e = (key: string, code: string, over = {}) => ({ key, code, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...over });

describe('clipboard chords by layout', () => {
  it('Cyrillic and other non-Latin layouts use the physical key', () => {
    expect(shortcutFor(e('с', 'KeyC'))).toBe('copy');
    expect(shortcutFor(e('м', 'KeyV', { ctrlKey: false, metaKey: true }))).toBe('paste');
    expect(shortcutFor(e('в', 'KeyD'))).toBe('duplicate');
    expect(shortcutFor(e('ג', 'KeyC'))).toBe('copy');
  });
  it('a Latin key wins over the physical code (Dvorak: the C key types j)', () => {
    expect(shortcutFor(e('j', 'KeyC'))).toBeNull();
    expect(shortcutFor(e('c', 'KeyJ'))).toBe('copy');
  });
  it('keeps the modifier rules (shift, repeat, no modifier)', () => {
    expect(shortcutFor(e('с', 'KeyC', { shiftKey: true }))).toBeNull();
    expect(shortcutFor(e('с', 'KeyC', { repeat: true }))).toBeNull();
    expect(shortcutFor(e('с', 'KeyC', { ctrlKey: false }))).toBeNull();
    expect(shortcutFor(e('с', 'KeyX'))).toBeNull();
  });
});
