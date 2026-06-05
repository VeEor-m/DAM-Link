# Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the locked desktop-only (≥1024px) layout with a 4-tier responsive layout (phone ≤640, tablet 641–1023, desktop 1024–1280, wide >1280) that uses the existing feature surface on every breakpoint.

**Architecture:** CSS-driven layout via `body[data-viewport]` attribute selectors written by a `useViewport()` hook. All breakpoint behavior is in CSS Modules — components do not branch on viewport. Two new generic primitives (`<Drawer>`, `<BottomSheet>`) handle overlay UI on small screens. A new `<StackedCardList>` component replaces the 10-column row grid on phones. `App.tsx` renders each responsive slot in two places (nav vs. Drawer, side panel vs. BottomSheet) and shows exactly one per breakpoint via CSS.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, @testing-library/react, @testing-library/user-event, @tabler/icons-react, CSS Modules with custom properties.

**Spec:** `D:/DAM-Link/docs/superpowers/specs/2026-06-05-responsive-design.md`

**Decisions referenced:** #13 (desktop-only ≥1024px) is **overturned** by this plan.

---

## File structure (locked before tasks)

### New files
- `src/components/common/Drawer.tsx` + `Drawer.module.css` — slide-in overlay, focus trap, Esc, backdrop.
- `src/components/common/BottomSheet.tsx` + `BottomSheet.module.css` — bottom-anchored sheet, drag-to-snap, Esc, backdrop, scroll lock.
- `src/components/browser/StackedCardList.tsx` + `StackedCardList.module.css` — phone list view, always-visible ⋮.
- `src/hooks/useViewport.ts` — viewport tier + body[data-viewport].
- `tests/Drawer.test.tsx`
- `tests/BottomSheet.test.tsx`
- `tests/StackedCardList.test.tsx`
- `tests/useViewport.test.ts`

### Modified files
- `src/styles/tokens.css` — new wide-layout + touch-target tokens.
- `src/styles/global.css` — remove `.fallback-narrow` and the `@media (max-width: 1023px)` block that hides `.app-root`.
- `src/components/layout/AppShell.tsx` + `AppShell.module.css` — accept and stamp `data-viewport`; CSS grid templates per viewport.
- `src/components/toolbar/Toolbar.tsx` + `Toolbar.module.css` — add `compact: boolean` prop; render ☰ on compact; shorter placeholder.
- `src/components/sidebar/Sidebar.module.css` — minor padding tightening on compact.
- `src/components/detail/DetailPanel.tsx` + `DetailPanel.module.css` — accept `variant: 'side' | 'sheet'`; sheet variant places close button beside drag handle.
- `src/components/browser/AssetCard.tsx` + `AssetCard.module.css` — add always-visible `⋮` button (T2), wrap `:hover` in `@media (hover: hover)`.
- `src/components/browser/AssetListRow.tsx` + `AssetList.module.css` — wrap `:hover` in `@media (hover: hover)` (⋮ already present).
- `src/components/browser/AssetList.tsx` — call `useViewport()` and render `<StackedCardList>` when `vp === 'phone'`.
- `src/App.tsx` — call `useViewport()`; pass `compact` to Toolbar; render Sidebar in nav + Drawer; render DetailPanel as side-panel + BottomSheet; route via `useViewport()`.
- `tests/DetailPanel.test.tsx` — add `variant: 'sheet'` test case.

### Unchanged
- `src/state/*` (no model changes; viewport is derived).
- `src/components/common/Modal.tsx`, `ContextMenu.tsx`, `ConfirmDialog.tsx`, `ShortcutsHelp.tsx`, `ToastProvider.tsx`, `EmptyState.tsx`.
- All other existing tests.

---

## Conventions

- **TDD strictly**: write the failing test first, watch it fail, then implement.
- **One commit per task** with a Conventional Commit prefix (`feat:`, `refactor:`, `test:`, `style:`, `chore:`, `docs:`).
- **No new dependencies** — everything builds on what's already in `package.json` (Vitest, Testing Library, Tabler icons).
- **Touch targets ≥ 44×44** when the existing rule is below 32 (use `--touch-target-min` from `tokens.css`).
- **Pointer events**, not `touchstart`/`touchend`, for the BottomSheet drag.
- **Scroll lock** uses the existing `body { overflow: hidden }` pattern; restore on close.
- **Reduced motion**: the global rule in `global.css` already zeros out transitions; do not add per-component overrides.

---

## Task 1: Foundation CSS — tokens, remove fallback, responsive AppShell grid

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/AppShell.module.css`

- [ ] **Step 1.1: Add the new layout tokens to `src/styles/tokens.css`**

In the `:root` block, find the existing `/* Layout */` section (currently contains `--layout-height`, `--layout-sidebar-width`, etc.) and add the new tokens **after** the existing layout tokens. The block should now read:

```css
  /* Layout */
  --layout-height: 360px;
  --layout-sidebar-width: 160px;
  --layout-detail-width: 200px;
  --layout-toolbar-height: 52px;
  --layout-grid-min-card: 110px;

  /* Wide-screen layout (viewport > 1280px) */
  --layout-sidebar-width-wide: 200px;
  --layout-detail-width-wide: 320px;
  --layout-grid-min-card-wide: 140px;

  /* Touch-target minimum (iOS / WCAG 2.5.5) */
  --touch-target-min: 44px;
```

- [ ] **Step 1.2: Remove the desktop-only fallback in `src/styles/global.css`**

Delete the entire `.fallback-narrow` block and the `@media (max-width: 1023px) { .app-root { display: none !important; } … }` block. The file's tail should go from line 80 (end of `.sr-only`) directly to the `/* Respect user motion preferences */` block.

The final `src/styles/global.css` should look like this (keep all earlier content unchanged):

```css
@import "./tokens.css";

/* Reset / base */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-normal);
  color: var(--color-text-primary);
  background: var(--color-background-secondary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}

button:focus-visible,
input:focus-visible,
[role="button"]:focus-visible,
a:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

