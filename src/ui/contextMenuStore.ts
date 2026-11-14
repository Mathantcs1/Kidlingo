import { create } from 'zustand';
import type { MenuItem, Point } from './contextMenuModel';

export interface OpenMenu {
  at: Point;
  label: string;
  items: MenuItem[];
  /** A trigger button of the menu (data-menu-trigger): pressing it is not an outside click. */
  owner?: string;
}

export const useContextMenu = create<{ menu: OpenMenu | null }>()(() => ({ menu: null }));

export const openMenu = (menu: OpenMenu): void => useContextMenu.setState({ menu });
export const closeMenu = (): void => useContextMenu.setState({ menu: null });
