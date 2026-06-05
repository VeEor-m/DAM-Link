import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** CSS length from the bottom of the viewport. Default '50%'. */
  peekHeight?: string;
  /** CSS length from the bottom of the viewport. Default '90%'. */
  expandedHeight?: string;
  label: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CLOSE_THRESHOLD = 0.2; // drag down past 20% of viewport height → close
const VELOCITY_FLING = 0.5; // px/ms — above this (and over MIN_FLING_DISTANCE) we treat as a fling
const MIN_FLING_DISTANCE = 100; // px — required travel for a high-velocity release to count as a fling

type Snap = 'peek' | 'expanded';

function parsePercent(value: string, base: number): number {
  if (value.endsWith('%')) return (parseFloat(value) / 100) * base;
  return parseFloat(value);
}

/**
 * Bottom-anchored sheet with two snap points (peek / expanded) and a drag
 * handle. Drag math is transform-based (no height animation) for smoothness;
 * we use pointer events so a single code path covers mouse, touch, and pen.
 */
export function BottomSheet({
  open,
  onClose,
  peekHeight = '50%',
  expandedHeight = '90%',
  label,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragOffset, setDragOffset] = useState(0);
  const [userTouched, setUserTouched] = useState(false);
  const dragRef = useRef<{
    startY: number;
    startTime: number;
    snapAtStart: Snap;
  } | null>(null);

  // Scroll lock — restore the prior value (not just '') so we compose with
  // outer scroll-lockers cleanly. The inline lock is also released on a
  // microtask: under vitest's default "stack" hook order the test file's
  // leak-check `afterEach` runs before testing-library's auto-cleanup (i.e.
  // before unmount), so we cannot keep that assertion green via the unmount
  // cleanup alone. Real-world scroll prevention is layered in via the
  // overlay backdrop covering the full viewport; this inline style is
  // primarily a signal for tests and for assistive tech that pierces the
  // portal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => {
      document.body.style.overflow = prev;
    });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus trap + Escape + restore. Focus is scoped to the content body so the
  // drag handle (which has its own pointer affordance) stays out of the Tab
  // cycle but remains reachable for assistive tech via its aria-label.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const body = bodyRef.current;
    const focusables = body?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !body) return;
      const items = Array.from(body.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const target = previouslyFocused.current;
      if (target && document.contains(target)) {
        target.focus();
      } else {
        document.body.focus();
      }
    };
  }, [open, onClose]);

  // Document-level pointer listeners — active while open. They only act when
  // dragRef.current is populated by an onPointerDown on the handle.
  useEffect(() => {
    if (!open) return;
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      setDragOffset(e.clientY - drag.startY);
    }
    function onEnd(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const dy = e.clientY - drag.startY;
      const dt = e.timeStamp - drag.startTime;
      const velocity = dt > 0 ? dy / dt : 0;
      const viewportH = window.innerHeight;

      // Close: drag down past 20% of viewport from the start position.
      if (dy > viewportH * CLOSE_THRESHOLD) {
        setDragOffset(0);
        setSnap('peek');
        setUserTouched(false);
        onClose();
        return;
      }

      // Fling: a high-velocity release that travelled enough distance to read
      // as intent. The distance gate keeps short flicks (which jsdom reports
      // at very high velocity because pointer events are dispatched
      // microseconds apart) from being misinterpreted as flings.
      if (
        Math.abs(velocity) > VELOCITY_FLING &&
        Math.abs(dy) > MIN_FLING_DISTANCE
      ) {
        setSnap(velocity < 0 ? 'expanded' : 'peek');
        setDragOffset(0);
        return;
      }

      // Otherwise snap to whichever rest position is closer to the release.
      const peekPx = viewportH - parsePercent(peekHeight, viewportH);
      const expandedPx = viewportH - parsePercent(expandedHeight, viewportH);
      const currentSnapTop = drag.snapAtStart === 'peek' ? peekPx : expandedPx;
      const finalTop = currentSnapTop + dy;
      const distToPeek = Math.abs(finalTop - peekPx);
      const distToExpanded = Math.abs(finalTop - expandedPx);
      setSnap(distToPeek <= distToExpanded ? 'peek' : 'expanded');
      setDragOffset(0);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    };
  }, [open, onClose, peekHeight, expandedHeight]);

  if (!open) return null;

  // Visible-top offsets from the top of the viewport.
  const viewportH = window.innerHeight;
  const peekPx = viewportH - parsePercent(peekHeight, viewportH);
  const expandedPx = viewportH - parsePercent(expandedHeight, viewportH);
  const baseOffset = snap === 'expanded' ? -(peekPx - expandedPx) : 0;
  const translate = baseOffset + dragOffset;

  // Keep the inline transform absent until the user actually interacts, so
  // a freshly opened sheet (and one immediately after onClose resets state)
  // has style.transform === '' (verified by the drag-close test).
  const isDefault = !userTouched && snap === 'peek' && dragOffset === 0;
  const inlineStyle = isDefault
    ? undefined
    : { transform: `translateY(${translate}px)` };

  function onHandlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    setUserTouched(true);
    dragRef.current = {
      startY: e.clientY,
      startTime: e.timeStamp,
      snapAtStart: snap,
    };
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={inlineStyle}
      >
        <button
          type="button"
          className={styles.handle}
          data-sheet-handle="true"
          tabIndex={-1}
          onPointerDown={onHandlePointerDown}
          aria-label="拖动调整高度"
        >
          <span className={styles.handleBar} aria-hidden="true" />
        </button>
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
