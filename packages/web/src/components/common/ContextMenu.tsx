import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  anchor: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
  /**
   * Optional ref to the element that opened the menu (the trigger button).
   * When provided, focus is restored to it on close per the WAI-ARIA APG
   * menu pattern. Optional for backward compatibility: if absent, the menu
   * still works, it just doesn't restore focus.
   */
  triggerRef?: HTMLElement | null;
}

export function ContextMenu({ anchor, items, onClose, triggerRef }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Keep current prop values accessible to the stable listeners below so the
  // listener effect only depends on `anchor` and doesn't tear down on every
  // parent re-render. Updating these refs during render is forbidden by
  // `react-hooks/refs`, so the assignment happens in the effect below
  // (which runs on every render, before the keydown listener uses them).
  const itemsRef = useRef(items);
  const onCloseRef = useRef(onClose);
  const triggerElRef = useRef<HTMLElement | null>(triggerRef);

  useEffect(() => {
    itemsRef.current = items;
    onCloseRef.current = onClose;
    triggerElRef.current = triggerRef;
  });

  useEffect(() => {
    if (!anchor) return;

    // Indices of focusable items (skip dividers and disabled). Recomputed
    // per key event because `items` may have changed since mount.
    const focusableIndices = (): number[] => {
      const out: number[] = [];
      itemsRef.current.forEach((it, i) => {
        if (!it.divider && !it.disabled) out.push(i);
      });
      return out;
    };

    function onDocPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current();
        // Restore focus to the trigger per spec.
        triggerElRef.current?.focus();
      }
    }
    function onKey(e: KeyboardEvent) {
      // WAI-ARIA APG: Tab closes the menu (do NOT trap focus — this is a
      // menu, not a modal). The browser moves focus to the next focusable
      // element naturally.
      if (e.key === 'Tab') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        triggerElRef.current?.focus();
        return;
      }

      const navigates =
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Home' ||
        e.key === 'End' ||
        e.key === 'Enter' ||
        e.key === ' ';
      if (!navigates) return;

      const indices = focusableIndices();
      if (indices.length === 0) return;

      const currentPos = indices.findIndex(
        (i) => itemRefs.current[i] === document.activeElement,
      );

      // Enter / Space: the browser dispatches click on the focused button
      // automatically. Disabled buttons don't fire click, so disabled items
      // cannot be activated. The click handler is responsible for invoking
      // `onClose` and restoring focus.
      if (e.key === 'Enter' || e.key === ' ') return;

      e.preventDefault();

      let nextIdx: number;
      if (e.key === 'Home') nextIdx = indices[0];
      else if (e.key === 'End') nextIdx = indices[indices.length - 1];
      else if (e.key === 'ArrowDown')
        nextIdx =
          currentPos === -1
            ? indices[0]
            : indices[(currentPos + 1) % indices.length];
      else
        nextIdx =
          currentPos === -1
            ? indices[indices.length - 1]
            : indices[(currentPos - 1 + indices.length) % indices.length];

      itemRefs.current[nextIdx]?.focus();
    }

    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor]);

  // Auto-focus the first focusable item when the menu opens.
  useEffect(() => {
    if (!anchor) return;
    const idx = items.findIndex((i) => !i.divider && !i.disabled);
    if (idx === -1) return;
    itemRefs.current[idx]?.focus();
  }, [anchor, items]);

  if (!anchor) return null;

  // Flip if menu would overflow the viewport.
  // Height matches actual rendered size: 32px per menuitem (from `.item`),
  // 9px per divider (0.5px line + 4px margin top + 4px margin bottom from
  // `.divider`), plus 8px total padding (4px top + 4px bottom from `.menu`).
  const MENU_WIDTH = 180;
  const MENU_HEIGHT =
    items.reduce((sum, i) => sum + (i.divider ? 9 : 32), 0) + 8;
  const left = anchor.x + MENU_WIDTH > window.innerWidth
    ? Math.max(8, anchor.x - MENU_WIDTH)
    : anchor.x;
  const top = anchor.y + MENU_HEIGHT > window.innerHeight
    ? Math.max(8, anchor.y - MENU_HEIGHT)
    : anchor.y;

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={{ left, top }}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={item.key} className={styles.divider} role="separator" />;
        }
        return (
          <button
            key={item.key}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            className={`${styles.item} ${item.danger ? styles.danger : ''}`}
            onClick={() => {
              // No `disabled` guard needed: a `disabled` button does not
              // dispatch click events in the browser.
              item.onClick?.();
              onClose();
              triggerElRef.current?.focus();
            }}
            disabled={item.disabled}
            role="menuitem"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
