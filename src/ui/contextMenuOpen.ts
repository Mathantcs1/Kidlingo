import type { MouseEvent } from 'react';
import type { MenuItem } from './contextMenuModel';
import { openMenu } from './contextMenuStore';
import { isTextEntry } from './keys';

/** Opens a menu at the pointer for a right-click; text fields keep the browser's own menu. Returns true when opened. */
export function openContextMenu(e: MouseEvent, label: string, build: () => MenuItem[]): boolean {
  const t = e.target as HTMLElement;
  if (isTextEntry({ tagName: t.tagName, type: (t as HTMLInputElement).type, isContentEditable: t.isContentEditable })) return false;
  e.preventDefault();
  e.stopPropagation();
  const items = build();
  if (items.length === 0) return false;
  openMenu({ at: { x: e.clientX, y: e.clientY }, label, items });
  return true;
}
