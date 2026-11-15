import { newId } from './model';
import type { VisualEffect } from './model';

/** Copies the effect stack with NEW ids (ids stay unique across clips after split/paste). */
export function cloneFx(fx: VisualEffect[]): VisualEffect[] {
  return fx.map((e) => ({ ...e, id: newId(), params: { ...e.params } }));
}