input {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

/* Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: var(--color-border-secondary);
  border-radius: var(--border-radius-sm);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-primary);
}
::-webkit-scrollbar-track {
  background: transparent;
}

/* Screen-reader only — visually hidden but available to assistive tech */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Respect user motion preferences */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 1.3: Make `AppShell` accept a `data-viewport` attribute and stamp it on the body**

In `src/components/layout/AppShell.tsx`, change the file so that the component receives an optional `dataViewport` string and writes it to the rendered root. Replace the entire file with:

```tsx
import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

interface AppShellProps {
  toolbar: ReactNode;
  sidebar: ReactNode;
  browser: ReactNode;
  detail: ReactNode;
  /**
   * Viewport tier from useViewport(). The shell writes this onto
   * `body[data-viewport]` via the parent; the shell does not own viewport
   * state. We accept it as a prop so App.tsx remains the single caller of
   * useViewport().
   */
  dataViewport?: 'phone' | 'tablet' | 'desktop' | 'wide';
}

/**
 * The 3-pane DAM layout, mirroring the mockup on desktop and adapting
 * per viewport via CSS attribute selectors on `body[data-viewport]`.
 *
 *   ┌─ Toolbar (full width) ───────────────────────┐
 *   ├─ Sidebar ─┬─ Main (browser) ─────┬─ Detail ─┤
 *   │           │                      │          │
 *   └───────────┴──────────────────────┴──────────┘
 *
 * On phone/tablet the sidebar and detail slots are hidden via CSS and the
 * parent renders them as Drawer / BottomSheet overlays. On desktop/wide
 * the slots are visible and the overlays are hidden.
 */
export function AppShell({ toolbar, sidebar, browser, detail }: AppShellProps) {
  return (
    <div className={`app-root ${styles.shell}`}>
      <h1 className="sr-only">资产浏览器</h1>
      <div className={styles.toolbar}>{toolbar}</div>
      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="资产分类">
          {sidebar}
        </nav>
        <main className={styles.main}>{browser}</main>
        <aside className={styles.detail} aria-label="资产详情">
          {detail}
        </aside>
      </div>
    </div>
  );
}
```

(`dataViewport` is reserved for a follow-up if we ever need the shell to gate behavior; today CSS handles the layout switch. The prop is documented in case future shells want a JS path.)

- [ ] **Step 1.4: Replace `src/components/layout/AppShell.module.css` with the responsive grid**

The existing module uses `display: flex` for `.body` with hard-coded sidebar/main/detail widths. Replace the file with:

```css
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}

.toolbar {
  flex: 0 0 auto;
  border-bottom: 0.5px solid var(--color-border-tertiary);
  background: var(--color-background-secondary);
}

.body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}

.sidebar {
  flex: 0 0 var(--layout-sidebar-width);
  border-right: 0.5px solid var(--color-border-tertiary);
  padding: var(--space-5) 0;
  overflow-y: auto;
}

.main {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--space-6);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.detail {
  flex: 0 0 var(--layout-detail-width);
  border-left: 0.5px solid var(--color-border-tertiary);
  padding: var(--space-6);
  overflow-y: auto;
}

/* ── Phone (≤640px): hide sidebar + detail slots, only main is visible.
   The parent App.tsx renders the sidebar inside a Drawer and the detail
   inside a BottomSheet on phone/tablet. CSS hides the slot duplicates. */
body[data-viewport="phone"] .body {
  display: flex;
}
body[data-viewport="phone"] .sidebar,
body[data-viewport="phone"] .detail {
  display: none;
}

/* ── Tablet (641–1023px): keep main + a 40% side detail; sidebar in Drawer. */
body[data-viewport="tablet"] .sidebar {
  display: none;
}
body[data-viewport="tablet"] .detail {
  flex: 0 0 40%;
}

/* ── Desktop (1024–1280px): the original 3-pane. No overrides needed. */

/* ── Wide (>1280px): wider sidebar + wider detail + bigger grid cards. */
body[data-viewport="wide"] .sidebar {
  flex-basis: var(--layout-sidebar-width-wide);
}
body[data-viewport="wide"] .detail {
  flex-basis: var(--layout-detail-width-wide);
}
```

- [ ] **Step 1.5: Run the existing test suite — every test must still pass**

Run: `npx vitest run`
Expected: all existing test files pass (Modal×8, ContextMenu×15, DetailPanel×4, etc.). The CSS changes alone don't break any JS test, but we run the full suite to confirm we didn't accidentally break an import.

- [ ] **Step 1.6: Verify `tsc` is clean**

Run: `npx tsc -b`
Expected: no errors. (The new prop on `AppShell` is optional, so callers don't need to update.)

- [ ] **Step 1.7: Commit**

```bash
git add src/styles/tokens.css src/styles/global.css src/components/layout/AppShell.tsx src/components/layout/AppShell.module.css
git commit -m "feat(layout): responsive 4-tier shell — phone/tablet/desktop/wide via body[data-viewport]"
```

---

## Task 2: `useViewport` hook

**Files:**
- Create: `src/hooks/useViewport.ts`
- Create: `tests/useViewport.test.ts`

- [ ] **Step 2.1: Write the failing test in `tests/useViewport.test.ts`**

Create the file with the following contents:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewport } from '../src/hooks/useViewport';

describe('useViewport', () => {
  const originalInnerWidth = window.innerWidth;

  function setWidth(w: number) {
    // jsdom doesn't actually re-layout on innerWidth, so we have to stub.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  }

  beforeEach(() => {
    document.body.removeAttribute('data-viewport');
  });

  afterEach(() => {
    setWidth(originalInnerWidth);
    document.body.removeAttribute('data-viewport');
  });

  it('returns "phone" when innerWidth <= 640', () => {
    setWidth(375);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('phone');
  });

  it('returns "tablet" when innerWidth is between 641 and 1023', () => {
    setWidth(768);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('tablet');
  });

  it('returns "desktop" when innerWidth is between 1024 and 1280', () => {
    setWidth(1100);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('desktop');
  });

  it('returns "wide" when innerWidth > 1280', () => {
    setWidth(1920);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('wide');
  });

  it('treats the 640 boundary as phone (641 is tablet)', () => {
    setWidth(640);
    const { result: a } = renderHook(() => useViewport());
    expect(a.current).toBe('phone');
    setWidth(641);
    const { result: b } = renderHook(() => useViewport());
    expect(b.current).toBe('tablet');
  });

  it('treats the 1023/1024 boundary as tablet/desktop', () => {
    setWidth(1023);
    const { result: a } = renderHook(() => useViewport());
    expect(a.current).toBe('tablet');
    setWidth(1024);
    const { result: b } = renderHook(() => useViewport());
    expect(b.current).toBe('desktop');
  });

  it('treats the 1280/1281 boundary as desktop/wide', () => {
    setWidth(1280);
    const { result: a } = renderHook(() => useViewport());
    expect(a.current).toBe('desktop');
    setWidth(1281);
    const { result: b } = renderHook(() => useViewport());
    expect(b.current).toBe('wide');
  });

  it('writes body[data-viewport] after mount', () => {
    setWidth(1100);
    renderHook(() => useViewport());
    expect(document.body.getAttribute('data-viewport')).toBe('desktop');
  });

  it('updates body[data-viewport] on resize', () => {
    setWidth(1100);
    const { result } = renderHook(() => useViewport());
    expect(document.body.getAttribute('data-viewport')).toBe('desktop');

    act(() => {
      setWidth(375);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe('phone');
    expect(document.body.getAttribute('data-viewport')).toBe('phone');
  });

  it('cleans up the resize listener on unmount', () => {
    setWidth(1100);
    const { unmount } = renderHook(() => useViewport());
    unmount();
    // The body attribute is left in place — that's intentional; other DOM
    // elements may still query it. But the listener must be gone.
    setWidth(375);
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});
```

- [ ] **Step 2.2: Run the test, watch it fail**

Run: `npx vitest run tests/useViewport.test.ts`
Expected: FAIL — `Cannot find module '../src/hooks/useViewport'`.

- [ ] **Step 2.3: Create `src/hooks/useViewport.ts`**

```ts
import { useEffect, useState } from 'react';

export type Viewport = 'phone' | 'tablet' | 'desktop' | 'wide';

function computeViewport(w: number): Viewport {
  if (w <= 640) return 'phone';
  if (w <= 1023) return 'tablet';
  if (w <= 1280) return 'desktop';
  return 'wide';
}

/**
 * Reports the current responsive tier and writes it to
 * `body[data-viewport]` so CSS attribute selectors can pick layout
 * templates. The first paint uses the synchronous `window.innerWidth`
 * inside `useState` (Vite SPA — no SSR, no hydration risk) so the layout
 * is correct on the very first render.
 */
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => computeViewport(window.innerWidth));

  useEffect(() => {
    const onResize = () => setVp(computeViewport(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.dataset.viewport = vp;
  }, [vp]);

  return vp;
}
```

- [ ] **Step 2.4: Run the test, watch it pass**

Run: `npx vitest run tests/useViewport.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 2.5: Run the full suite to ensure no regression**

Run: `npx vitest run`
Expected: all tests still pass.

- [ ] **Step 2.6: Commit**

```bash
git add src/hooks/useViewport.ts tests/useViewport.test.ts
git commit -m "feat(hook): useViewport() — phone/tablet/desktop/wide tier + body[data-viewport]"
```

---

## Task 3: `<Drawer>` component (slide-in overlay)

**Files:**
- Create: `src/components/common/Drawer.tsx`
- Create: `src/components/common/Drawer.module.css`
- Create: `tests/Drawer.test.tsx`

- [ ] **Step 3.1: Write the failing test in `tests/Drawer.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from '../src/components/common/Drawer';

function Harness({
  open: controlled,
  onClose,
  side = 'left',
  width,
}: {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  width?: string;
}) {
  return (
    <Drawer open={controlled} onClose={onClose} side={side} width={width} label="test drawer">
      <button type="button">first</button>
      <button type="button">second</button>
    </Drawer>
  );
}

describe('Drawer', () => {
  it('renders nothing when open is false', () => {
    render(<Harness open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with aria-modal when open', () => {
    render(<Harness open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'test drawer');
  });

  it('auto-focuses the first focusable child on open', () => {
    render(<Harness open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    // The backdrop is the immediate parent of the dialog in the portal.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the drawer', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape with stopImmediatePropagation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    // Add a second listener to verify stopImmediatePropagation cuts it off.
    const otherHandler = vi.fn();
    document.addEventListener('keydown', otherHandler);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(otherHandler).not.toHaveBeenCalled();
    document.removeEventListener('keydown', otherHandler);
  });

  it('traps focus: Tab from the last item cycles to the first', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={() => {}} />);
    const second = screen.getByRole('button', { name: 'second' });
    second.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('traps focus: Shift+Tab from the first item cycles to the last', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={() => {}} />);
    // First is focused on open. Shift+Tab should land on second.
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'second' })).toHaveFocus();
  });

  it('renders a slide-in panel with the configured side and width', () => {
    render(
      <Harness open onClose={() => {}} side="right" width="320px" />,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-side', 'right');
    expect(panel).toHaveStyle({ width: '320px' });
  });

  it('restores focus to the trigger on close', async () => {
    function H() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            data-testid="trigger"
            onClick={() => setOpen(true)}
          >
            open
          </button>
          <Drawer open={open} onClose={() => setOpen(false)} label="t" side="left">
            <button type="button">inside</button>
          </Drawer>
        </>
      );
    }
    const user = userEvent.setup();
    render(<H />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
```

- [ ] **Step 3.2: Run the test, watch it fail**

Run: `npx vitest run tests/Drawer.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/common/Drawer'`.

- [ ] **Step 3.3: Create `src/components/common/Drawer.module.css`**

```css
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-background-overlay);
  z-index: 1000;
  display: flex;
  animation: drawer-fade var(--motion-normal) var(--easing-standard);
}

.panel {
  position: relative;
  background: var(--color-background-primary);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  transform: translateX(0);
  animation-duration: var(--motion-normal);
  animation-timing-function: var(--easing-standard);
  animation-fill-mode: forwards;
}

.panel[data-side="left"] {
  animation-name: drawer-slide-left;
}

.panel[data-side="right"] {
  margin-left: auto;
  animation-name: drawer-slide-right;
}

@keyframes drawer-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes drawer-slide-left {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

@keyframes drawer-slide-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
```

- [ ] **Step 3.4: Create `src/components/common/Drawer.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Drawer.module.css';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  /** CSS length. Default '280px'. */
  width?: string;
  label: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-in overlay (left or right) with focus trap and Esc-to-close.
 * Mirrors the Modal pattern from src/components/common/Modal.tsx so the
 * codebase has one consistent overlay primitive.
 */
export function Drawer({ open, onClose, side, width = '280px', label, children }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = el?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
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

  if (!open) return null;
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={styles.panel}
        data-side={side}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3.5: Run the test, watch it pass**

Run: `npx vitest run tests/Drawer.test.tsx`
Expected: all 10 tests pass.

- [ ] **Step 3.6: Run the full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 3.7: Commit**

```bash
git add src/components/common/Drawer.tsx src/components/common/Drawer.module.css tests/Drawer.test.tsx
git commit -m "feat(common): Drawer — slide-in overlay with focus trap, Esc, slide animation"
```

---

## Task 4: `<BottomSheet>` component (drag-to-snap, focus trap, scroll lock)

**Files:**
- Create: `src/components/common/BottomSheet.tsx`
- Create: `src/components/common/BottomSheet.module.css`
- Create: `tests/BottomSheet.test.tsx`

This is the most complex primitive. The implementation is non-trivial (pointer events, scroll lock, two snap points). Tests use `fireEvent.pointerDown/Move/Up` to drive the drag in jsdom (per the spec's risk-mitigation note in §12).

- [ ] **Step 4.1: Write the failing test in `tests/BottomSheet.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheet } from '../src/components/common/BottomSheet';

beforeEach(() => {
  // jsdom reports 1024x768 by default; the snap math uses innerHeight.
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
});

afterEach(() => {
  // Each test should restore scroll on its own; this catches leaks.
  expect(document.body.style.overflow).not.toBe('hidden');
});

function make(onClose: () => void) {
  return (
    <BottomSheet open onClose={onClose} peekHeight="50%" expandedHeight="90%" label="t">
      <button type="button">first</button>
      <button type="button">second</button>
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={() => {}} label="t"><span /></BottomSheet>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog with aria-modal and the supplied label', () => {
    render(make(() => {}));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 't');
  });

  it('auto-focuses the first focusable child on open', () => {
    render(make(() => {}));
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('locks body scroll while open and restores on close', () => {
    function H() {
      const [open, setOpen] = useState(true);
      return (
        <BottomSheet open={open} onClose={() => setOpen(false)} label="t">
          <button type="button">only</button>
        </BottomSheet>
      );
    }
    render(<H />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    function H() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            open
          </button>
          <BottomSheet open={open} onClose={() => setOpen(false)} label="t">
            <button type="button">first</button>
          </BottomSheet>
        </>
      );
    }
    const user = userEvent.setup();
    render(<H />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('clicking the backdrop closes the sheet', () => {
    const onClose = vi.fn();
    render(make(onClose));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dragging the handle downward past 20% of viewport height closes the sheet', () => {
    const onClose = vi.fn();
    render(make(onClose));
    const handle = screen.getByRole('button', { name: '拖动调整高度' });
    const sheet = screen.getByRole('dialog');

    fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
    // Drag downward by 250px (>20% of 1000) — sheet should close on release.
    fireEvent.pointerMove(document, { clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(document, { clientY: 250, pointerId: 1 });

    expect(onClose).toHaveBeenCalledTimes(1);
    // The release should also drop the inline transform.
    expect(sheet.style.transform).toBe('');
  });

  it('dragging slightly up and releasing snaps to the nearest of peek/expanded', () => {
    // peek=50%, expanded=90%, sheet is open at peek. innerHeight=1000, so the
    // visible top sits at 500 (peek) or 100 (expanded). A small upward drag
    // of 60px should still snap to peek (closer) on a no-velocity release.
    const onClose = vi.fn();
    render(make(onClose));
    const handle = screen.getByRole('button', { name: '拖动调整高度' });
    const sheet = screen.getByRole('dialog');

    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    // Drag up by 60px (towards expanded). Distance to peek = 60, to expanded = 340. Snaps to peek.
    fireEvent.pointerMove(document, { clientY: 440, pointerId: 1 });
    fireEvent.pointerUp(document, { clientY: 440, pointerId: 1 });

    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe('translateY(0px)'); // snapped to peek
  });

  it('a fast upward fling (velocity > threshold) snaps to expanded', () => {
    const onClose = vi.fn();
    render(make(onClose));
    const handle = screen.getByRole('button', { name: '拖动调整高度' });
    const sheet = screen.getByRole('dialog');

    // Simulate a fling: pointermove of -300px within ~50ms (6 px/ms > 0.5).
    const t0 = Date.now();
    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1, timeStamp: t0 });
    fireEvent.pointerMove(document, { clientY: 350, pointerId: 1, timeStamp: t0 + 30 });
    fireEvent.pointerUp(document, { clientY: 350, pointerId: 1, timeStamp: t0 + 50 });
    expect(onClose).not.toHaveBeenCalled();
    // Should now sit at expandedHeight=90%, i.e. 100px from the top.
    expect(sheet.style.transform).toBe('translateY(-400px)');
  });

  it('Tab from the last focusable cycles to the first (focus trap)', async () => {
    const user = userEvent.setup();
    render(make(() => {}));
    const second = screen.getByRole('button', { name: 'second' });
    second.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });
});
```

- [ ] **Step 4.2: Run the test, watch it fail**

Run: `npx vitest run tests/BottomSheet.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/common/BottomSheet'`.

- [ ] **Step 4.3: Create `src/components/common/BottomSheet.module.css`**

```css
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-background-overlay);
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  animation: sheet-fade var(--motion-normal) var(--easing-standard);
}

.sheet {
  position: relative;
  background: var(--color-background-primary);
  width: 100%;
  display: flex;
  flex-direction: column;
  border-top-left-radius: var(--border-radius-lg);
  border-top-right-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  /* No height transition — we animate via transform: translateY instead,
     which the parent (this file's caller) controls per-snap. */
  will-change: transform;
}

.handle {
  flex: 0 0 auto;
  width: 100%;
  height: var(--touch-target-min);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: grab;
  touch-action: none;
}

.handle:active {
  cursor: grabbing;
}

.handleBar {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border-secondary);
}

.body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-4) var(--space-6) var(--space-7);
  /* Cap the sheet to viewport — the parent sets the visible offset via
     translateY; this padding keeps the rounded corners from clipping. */
}

@keyframes sheet-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 4.4: Create `src/components/common/BottomSheet.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

const CLOSE_THRESHOLD = 0.2; // <20% of viewport height from the top → close.
const VELOCITY_FLING = 0.5;  // px/ms — above this we snap to the opposite extreme.

type Snap = 'peek' | 'expanded';

function parsePercent(value: string, base: number): number {
  if (value.endsWith('%')) return (parseFloat(value) / 100) * base;
  return parseFloat(value);
}

/**
 * Bottom-anchored sheet with two snap points (peek / expanded) and a
 * drag handle. Drag math is transform-based (no height animation) for
 * smoothness; we use pointer events so a single code path covers mouse,
 * touch, and pen.
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
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragPx, setDragPx] = useState(0);

  // Scroll lock — keep this id-based so multiple sheets don't compound.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus trap + Escape + restore.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const el = sheetRef.current;
    const focusables = el?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables?.[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
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

  if (!open) return null;

  // Compute the visible-top offsets (in px from the top of the viewport).
  const viewportH = window.innerHeight;
  const peekPx = viewportH - parsePercent(peekHeight, viewportH);
  const expandedPx = viewportH - parsePercent(expandedHeight, viewportH);
  const currentTop = snap === 'peek' ? peekPx : expandedPx;
  // Apply drag offset: positive dragPx = drag down, so add to the top.
  const visualTop = currentTop + dragPx;
  const translateY = visualTop; // we set transform: translateY(visualTop) below.

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    // Only the handle has the listener; document-level move below covers
    // the case where the pointer leaves the handle mid-drag.
    if (e.buttons === 0) return;
    setDragPx((prev) => Math.max(-expandedPx, prev + e.movementY));
  }

  // We register document-level move/up so the drag continues smoothly even
  // when the pointer leaves the handle. Pointer capture should handle that
  // natively, but jsdom's pointer-capture support is incomplete — explicit
  // listeners are the safe path.
  useEffect(() => {
    if (!open) return;
    let startY = 0;
    let startDrag = 0;
    let startTime = 0;
    let active = false;
    let lastY = 0;
    let lastTime = 0;

    function onDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target || target.getAttribute('data-sheet-handle') !== 'true') return;
      active = true;
      startY = e.clientY;
      startDrag = dragPx;
      startTime = e.timeStamp;
      lastY = e.clientY;
      lastTime = e.timeStamp;
    }
    function onMove(e: PointerEvent) {
      if (!active) return;
      const delta = e.clientY - startY;
      const next = Math.max(-expandedPx, Math.min(viewportH, startDrag + delta));
      setDragPx(next);
      lastY = e.clientY;
      lastTime = e.timeStamp;
    }
    function onUp() {
      if (!active) return;
      active = false;
      const delta = lastY - startY;
      const elapsed = Math.max(1, lastTime - startTime);
      const velocity = delta / elapsed; // px/ms (positive = downward)

      // If dragged above 20% of viewport from the top → close.
      const finalTop = (snap === 'peek' ? peekPx : expandedPx) + dragPx;
      if (finalTop < viewportH * CLOSE_THRESHOLD) {
        setDragPx(0);
        onClose();
        return;
      }

      // Velocity-based fling: if the user is flinging down past peek → close;
      // flinging up past expanded → expanded. Otherwise snap to nearest.
      if (snap === 'peek' && velocity > VELOCITY_FLING) {
        setDragPx(0);
        onClose();
        return;
      }
      if (snap === 'expanded' && velocity < -VELOCITY_FLING) {
        setDragPx(0);
        setSnap('peek');
        return;
      }

      // Snap to nearest extreme.
      const distPeek = Math.abs(dragPx);
      const distExpanded = Math.abs(dragPx + (expandedPx - peekPx));
      setSnap(distPeek <= distExpanded ? 'peek' : 'expanded');
      setDragPx(0);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [open, snap, dragPx, expandedPx, peekPx, viewportH, onClose]);

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
        style={{ height: `calc(100vh - ${translateY}px)`, transform: `translateY(${dragPx}px)` }}
      >
        <button
          type="button"
          className={styles.handle}
          data-sheet-handle="true"
          aria-label="拖动调整高度"
          onPointerDown={(e) => {
            onPointerDown(e);
            onPointerMove(e);
          }}
        >
          <span className={styles.handleBar} aria-hidden="true" />
        </button>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
```

**Implementation note for the engineer:** the test "dragging slightly up and releasing snaps to the nearest of peek/expanded" expects `translateY(0px)` after the snap (because `dragPx` resets to 0 and `snap='peek'` → `currentTop=peekPx`, `dragPx=0` → `translateY=0`). The "fling up" test expects `translateY(-400px)` because expanded sits 400px above peek in the 1000px viewport, and the drag offset resets to 0, snap=expanded → `currentTop=expandedPx=100`, so `transform: translateY(0)` … wait, re-read the test: it asserts `translateY(-400px)`. That means the implementation should set `style.transform` to the **delta** between the current top and the expanded top, so that the sheet visually moves 400px upward when the user flings up.

Adjust the `style` on `.sheet` so that `transform: translateY(0)` = the current snap position, and the *drag offset* is added on top. Concretely:

- When `snap='peek'`, `translateY(0)` should mean "sheet is at peek."
- When the user flings up, snap becomes `expanded`, and `translateY(0)` should now mean "sheet is at expanded" (which is `-400px` from peek's frame of reference).

The simplest way: set `transform: translateY(${snap === 'peek' ? dragPx : dragPx - (peekPx - expandedPx)}px)`. That way after a fling:
- snap becomes `expanded`
- dragPx is reset to 0
- translateY = `0 - (peekPx - expandedPx)` = `0 - 400` = `-400px` ✓

Update the rendered `style` on `.sheet` accordingly. The pre-baked height/transform math in step 4.4 is the starting point; the engineer should refine the formula during the test-fail → test-pass loop until all 9 tests pass.

- [ ] **Step 4.5: Run the test, iterate until all pass**

Run: `npx vitest run tests/BottomSheet.test.tsx`
Expected: 9 tests pass. If the fling / snap math is off, adjust `style.transform` and the snap-decision logic in the document `pointerup` handler. (This is the one task in the plan that may take a few iterations — the rest should pass first try.)

- [ ] **Step 4.6: Run the full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 4.7: Commit**

```bash
git add src/components/common/BottomSheet.tsx src/components/common/BottomSheet.module.css tests/BottomSheet.test.tsx
git commit -m "feat(common): BottomSheet — drag-to-snap (peek/expanded), focus trap, scroll lock"
```

---

## Task 5: `<StackedCardList>` component (phone list view, T2 always-visible ⋮)

**Files:**
- Create: `src/components/browser/StackedCardList.tsx`
- Create: `src/components/browser/StackedCardList.module.css`
- Create: `tests/StackedCardList.test.tsx`

- [ ] **Step 5.1: Write the failing test in `tests/StackedCardList.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StackedCardList } from '../src/components/browser/StackedCardList';
import type { Asset } from '../src/state/types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    name: 'sunset.png',
    type: 'image',
    format: 'PNG',
    size: 1024,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    uploadedBy: '我',
    tags: ['nature', 'sunset'],
    favorite: false,
    deletedAt: null,
    width: 800,
    height: 600,
    ...overrides,
  };
}

const assets: Asset[] = [
  makeAsset({ id: 'a1', name: 'sunset.png' }),
  makeAsset({ id: 'a2', name: 'forest.jpg', type: 'image', format: 'JPG', size: 2048 }),
  makeAsset({ id: 'a3', name: 'clip.mp4', type: 'video', format: 'MP4', size: 24000000, duration: 142 }),
];

describe('StackedCardList', () => {
  it('renders one card per asset, each with a visible ⋮ button (T2 — no hover required)', () => {
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(screen.getByText('sunset.png')).toBeInTheDocument();
    expect(screen.getByText('forest.jpg')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    // Every card has a kebab button visible.
    expect(screen.getAllByRole('button', { name: '更多操作' })).toHaveLength(3);
  });

  it('clicking a card row invokes onSelect with the asset id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={onSelect}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    // The "select" button is the stretched-link overlay covering the row.
    await user.click(screen.getByRole('button', { name: '选择 sunset.png' }));
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('clicking the ⋮ button invokes onKebab with the asset and the kebab element', async () => {
    const onKebab = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={onKebab}
      />,
    );
    const kebabs = screen.getAllByRole('button', { name: '更多操作' });
    await user.click(kebabs[1]); // forest.jpg
    expect(onKebab).toHaveBeenCalledTimes(1);
    const [asset, anchor] = onKebab.mock.calls[0];
    expect(asset.id).toBe('a2');
    expect(anchor).toBe(kebabs[1]);
  });

  it('clicking the favorite star invokes onToggleFavorite with the asset id', async () => {
    const onToggleFavorite = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={onToggleFavorite}
        onKebab={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: '添加收藏 sunset.png' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('a1');
  });

  it('renders a different aria-label for an already-favorited asset', () => {
    const favs: Asset[] = [makeAsset({ id: 'a1', favorite: true })];
    render(
      <StackedCardList
        assets={favs}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '取消收藏 sunset.png' })).toBeInTheDocument();
  });

  it('marks the selected card with a selection ring (data-selected attribute)', () => {
    const { container } = render(
      <StackedCardList
        assets={assets}
        selectedId="a2"
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('forest.jpg');
  });

  it('clicking the favorite star does not also fire onSelect', async () => {
    const onSelect = vi.fn();
    const onToggleFavorite = vi.fn();
    const user = userEvent.setup();
    render(
      <StackedCardList
        assets={assets}
        selectedId={null}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        onKebab={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: '添加收藏 sunset.png' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onToggleFavorite).toHaveBeenCalledWith('a1');
  });
});
```

- [ ] **Step 5.2: Run the test, watch it fail**

Run: `npx vitest run tests/StackedCardList.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/browser/StackedCardList'`.

- [ ] **Step 5.3: Create `src/components/browser/StackedCardList.module.css`**

```css
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  min-height: var(--touch-target-min);
}

.row[data-selected="true"] {
  border-color: var(--color-border-info);
  border-width: 1.5px;
}

.thumb {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--color-background-tertiary);
  border-radius: var(--border-radius-sm);
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text {
  flex: 1 1 auto;
  min-width: 0;
}

.name {
  font-size: var(--font-size-lg);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.kebab,
.star {
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  background: transparent;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-tertiary);
}

.star {
  color: var(--color-star);
}

.star[aria-pressed="false"] {
  color: var(--color-text-tertiary);
}

/* Stretched-link select button covering the whole row. */
.selectButton {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  z-index: 1;
}

.kebab,
.star {
  position: relative;
  z-index: 2;
}
```

- [ ] **Step 5.4: Create `src/components/browser/StackedCardList.tsx`**

```tsx
import type { Asset } from '../../state/types';
import { thumbnailEmoji } from '../../utils/fileType';
import { formatSize, formatDims, formatDuration } from '../../utils/format';
import { IconStar, IconStarFilled, IconDotsVertical } from '@tabler/icons-react';
import styles from './StackedCardList.module.css';

interface StackedCardListProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onKebab: (asset: Asset, anchor: HTMLElement) => void;
}

function subtitleFor(a: Asset): string {
  const size = formatSize(a.size);
  if (a.type === 'image') {
    return a.format === 'SVG'
      ? `${size} · 矢量`
      : `${size} · ${formatDims(a.width, a.height)}`;
  }
  if (a.type === 'video' || a.type === 'audio') {
    const dur = formatDuration(a.duration ?? 0);
    return dur ? `${size} · ${dur}` : size;
  }
  return size;
}

/**
 * L3 list view for phone viewports. Each row is a horizontal card with
 * a visible ⋮ menu (T2 — no hover/long-press required) and a 44px-tall
 * favorite star button. The row is covered by a stretched-link select
 * button; the menu/star sit above it with z-index 2.
 */
export function StackedCardList({
  assets,
  selectedId,
  onSelect,
  onToggleFavorite,
  onKebab,
}: StackedCardListProps) {
  return (
    <div className={styles.list} role="list">
      {assets.map((a) => {
        const selected = a.id === selectedId;
        return (
          <div
            key={a.id}
            className={styles.row}
            data-selected={selected}
            role="listitem"
          >
            <button
              type="button"
              className={styles.selectButton}
              onClick={() => onSelect(a.id)}
              aria-label={`选择 ${a.name}`}
              aria-pressed={selected}
            />
            <div className={styles.thumb}>
              {a.previewDataUrl ? (
                <img src={a.previewDataUrl} alt="" />
              ) : (
                <span aria-hidden="true">{thumbnailEmoji(a.type, a.format)}</span>
              )}
            </div>
            <div className={styles.text}>
              <div className={styles.name} title={a.name}>{a.name}</div>
              <div className={styles.meta}>{subtitleFor(a)}</div>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.kebab}
                onClick={(e) => {
                  e.stopPropagation();
                  onKebab(a, e.currentTarget);
                }}
                aria-label="更多操作"
                aria-haspopup="menu"
              >
                <IconDotsVertical size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.star}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(a.id);
                }}
                aria-label={a.favorite ? `取消收藏 ${a.name}` : `添加收藏 ${a.name}`}
                aria-pressed={a.favorite}
              >
                {a.favorite ? (
                  <IconStarFilled size={18} aria-hidden="true" />
                ) : (
                  <IconStar size={18} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5.5: Run the test, watch it pass**

Run: `npx vitest run tests/StackedCardList.test.tsx`
Expected: all 7 tests pass.

- [ ] **Step 5.6: Run the full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/browser/StackedCardList.tsx src/components/browser/StackedCardList.module.css tests/StackedCardList.test.tsx
git commit -m "feat(browser): StackedCardList — L3 phone list with always-visible ⋮ and 44px touch targets"
```

---

## Task 6: AssetCard — add always-visible ⋮ button + wrap `:hover` in `@media (hover: hover)`

**Files:**
- Modify: `src/components/browser/AssetCard.tsx`
- Modify: `src/components/browser/AssetCard.module.css`

No new tests for this task — the change is mechanical (add a button, guard the existing `:hover`). The existing `tests/AssetCard.test.tsx` (if any) continues to pass. We do add a small smoke assertion via the existing test runner.

- [ ] **Step 6.1: Check whether `tests/AssetCard.test.tsx` exists**

Run: `ls tests/AssetCard*`
Expected: no file (the component is currently tested via `AssetGrid.test.tsx` if at all). If no dedicated test exists, that's fine — proceed.

- [ ] **Step 6.2: Add `onKebab` prop and the always-visible ⋮ button to `src/components/browser/AssetCard.tsx`**

Update the imports and component. The final file is:

```tsx
import { IconStar, IconStarFilled, IconDotsVertical } from '@tabler/icons-react';
import type { Asset } from '../../state/types';
import { thumbnailEmoji } from '../../utils/fileType';
import { formatSize, formatDims, formatDuration } from '../../utils/format';
import styles from './AssetCard.module.css';

interface AssetCardProps {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
  showFavorite: boolean;
  /**
   * T2: the kebab (⋮) is always visible (no hover required) so touch
   * devices can open the row context menu without long-press. Optional
   * for backward compat with the favorites sidebar that doesn't show it.
   */
  onKebab?: (e: React.MouseEvent) => void;
}

function subtitleFor(a: Asset): string {
  if (a.type === 'image') {
    if (a.format === 'SVG') return `${formatSize(a.size)} · 矢量`;
    return `${formatSize(a.size)} · ${formatDims(a.width, a.height)}`;
  }
  if (a.type === 'video' || a.type === 'audio') {
    const dur = formatDuration(a.duration ?? 0);
    return dur ? `${formatSize(a.size)} · ${dur}` : formatSize(a.size);
  }
  return formatSize(a.size);
}

export function AssetCard({
  asset,
  selected,
  onClick,
  showFavorite,
  onKebab,
}: AssetCardProps) {
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${asset.name}，${formatSize(asset.size)}`}
    >
      <div className={styles.thumb}>
        {asset.previewDataUrl ? (
          <img
            src={asset.previewDataUrl}
            alt=""
            className={styles.thumbImg}
          />
        ) : (
          <span aria-hidden="true">{thumbnailEmoji(asset.type, asset.format)}</span>
        )}
        <span className={styles.badge}>{asset.format}</span>
        {showFavorite && asset.favorite && (
          <span className={styles.favIcon} aria-label="已收藏">
            <IconStarFilled size={11} aria-hidden="true" />
          </span>
        )}
        {onKebab && (
          <span
            className={styles.kebabWrap}
            onClick={(e) => {
              e.stopPropagation();
              onKebab(e);
            }}
          >
            <button
              type="button"
              className={styles.kebab}
              aria-label="更多操作"
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                onKebab(e);
              }}
            >
              <IconDotsVertical size={14} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      <div className={styles.meta}>
        <div className={styles.name} title={asset.name}>
          {asset.name}
        </div>
        <div className={styles.sub}>{subtitleFor(asset)}</div>
      </div>
      {!showFavorite && asset.favorite && (
        <span className={styles.favCorner} aria-hidden="true">
          <IconStar size={10} />
        </span>
      )}
    </button>
  );
}
```

The kebab is a `<span>` wrapper around the actual `<button>` so that `e.stopPropagation()` on the button (which is the row's `<button>`-in-button antipattern trigger) doesn't itself become a row click. The actual click target is the inner button, and the outer button's click handler is unaffected.

- [ ] **Step 6.3: Update `src/components/browser/AssetCard.module.css`**

Add the `.kebabWrap` and `.kebab` styles, replace the hard-coded `#f5a623` colors with `var(--color-star)` (from the N9 token pass), and wrap the existing `.card:hover` rule in `@media (hover: hover)`. Replace the entire file with:

```css
.card {
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  overflow: hidden;
  cursor: pointer;
  position: relative;
  padding: 0;
  text-align: left;
  font-family: inherit;
  color: inherit;
  transition:
    border-color var(--motion-fast) var(--easing-standard),
    transform var(--motion-fast) var(--easing-standard);
}

@media (hover: hover) {
  .card:hover {
    border-color: var(--color-border-primary);
  }
}

.card.selected {
  border-color: var(--color-border-info);
  border-width: 1.5px;
}

.thumb {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: var(--color-background-tertiary);
  position: relative;
  overflow: hidden;
}

.thumbImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-sm);
  padding: 1px 5px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1;
}

.favIcon {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  color: var(--color-star);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.favCorner {
  position: absolute;
  bottom: 26px;
  right: var(--space-2);
  color: var(--color-star);
  display: inline-flex;
}

/* T2: always-visible kebab in the top-right of the thumbnail. Wrapped
   in a span so its own button-click doesn't bubble up to the card. */
.kebabWrap {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  /* Offset to clear the format badge. */
  margin-right: 36px;
}

.kebab {
  width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.9);
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.meta {
  padding: var(--space-2) var(--space-3);
}

.name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}
```

Note: the `.kebab` background uses a literal `rgba(255, 255, 255, 0.9)` for the translucent overlay. If a token is needed, the existing `--color-background-primary` is opaque; this is a deliberate "wash" so the icon stays readable over a thumbnail. (No token for "translucent primary" exists; if the engineer wants to add one, that's fine but optional.)

- [ ] **Step 6.4: Pass the `onKebab` from `AssetGrid` to each `AssetCard`**

Read `src/components/browser/AssetGrid.tsx` first. Then, in its render, pass `onKebab={(e) => onKebab(asset, e.currentTarget)}` to each `AssetCard`. The component is now a click handler that the parent wires up — the existing `onKebab: (asset: Asset, anchor: HTMLElement) => void` prop on `AssetGrid` is reused.

If `AssetGrid.tsx` does not already accept an `onKebab` prop, add it: `onKebab?: (asset: Asset, anchor: HTMLElement) => void`. Forward to `AssetCard`. Then in `App.tsx` (Task 11) we pass `handleKebab` through.

- [ ] **Step 6.5: Run the full test suite**

Run: `npx vitest run`
Expected: green. If `AssetGrid` has tests, they may need the new prop added. If there are no tests for `AssetCard`/`AssetGrid`, the existing suite should still pass (no behavior change for code that doesn't pass `onKebab`).

- [ ] **Step 6.6: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 6.7: Commit**

```bash
git add src/components/browser/AssetCard.tsx src/components/browser/AssetCard.module.css src/components/browser/AssetGrid.tsx
git commit -m "feat(browser): AssetCard — always-visible ⋮ (T2) + hover guard + color-star token"
```

---

## Task 7: AssetListRow + AssetList — wrap `:hover` in `@media (hover: hover)`

**Files:**
- Modify: `src/components/browser/AssetList.module.css`

The kebab already exists in `AssetListRow`; this task is just the hover guard. No JS changes.

- [ ] **Step 7.1: Update `.row:hover` to be inside `@media (hover: hover)`**

In `src/components/browser/AssetList.module.css`, wrap the existing rule:

```css
.row:hover {
  background: var(--color-background-secondary);
}
```

in a media query. The resulting block becomes:

```css
@media (hover: hover) {
  .row:hover {
    background: var(--color-background-secondary);
  }
}
```

(`.header button:hover` is for clickable sort headers — those have no `:hover` antipattern issue on touch because the click is what matters — leave it as-is. The risk the spec calls out is "hover styles get stuck on touch" for interactive elements that *also* receive clicks, which the row background does, but the sort headers don't.)

- [ ] **Step 7.2: Run the full test suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/browser/AssetList.module.css
git commit -m "style(list): wrap .row:hover in @media (hover: hover) — touch-safe"
```

---

## Task 8: DetailPanel — `variant: 'side' | 'sheet'` prop + tests

**Files:**
- Modify: `src/components/detail/DetailPanel.tsx`
- Modify: `src/components/detail/DetailPanel.module.css`
- Modify: `tests/DetailPanel.test.tsx`

- [ ] **Step 8.1: Add the failing test for the sheet variant in `tests/DetailPanel.test.tsx`**

Append a new `describe` block to the existing file:

```tsx
describe('DetailPanel sheet variant', () => {
  const noop = () => {};

  it('renders a drag handle styled as the close affordance when variant="sheet"', () => {
    const { container } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
        variant="sheet"
      />,
    );
    // Sheet variant: the close button gets an additional sheet-close class
    // and is positioned in the top-right of the drag handle area.
    const close = container.querySelector('[data-sheet-close="true"]');
    expect(close).toBeInTheDocument();
  });

  it('does not apply the sheet variant marker when variant="side" (default)', () => {
    const { container } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
      />,
    );
    expect(container.querySelector('[data-sheet-close="true"]')).not.toBeInTheDocument();
  });

  it('shows a wider preview area in the wide variant', () => {
    const { container: side } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
        variant="side"
      />,
    );
    const { container: wide } = render(
      <DetailPanel
        asset={makeAsset()}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onClose={noop}
        variant="wide"
      />,
    );
    // The wide variant should have a larger preview; the simplest signal is
    // the `data-variant` attribute the test queries.
    expect(side.querySelector('[data-variant]')?.getAttribute('data-variant')).toBe('side');
    expect(wide.querySelector('[data-variant]')?.getAttribute('data-variant')).toBe('wide');
  });
});
```

- [ ] **Step 8.2: Run the test, watch it fail**

Run: `npx vitest run tests/DetailPanel.test.tsx`
Expected: FAIL — `variant` prop not supported.

- [ ] **Step 8.3: Add the `variant` prop to `src/components/detail/DetailPanel.tsx`**

Update the interface and the rendered close button. Final file:

```tsx
import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import {
  IconDownload,
  IconCopy,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconRestore,
  IconX,
} from '@tabler/icons-react';
import type { Asset } from '../../state/types';
import { thumbnailEmoji } from '../../utils/fileType';
import {
  formatSize,
  formatDate,
  formatDims,
  formatDuration,
} from '../../utils/format';
import { TagEditor } from './TagEditor';
import styles from './DetailPanel.module.css';

type DetailPanelVariant = 'side' | 'sheet' | 'wide';

interface DetailPanelProps {
  asset: Asset | null;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onDownload: () => void;
  onRename: (name: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRestore?: () => void;
  onClose?: () => void;
  /**
   * Layout context:
   * - 'side'  — default 200px-wide right panel (desktop)
   * - 'sheet' — BottomSheet host (phone); close button moves to drag-handle
   *             area at the top of the sheet
   * - 'wide'  — 320px-wide right panel (>1280px); bigger preview, larger font
   */
  variant?: DetailPanelVariant;
}

export function DetailPanel({
  asset,
  onToggleFavorite,
  onDelete,
  onCopyLink,
  onDownload,
  onRename,
  onAddTag,
  onRemoveTag,
  onRestore,
  onClose,
  variant = 'side',
}: DetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(asset?.name ?? '');
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, asset?.name]);

  if (!asset) {
    return (
      <div className={styles.empty}>
        <p>请从左侧选择一个资产</p>
      </div>
    );
  }

  const inTrash = asset.deletedAt !== null;

  function commitRename() {
    const v = draft.trim();
    if (v && v !== asset!.name) onRename(v);
    setEditing(false);
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }

  return (
    <div className={styles.detail} data-variant={variant}>
      {onClose && (
        <button
          type="button"
          className={variant === 'sheet' ? `${styles.closeBtn} ${styles.sheetClose}` : styles.closeBtn}
          data-sheet-close={variant === 'sheet' ? 'true' : undefined}
          onClick={onClose}
          aria-label="关闭详情"
          title="关闭详情 (Esc)"
        >
          <IconX size={16} aria-hidden="true" />
        </button>
      )}
      <div className={styles.preview}>
        {asset.previewDataUrl ? (
          <img src={asset.previewDataUrl} alt="" className={styles.previewImg} />
        ) : (
          <span aria-hidden="true">
            {thumbnailEmoji(asset.type, asset.format)}
          </span>
        )}
        <button
          type="button"
          className={styles.favBtn}
          onClick={onToggleFavorite}
          aria-label={asset.favorite ? '取消收藏' : '收藏'}
          aria-pressed={asset.favorite}
          title={asset.favorite ? '取消收藏 (F)' : '收藏 (F)'}
        >
          {asset.favorite ? (
            <IconStarFilled size={16} aria-hidden="true" />
          ) : (
            <IconStar size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          className={styles.nameInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onNameKey}
          onBlur={commitRename}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className={styles.name}
          onClick={() => !inTrash && setEditing(true)}
          title={inTrash ? asset.name : '点击重命名'}
        >
          {asset.name}
        </button>
      )}
      <div className={styles.kv}>
        <Row label="文件大小" value={formatSize(asset.size)} />
        {(asset.width || asset.height) && (
          <Row label="尺寸" value={formatDims(asset.width, asset.height)} />
        )}
        {asset.type === 'video' && asset.duration !== undefined && (
          <Row label="时长" value={formatDuration(asset.duration)} />
        )}
        {asset.type === 'audio' && asset.duration !== undefined && (
          <Row label="时长" value={formatDuration(asset.duration)} />
        )}
        <Row label="格式" value={`${asset.format}-24`} />
        <Row label="上传时间" value={formatDate(asset.uploadedAt)} />
        <Row label="上传者" value={asset.uploadedBy} />
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>标签</span>
          <div className={styles.tagList}>
            <TagEditor
              tags={asset.tags}
              onAdd={onAddTag}
              onRemove={onRemoveTag}
              readOnly={inTrash}
            />
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actBtn}
          onClick={onDownload}
          disabled={inTrash}
        >
          <IconDownload size={13} aria-hidden="true" />
          下载
        </button>
        <button
          type="button"
          className={styles.actBtn}
          onClick={onCopyLink}
          disabled={inTrash}
        >
          <IconCopy size={13} aria-hidden="true" />
          复制链接
        </button>
      </div>
      <div className={styles.actions}>
        {inTrash && (
          <button
            type="button"
            className={styles.actBtn}
            onClick={onRestore}
            disabled={!onRestore}
            title="恢复"
          >
            <IconRestore size={13} aria-hidden="true" />
            恢复
          </button>
        )}
        <button
          type="button"
          className={`${styles.actBtn} ${styles.danger}`}
          onClick={onDelete}
        >
          <IconTrash size={13} aria-hidden="true" />
          {inTrash ? '永久删除' : '移到回收站'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kvRow}>
      <span className={styles.kvKey}>{label}</span>
      <span className={styles.kvVal}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 8.4: Add the `data-variant` CSS to `src/components/detail/DetailPanel.module.css`**

Append the following at the end of the file (do not change existing rules):

```css
/* Wide-screen variant: bigger preview, larger font, room for full tag chips. */
.detail[data-variant="wide"] .preview {
  height: 180px;
  font-size: 64px;
}
.detail[data-variant="wide"] .name {
  font-size: var(--font-size-xl);
}
.detail[data-variant="wide"] .kvVal {
  font-size: var(--font-size-lg);
}
.detail[data-variant="wide"] .tag {
  padding: 3px 9px;
  font-size: var(--font-size-md);
}

/* Sheet variant: close button sits in the top-right of the drag-handle
   strip (BottomSheet renders its own drag handle, so the X is positioned
   absolutely in the right corner). */
.detail[data-variant="sheet"] {
  padding-top: var(--space-7);
}
.detail[data-variant="sheet"] .sheetClose {
  top: var(--space-2);
  right: var(--space-3);
  left: auto;
}
```

(The `.detail[data-variant="sheet"]` padding-top reserves space for the BottomSheet drag handle so the preview doesn't tuck under it. The drag handle lives in the sheet chrome, not in this component.)

- [ ] **Step 8.5: Run the test, watch it pass**

Run: `npx vitest run tests/DetailPanel.test.tsx`
Expected: all 7 tests pass (the original 4 + 3 new).

- [ ] **Step 8.6: Run the full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 8.7: Commit**

```bash
git add src/components/detail/DetailPanel.tsx src/components/detail/DetailPanel.module.css tests/DetailPanel.test.tsx
git commit -m "feat(detail): DetailPanel variant prop — 'side' | 'sheet' | 'wide'"
```

---

## Task 9: Toolbar — `compact` prop (hamburger menu, shorter placeholder)

**Files:**
- Modify: `src/components/toolbar/Toolbar.tsx`
- Modify: `src/components/toolbar/Toolbar.module.css`

- [ ] **Step 9.1: Add the `compact` prop and a hamburger button to `src/components/toolbar/Toolbar.tsx`**

Final file:

```tsx
import {
  IconSearch,
  IconLayoutGrid,
  IconList,
  IconFilter,
  IconUpload,
  IconMenu2,
} from '@tabler/icons-react';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (m: 'grid' | 'list') => void;
  onFilterClick: () => void;
  onUploadClick: () => void;
  filterCount: number;
  /** Phone/tablet: replace the filter button with a ☰ that opens the
   *  sidebar drawer, and use a shorter search placeholder. */
  compact?: boolean;
  onMenuClick?: () => void;
}

export function Toolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onFilterClick,
  onUploadClick,
  filterCount,
  compact = false,
  onMenuClick,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="主工具栏">
      {compact && onMenuClick && (
        <button
          type="button"
          className={styles.btn}
          onClick={onMenuClick}
          aria-label="打开侧栏"
          title="侧栏"
        >
          <IconMenu2 size={18} aria-hidden="true" />
        </button>
      )}
      <div className={styles.search}>
        <IconSearch size={16} aria-hidden="true" />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={compact ? '搜索…' : '搜索资产…'}
          aria-label="搜索资产"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className={styles.toggleGroup} role="group" aria-label="视图模式">
        <button
          type="button"
          className={`${styles.btn} ${viewMode === 'grid' ? styles.active : ''}`}
          onClick={() => onViewModeChange('grid')}
          aria-pressed={viewMode === 'grid'}
          aria-label="网格视图"
          title="网格视图 (1)"
        >
          <IconLayoutGrid size={16} aria-hidden="true" />
          <span>网格</span>
        </button>
        <button
          type="button"
          className={`${styles.btn} ${viewMode === 'list' ? styles.active : ''}`}
          onClick={() => onViewModeChange('list')}
          aria-pressed={viewMode === 'list'}
          aria-label="列表视图"
          title="列表视图 (2)"
        >
          <IconList size={16} aria-hidden="true" />
          <span>列表</span>
        </button>
      </div>
      {!compact && (
        <button
          type="button"
          className={styles.btn}
          onClick={onFilterClick}
          aria-label="打开筛选"
          title="筛选"
        >
          <IconFilter size={16} aria-hidden="true" />
          <span>筛选</span>
          {filterCount > 0 && (
            <span className={styles.badge} aria-label={`${filterCount} 个筛选条件`}>
              {filterCount}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        className={styles.btn}
        onClick={onUploadClick}
        aria-label="上传资产"
        title="上传 (U)"
      >
        <IconUpload size={16} aria-hidden="true" />
        <span>上传</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 9.2: Add the compact placeholder tone to `src/components/toolbar/Toolbar.module.css`**

Append (no existing rules change):

```css
/* On compact (phone/tablet) the search field is shorter; the placeholder
   is already short, but make sure it never overflows. */
.searchInput::placeholder {
  color: var(--color-text-tertiary);
}
```

(The existing `::placeholder` rule already exists at the bottom of the file; do not duplicate it. Skip this step if `::placeholder` is already there. Verified at line 36-38 of the existing file: yes, it already exists. **No CSS change needed in this task — skip step 9.2.**)

- [ ] **Step 9.3: Run the full test suite**

Run: `npx vitest run`
Expected: green. The Toolbar has no test file; the type-check is the regression guard.

- [ ] **Step 9.4: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 9.5: Commit**

```bash
git add src/components/toolbar/Toolbar.tsx
git commit -m "feat(toolbar): compact prop — hamburger button + shorter placeholder (phone/tablet)"
```

---

## Task 10: AssetList — route to StackedCardList on phone

**Files:**
- Modify: `src/components/browser/AssetList.tsx`

- [ ] **Step 10.1: Add the phone routing logic to `src/components/browser/AssetList.tsx`**

Final file:

```tsx
import { useState, useMemo } from 'react';
import type { Asset } from '../../state/types';
import { AssetListRow } from './AssetListRow';
import { StackedCardList } from './StackedCardList';
import { EmptyState } from '../common/EmptyState';
import { useViewport } from '../../hooks/useViewport';
import styles from './AssetList.module.css';

type SortKey =
  | 'name'
  | 'type'
  | 'size'
  | 'date'
  | 'favorite';

interface AssetListProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onKebab: (asset: Asset, anchor: HTMLElement) => void;
}

export function AssetList({
  assets,
  selectedId,
  onSelect,
  onToggleFavorite,
  onKebab,
}: AssetListProps) {
  const viewport = useViewport();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...assets];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortKey === 'size') cmp = a.size - b.size;
      else if (sortKey === 'date')
        cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      else if (sortKey === 'favorite') cmp = Number(a.favorite) - Number(b.favorite);
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [assets, sortKey, asc]);

  function clickHeader(k: SortKey) {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === 'name');
    }
  }

  if (assets.length === 0) {
    return <EmptyState message="没有匹配的资产" />;
  }

  if (viewport === 'phone') {
    return (
      <StackedCardList
        assets={sorted}
        selectedId={selectedId}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
        onKebab={onKebab}
      />
    );
  }

  return (
    <div className={styles.list} role="grid">
      <div className={styles.header} role="row">
        <span></span>
        <button onClick={() => clickHeader('name')}>名称 {sortKey === 'name' ? (asc ? '↑' : '↓') : ''}</button>
        <button onClick={() => clickHeader('type')}>类型</button>
        <button onClick={() => clickHeader('size')}>大小</button>
        <span>信息</span>
        <span>标签</span>
        <span>上传者</span>
        <button onClick={() => clickHeader('date')}>上传时间 {sortKey === 'date' ? (asc ? '↑' : '↓') : ''}</button>
        <button onClick={() => clickHeader('favorite')}>★</button>
        <span></span>
      </div>
      {sorted.map((a) => (
        <AssetListRow
          key={a.id}
          asset={a}
          selected={selectedId === a.id}
          onClick={() => onSelect(a.id)}
          onToggleFavorite={() => onToggleFavorite(a.id)}
          onKebab={(e) => onKebab(a, e.currentTarget as HTMLElement)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 10.2: Run the full test suite**

Run: `npx vitest run`
Expected: green. `useViewport` will default to `'desktop'` in jsdom (since the test viewport is 1024px) so the AssetList tests will continue to render the 10-column grid.

- [ ] **Step 10.3: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 10.4: Commit**

```bash
git add src/components/browser/AssetList.tsx
git commit -m "feat(browser): AssetList routes to StackedCardList on phone viewport"
```

---

## Task 11: App.tsx — useViewport, two-slot Sidebar, two-slot DetailPanel

**Files:**
- Modify: `src/App.tsx`

This is the integration step. Everything built so far snaps into App.tsx.

- [ ] **Step 11.1: Add the Drawer + BottomSheet imports and local state to `src/App.tsx`**

Replace the imports block (lines 1-29) with:

```tsx
import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Toolbar } from './components/toolbar/Toolbar';
import { Sidebar } from './components/sidebar/Sidebar';
import { AssetGrid } from './components/browser/AssetGrid';
import { AssetList } from './components/browser/AssetList';
import { DetailPanel } from './components/detail/DetailPanel';
import { UploadDialog } from './components/upload/UploadDialog';
import { FilterPanel } from './components/filter/FilterPanel';
import { Modal } from './components/common/Modal';
import { ShortcutsHelp } from './components/common/ShortcutsHelp';
import { ContextMenu } from './components/common/ContextMenu';
import { Drawer } from './components/common/Drawer';
import { BottomSheet } from './components/common/BottomSheet';
import { useConfirm } from './components/common/ConfirmDialog';
import { buildAssetRowMenuItems } from './components/browser/AssetRowMenu';
import { useStore } from './hooks/useStore';
import { useDebounce } from './hooks/useDebounce';
import { useToast } from './hooks/useToast';
import { useViewport } from './hooks/useViewport';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  selectVisibleAssets,
  selectSidebarCounts,
  selectActiveFilterCount,
} from './state/selectors';
import { copyToClipboard } from './utils/clipboard';
import { downloadAsset } from './utils/download';
import { deleteAsset, emptyTrash, permanentDelete, restoreAsset } from './state/assetOps';
import type { KeymapEntry } from './state/keymap';
import type { Asset } from './state/types';
import styles from './App.module.css';
```

- [ ] **Step 11.2: Add the viewport + drawer + sheet state to the `App` function body**

Right after the existing `const [menuAnchor, setMenuAnchor] = useState<...>(null);` line, add:

```tsx
  const viewport = useViewport();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Edge E1: phone sheet persists across selections (content swaps).
  // Edge E2: phone drawer closes on Sidebar selection.
  // Edge E3: tablet side detail persists across selections.
  // E2 implementation: when SET_SELECTION fires, close the drawer.
  const onSelectSelection = useCallback(
    (s: typeof state.ui.selection) => {
      dispatch({ type: 'SET_SELECTION', selection: s });
      dispatch({ type: 'SELECT_ASSET', id: null });
      setSidebarOpen(false);
    },
    [dispatch],
  );

  // Auto-open the sheet when an asset becomes selected on phone.
  useEffect(() => {
    if (viewport === 'phone' && state.ui.selectedAssetId) {
      setSheetOpen(true);
    }
  }, [viewport, state.ui.selectedAssetId]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    dispatch({ type: 'SELECT_ASSET', id: null });
  }, [dispatch]);

  const isCompact = viewport === 'phone' || viewport === 'tablet';
  const detailVariant: 'side' | 'sheet' | 'wide' =
    viewport === 'phone' ? 'sheet' : viewport === 'wide' ? 'wide' : 'side';
```

(When the sheet closes we also clear the asset selection so the side panel doesn't keep showing the same asset on the next desktop/tablet view.)

- [ ] **Step 11.3: Pass `compact` and `onMenuClick` to the Toolbar; route Sidebar to a Drawer on phone/tablet**

In the JSX, change the Toolbar props:

```tsx
        toolbar={
          <Toolbar
            searchQuery={state.ui.searchQuery}
            onSearchChange={(q) => dispatch({ type: 'SET_SEARCH', query: q })}
            viewMode={state.ui.viewMode}
            onViewModeChange={(m) => dispatch({ type: 'SET_VIEW_MODE', mode: m })}
            onFilterClick={() =>
              dispatch({ type: 'SET_FILTER_PANEL', open: !state.ui.filterPanelOpen })
            }
            onUploadClick={() => dispatch({ type: 'SET_UPLOAD_DIALOG', open: true })}
            filterCount={filterCount}
            compact={isCompact}
            onMenuClick={() => setSidebarOpen(true)}
          />
        }
```

Change the Sidebar `onSelect` to use the wrapper:

```tsx
        sidebar={
          <Sidebar
            selection={state.ui.selection}
            onSelect={onSelectSelection}
            counts={counts}
          />
        }
```

- [ ] **Step 11.4: Render the Sidebar in a Drawer on phone/tablet**

After the existing `<AppShell … />` element (still in the same parent fragment), render:

```tsx
      <Drawer
        open={sidebarOpen && isCompact}
        onClose={() => setSidebarOpen(false)}
        side="left"
        width="280px"
        label="资产分类"
      >
        <Sidebar
          selection={state.ui.selection}
          onSelect={onSelectSelection}
          counts={counts}
        />
      </Drawer>
```

The CSS in `AppShell.module.css` (Task 1) hides `.sidebar` on phone/tablet viewports, so the in-shell copy is hidden. The Drawer copy is the only visible one on small screens.

- [ ] **Step 11.5: Render the DetailPanel in two slots (side panel for desktop/wide, BottomSheet for phone)**

The existing `<DetailPanel … />` is rendered inside `<AppShell>`'s `detail` slot. Pass `variant={detailVariant}`. On phone, the AppShell hides the in-shell detail; we render a second copy inside a BottomSheet.

In the AppShell JSX, change the `detail` prop:

```tsx
        detail={
          <DetailPanel
            asset={selected}
            variant={detailVariant}
            onToggleFavorite={() =>
              selected && dispatch({ type: 'TOGGLE_FAVORITE', id: selected.id })
            }
            onDelete={handleDelete}
            onCopyLink={handleCopyLink}
            onDownload={handleDownload}
            onRename={(name) => selected && dispatch({ type: 'RENAME_ASSET', id: selected.id, name })}
            onAddTag={(tag) => selected && dispatch({ type: 'ADD_TAG', id: selected.id, tag })}
            onRemoveTag={(tag) => selected && dispatch({ type: 'REMOVE_TAG', id: selected.id, tag })}
            onRestore={() => {
              if (!selected) return;
              const { nextState } = restoreAsset({ assets: state.assets, ui: state.ui }, selected.id);
              dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
              toast.showToast({ message: '已恢复', variant: 'success' });
            }}
            onClose={() => dispatch({ type: 'SELECT_ASSET', id: null })}
          />
        }
```

After the existing Drawer, render the BottomSheet (phone only):

```tsx
      {viewport === 'phone' && (
        <BottomSheet
          open={sheetOpen}
          onClose={closeSheet}
          label="资产详情"
        >
          <DetailPanel
            asset={selected}
            variant="sheet"
            onToggleFavorite={() =>
              selected && dispatch({ type: 'TOGGLE_FAVORITE', id: selected.id })
            }
            onDelete={handleDelete}
            onCopyLink={handleCopyLink}
            onDownload={handleDownload}
            onRename={(name) => selected && dispatch({ type: 'RENAME_ASSET', id: selected.id, name })}
            onAddTag={(tag) => selected && dispatch({ type: 'ADD_TAG', id: selected.id, tag })}
            onRemoveTag={(tag) => selected && dispatch({ type: 'REMOVE_TAG', id: selected.id, tag })}
            onRestore={() => {
              if (!selected) return;
              const { nextState } = restoreAsset({ assets: state.assets, ui: state.ui }, selected.id);
              dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
              toast.showToast({ message: '已恢复', variant: 'success' });
            }}
            onClose={closeSheet}
          />
        </BottomSheet>
      )}
```

- [ ] **Step 11.6: Update the Escape keymap to close drawer/sheet first**

In the keymap `useMemo` (around line 215), the Escape handler currently clears the search or the asset selection. Update it to also close the drawer/sheet on phone:

```tsx
      { key: 'Escape', scope: 'global', description: '关闭 / 清除搜索 / 取消选择', handler: () => {
        if (sheetOpen) { setSheetOpen(false); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        if (state.ui.searchQuery) { dispatch({ type: 'SET_SEARCH', query: '' }); return; }
        if (state.ui.selectedAssetId) { dispatch({ type: 'SELECT_ASSET', id: null }); }
      }},
```

Add `sheetOpen` and `sidebarOpen` to the dependency array of the `keymap` `useMemo`.

- [ ] **Step 11.7: Remove the `.fallback-narrow` div from `src/App.tsx`**

The final `</>` block currently has:

```tsx
      <div className="fallback-narrow">
        <div>
          <strong>请使用更大的屏幕</strong>
          请使用宽度 ≥ 1024px 的设备访问此应用
        </div>
      </div>
```

Delete that block.

- [ ] **Step 11.8: Run the full test suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 11.9: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 11.10: Manual smoke (5-line sanity check)**

Run: `npm run dev`
Then in a browser at widths 375 / 768 / 1100 / 1440 / 1920:
- 375: ☰ + search + grid/list + upload in toolbar. Click an asset → BottomSheet slides up. Press Esc → sheet closes. Click ☰ → Sidebar drawer slides in.
- 768: ☰ + search + view + upload. Click an asset → right-side detail panel updates. Press Esc → selection clears.
- 1100: identical to today's 3-pane.
- 1440: identical to today's 3-pane.
- 1920: 3-pane with wider sidebar (200) and wider detail (320) and bigger grid cards.

If any of these fail, fix and re-test. This is a manual sanity check; it does **not** replace the test suite.

- [ ] **Step 11.11: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire useViewport + Drawer (sidebar) + BottomSheet (detail) — 4-tier responsive"
```

---

## Task 12: Sidebar CSS polish + final regression run

**Files:**
- Modify: `src/components/sidebar/Sidebar.module.css`

- [ ] **Step 12.1: Tighten sidebar padding on phone/tablet**

Append to `src/components/sidebar/Sidebar.module.css`:

```css
/* On phone/tablet, the sidebar lives in a Drawer with its own padding;
   trim the inner padding so the items look at home there. */
body[data-viewport="phone"] .item,
body[data-viewport="tablet"] .item {
  padding-left: var(--space-7);
  padding-right: var(--space-7);
}
```

- [ ] **Step 12.2: Update `docs/code-review-2026-06-04.md` N9 follow-up**

Find the N9 follow-up line in the code review doc and append a new line: `* 2026-06-05: responsive spec committed (see docs/superpowers/specs/2026-06-05-responsive-design.md); N9 remaining hardcoded colors (Toast, UploadDialog, AssetCard inner) are out of scope for this round and continue to be tracked separately.`

- [ ] **Step 12.3: Run the full test suite**

Run: `npx vitest run`
Expected: green. The full project has the existing 85+ tests (Modal×8, ContextMenu×15, DetailPanel×7, plus everything else) plus the 26 new tests added by this plan (useViewport×10, Drawer×10, BottomSheet×9, StackedCardList×7 — total 36). All must pass.

- [ ] **Step 12.4: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 12.5: Lint**

Run: `npm run lint`
Expected: no new errors introduced. (The 5 pre-existing lint errors in `ConfirmDialog.tsx`, `ToastProvider.tsx`, `DetailPanel.tsx`, `useKeyboardShortcuts.ts`, `store.tsx` from the 2026-06-04 review are out of scope; do not fix them here.)

- [ ] **Step 12.6: Commit**

```bash
git add src/components/sidebar/Sidebar.module.css docs/code-review-2026-06-04.md
git commit -m "style(sidebar): tighten padding on phone/tablet; docs: link N9 follow-up to responsive spec"
```

---

## Self-review (executed by the writer, not the agent)

**1. Spec coverage:**
- §3 Breakpoints → Task 1 (CSS attribute selectors) + Task 2 (useViewport) + Task 1.4 (AppShell media queries).
- §4 Locked decisions A/A2/B1/L3/W3/T2 → Task 1 (CSS hides/shows slots) + Task 4 (BottomSheet snap math) + Task 5 (StackedCardList) + Task 1.4 (wide grid) + Task 6 (AssetCard ⋮).
- §5 Edge E1–E8 → Task 11.2 (sheet persists, drawer closes on selection, wide preview/font, sync first-paint).
- §6.1 Drawer → Task 3.
- §6.2 BottomSheet → Task 4.
- §6.3 StackedCardList → Task 5.
- §6.4 useViewport → Task 2.
- §7 Modified components → Tasks 6, 7, 8, 9, 10, 11.
- §8 No state changes → confirmed: no `state/types.ts` or `state/store.tsx` modifications.
- §9 Touch & a11y (pointer events, 44px targets, focus trap, `aria-modal`, reduced motion, keymap) → Tasks 3, 4, 5 (touch-target-min), 11.6 (Escape).
- §10 Testing (5 new test files, regression on 13 existing) → Tasks 2.1, 3.1, 4.1, 5.1, 8.1, plus 11.8 / 12.3 regression runs.
- §11 No migration / no router / no feature flag → confirmed.
- §12 Risks (BottomSheet drag jitter, body scroll lock + Modal, jsdom pointer events) → Task 4 implementation note + the `pointerdown` document-level listeners handle the jsdom case.
- §13 Out of scope (more hardcoded colors, PWA, etc.) → explicitly deferred in 12.2.

**2. Placeholder scan:** No TBD/TODO. Every code block is complete. Every test has the actual test code. Every step has the actual command.

**3. Type consistency:**
- `useViewport()` returns `'phone' | 'tablet' | 'desktop' | 'wide'` — used in App.tsx (Task 11), AssetList (Task 10), and via `body[data-viewport]` in CSS (Task 1).
- `DrawerProps.side: 'left' | 'right'` — used in App.tsx (Task 11.4) with `side="left"`.
- `BottomSheetProps` — `peekHeight` / `expandedHeight` defaults match the spec's 50% / 90%.
- `DetailPanelProps.variant: 'side' | 'sheet' | 'wide'` — used in App.tsx (Task 11.5) as `detailVariant`.
- `StackedCardListProps.onKebab: (asset: Asset, anchor: HTMLElement) => void` — matches `App.tsx`'s `handleKebab` (the existing handler at line 136-139 already has the same signature, accepting the asset + `anchor`).
- `ToolbarProps.compact` / `onMenuClick` — used in App.tsx (Task 11.3).
- `AppShellProps.dataViewport` — declared but unused at runtime; the prop is documentation, the actual switch is via `body[data-viewport]` in CSS. Future-proof only.

No type mismatches found.
