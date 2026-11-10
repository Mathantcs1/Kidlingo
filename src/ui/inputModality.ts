// Whether the element that has focus got it from the keyboard or from a pointer. `:focus-visible` is not used: a
// key pressed on a mouse-focused button does not reliably flip it, and the answer must not change mid-keypress.
let last: 'keyboard' | 'pointer' = 'pointer';
let focusedByKeyboard: Element | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (last = 'pointer'), true);
  window.addEventListener(
    'keydown',
    (e) => {
      // Modifier-only presses do not move focus; every other key (Tab above all) counts as keyboard use.
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) last = 'keyboard';
    },
    true,
  );
  window.addEventListener('focusin', (e) => (focusedByKeyboard = last === 'keyboard' ? (e.target as Element) : null), true);
}

/** True when `el` has focus and received it through the keyboard (Tab, arrow keys, a keyboard-driven focus()). */
export function isKeyboardFocused(el: Element | null): boolean {
  return el !== null && el === focusedByKeyboard && el === document.activeElement;
}

/** True when the most recent input was a key press (not a pointer). */
export function lastInputWasKeyboard(): boolean {
  return last === 'keyboard';
}
