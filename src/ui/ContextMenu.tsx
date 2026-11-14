// The one menu component: right-click context menus and dropdowns (Help). role=menu / menuitem, arrow keys, Home/End,
// Enter/Space, Escape and Tab close it (focus goes back where it was), an outside press, a scroll or a resize closes
// it, and it stays inside the viewport. While it is open it owns the keyboard: no editor shortcut fires.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { firstEnabled, formatShortcut, isMac, lastEnabled, placeMenu, stepIndex } from './contextMenuModel';
import type { MenuAction } from './contextMenuModel';
import { closeMenu, useContextMenu } from './contextMenuStore';
import './contextMenu.css';

export default function ContextMenu() {
  const menu = useContextMenu((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const focusItem = (i: number): void => {
    ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[i]?.focus();
  };
  // Item index → DOM index: separators are not menuitems.
  const items = menu?.items ?? [];
  const domIndex = (i: number): number => items.slice(0, i).filter((x) => x !== 'separator').length;

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPos(null);
      return;
    }
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const r = ref.current.getBoundingClientRect();
    setPos(placeMenu(menu.at, r, { width: window.innerWidth, height: window.innerHeight }));
    const first = firstEnabled(menu.items);
    if (first >= 0) focusItem(domIndex(first));
    else ref.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (restore: boolean): void => {
      closeMenu();
      if (restore) returnTo.current?.focus?.();
    };
    const current = (): number | null => {
      const els = [...(ref.current?.querySelectorAll('[role="menuitem"]') ?? [])];
      const at = els.indexOf(document.activeElement as Element);
      if (at < 0) return null;
      let n = -1;
      for (let i = 0; i < menu.items.length; i++) {
        if (menu.items[i] !== 'separator') n++;
        if (n === at) return i;
      }
      return null;
    };
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation(); // the menu owns the keyboard while open
      const from = current();
      let to: number | null = null;
      if (e.key === 'Escape') return void (e.preventDefault(), close(true));
      if (e.key === 'Tab') return void close(true);
      if (e.key === 'ArrowDown') to = stepIndex(menu.items, from, 1);
      else if (e.key === 'ArrowUp') to = stepIndex(menu.items, from, -1);
      else if (e.key === 'Home') to = firstEnabled(menu.items);
      else if (e.key === 'End') to = lastEnabled(menu.items);
      else if ((e.key === 'Enter' || e.key === ' ') && from !== null) {
        e.preventDefault();
        const item = menu.items[from];
        if (item !== 'separator' && !item.disabled) (document.activeElement as HTMLElement).click();
        return;
      }
      if (to !== null) {
        e.preventDefault();
        if (to >= 0) focusItem(domIndex(to));
      }
    };
    const onPointerDown = (e: PointerEvent): void => {
      const t = e.target as Element | null;
      if (t && ref.current?.contains(t)) return;
      if (menu.owner && t?.closest(`[data-menu-trigger="${menu.owner}"]`)) return;
      close(false);
    };
    const onDismiss = (): void => close(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const select = (item: MenuAction): void => {
    closeMenu();
    returnTo.current?.focus?.();
    item.onSelect();
  };

  if (!menu) return null;
  const mac = isMac();
  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      aria-label={menu.label}
      tabIndex={-1}
      data-testid="context-menu"
      style={{ left: pos?.x ?? menu.at.x, top: pos?.y ?? menu.at.y, opacity: pos ? 1 : 0 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) =>
        item === 'separator' ? (
          <div key={`sep-${i}`} className="ctx-sep" role="separator" />
        ) : item.href ? (
          <a
            key={item.id}
            role="menuitem"
            tabIndex={-1}
            className="ctx-item"
            href={item.href}
            target="_blank"
            rel="noopener"
            data-testid={item.testId ?? `ctx-${item.id}`}
            onClick={() => closeMenu()}
          >
            <span>{item.label}</span>
          </a>
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="ctx-item"
            data-testid={item.testId ?? `ctx-${item.id}`}
            aria-disabled={item.disabled || undefined}
            title={item.title}
            onClick={() => !item.disabled && select(item)}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd className="ctx-kbd">{formatShortcut(item.shortcut, mac)}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
