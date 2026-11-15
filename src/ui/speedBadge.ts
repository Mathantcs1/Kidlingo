import type { Clip } from '../core/model';

/** The short retiming label shown on a clip in the timeline ("2×", "◀ 0.5×", "Ramp", "Freeze"), or null at normal speed. */
export function speedBadge(c: Clip): string | null {
  if (c.freeze !== undefined) return 'Freeze';
  const rev = c.reverse === true ? '◀ ' : '';
  if (c.speedKeys && c.speedKeys.length > 0) return `${rev}Ramp`;
  if (c.speed !== undefined && c.speed !== 1) return `${rev}${Number(c.speed.toFixed(2))}×`;
  return c.reverse === true ? '◀' : null;
}
