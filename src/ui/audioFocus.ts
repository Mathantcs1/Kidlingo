// Keeps keyboard focus on something useful when Detach/Attach swaps the control that had it.
import { focusAs, lastInputWasKeyboard } from './inputModality';

type Target = string;

/**
 * For a keyboard-initiated action only: after the next render, focus the first usable element among `testIds`
 * (a disabled or missing one is skipped). Mouse-initiated actions leave focus alone.
 */
export function focusAfterRender(wasKeyboard: boolean, ...testIds: Target[]): void {
  if (!wasKeyboard) return;
  requestAnimationFrame(() => {
    for (const id of testIds) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (el && !el.matches(':disabled')) {
        focusAs(el, 'keyboard');
        return;
      }
    }
  });
}

export const keyboardDriven = lastInputWasKeyboard;
