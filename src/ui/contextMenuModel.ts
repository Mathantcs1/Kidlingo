// DOM-free helpers of the context menu / dropdown menu: the item type, placement inside the viewport, arrow-key
// navigation over the enabled items and the platform's shortcut spelling.

export interface MenuAction {
  /** Stable id: the test id is `ctx-<id>`. */
  id: string;
  label: string;
  /** Shortcut spec such as 'Mod+C', 'Mod+Alt+V', 'Shift+Delete', 'S' (see formatShortcut); shown right-aligned. */
  shortcut?: string;
  disabled?: boolean;
  /** Tooltip, e.g. why the item is disabled. */
  title?: string;
  /** A link item (opens in a new tab); `onSelect` is not called for it. */
  href?: string;
  /** Overrides the default test id `ctx-<id>`. */
  testId?: string;
  onSelect(): void;
}

export type MenuItem = MenuAction | 'separator';

export interface Point {
  x: number;
  y: number;
}

/** Top-left of a menu of `size` opened at `at`, moved so it stays inside the viewport (with `margin` to its edges). */
export function placeMenu(at: Point, size: { width: number; height: number }, view: { width: number; height: number }, margin = 4): Point {
  const x = Math.min(at.x, view.width - size.width - margin);
  const y = Math.min(at.y, view.height - size.height - margin);
  return { x: Math.max(margin, x), y: Math.max(margin, y) };
}

const enabled = (item: MenuItem | undefined): boolean => item !== undefined && item !== 'separator' && !item.disabled;

/**
 * The index to focus after an arrow key: the next (dir 1) or previous (dir -1) enabled item, wrapping around.
 * `from` null (nothing focused) starts at the first / last. -1 when no item is enabled.
 */
export function stepIndex(items: readonly MenuItem[], from: number | null, dir: 1 | -1): number {
  const n = items.length;
  let i = from ?? (dir === 1 ? -1 : n);
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (enabled(items[i])) return i;
  }
  return -1;
}

export const firstEnabled = (items: readonly MenuItem[]): number => stepIndex(items, null, 1);
export const lastEnabled = (items: readonly MenuItem[]): number => stepIndex(items, null, -1);

const MAC_KEY: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧' };

/** 'Mod+Alt+C' as "Ctrl+Alt+C" (Windows, Linux) or "⌘⌥C" (Mac). */
export function formatShortcut(spec: string, mac: boolean): string {
  const parts = spec.split('+');
  if (mac) return parts.map((p) => MAC_KEY[p] ?? p).join('');
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
