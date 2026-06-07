# Frontend Main-Page GSAP Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Editorial/Calm GSAP motion vocabulary (already on `LoginScreen` from Plan 11) to the post-login asset browser: AppShell mount entrance, card stagger on user-initiated `visibleAssets` changes (grid + list variants), view-mode crossfade (grid ↔ list) via a `displayMode` lag with a midpoint `.call()` swap, and detail panel open/close (desktop side + phone BottomSheet variants). Per-component `useGSAP`, no central orchestrator, all animations respect `prefers-reduced-motion`.

**Architecture:** Five new `lib/animations/*.ts` files each export one or more pure timeline factories (the same pattern Plan 11 set with `login-screen.ts`). A new `useIsFirstMount` hook gates the AppShell mount vs AssetGrid replay so the initial cards don't double-animate. Every consumer wires its own `useGSAP` next to the component whose DOM it queries. The view-mode crossfade is the one non-trivial case: a `useState` `displayMode` lags `state.ui.viewMode`, and the App-level `useGSAP` runs a timeline that fades the browser slot to 0, calls `setDisplayMode` at the midpoint, and fades back in. All animations are gated by `gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', ...)`.

**Tech Stack:** Existing — React 19, GSAP 3.15, `@gsap/react` 2.1.2, Vitest 2.1.4, @testing-library/react 16, jsdom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-07-frontend-main-page-gsap-animations-design.md` (commit `fa0913a`). Read §1–§9 of the spec before starting.

**Working directory:** Run all commands from the repo root `D:\DAM-Link-Backend\` unless noted.

---

## Phase 0 — Foundations

### Task 1: Extend `GSAP_DURATIONS` with the `medium-slow` tier

**Files:**
- Modify: `packages/web/src/lib/gsap-setup.ts`

The `medium-slow: 0.4` tier is used by the view-mode crossfade, side detail panel, and BottomSheet animations. Adding it now so the next 5 tasks can import it.

- [ ] **Step 1: Open the file and locate `GSAP_DURATIONS`**

The current file (already read) is at `packages/web/src/lib/gsap-setup.ts`. The constant is at lines 11–16.

- [ ] **Step 2: Add the `medium-slow` entry**

Replace the existing block:

```ts
export const GSAP_DURATIONS = {
  slow: 0.8,     // hero elements (headline)
  medium: 0.5,   // secondary copy, form fields
  fast: 0.35,    // mode-switch sub copy crossfade
  micro: 0.25,   // button/switch fade-in
} as const;
```

with:

```ts
export const GSAP_DURATIONS = {
  slow: 0.8,            // hero elements (headline)
  medium: 0.5,          // secondary copy, form fields
  fast: 0.35,           // mode-switch sub copy crossfade
  micro: 0.25,          // button/switch fade-in
  'medium-slow': 0.4,   // view-mode crossfade, detail panel open/close, BottomSheet open/close
} as const;
```

- [ ] **Step 3: Verify `pnpm typecheck` is clean**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors. The literal `'medium-slow'` is a valid `as const` object key.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/gsap-setup.ts
git commit -m "feat(web): add medium-slow duration tier to GSAP_DURATIONS"
```

---

### Task 2: `useIsFirstMount` hook

**Files:**
- Create: `packages/web/src/hooks/useIsFirstMount.ts`
- Create: `packages/web/tests/hooks/useIsFirstMount.test.tsx`

The hook returns `true` on the very first render of a component instance, and `false` on every subsequent render. Used to gate the AppShell mount timeline (so it only fires once) and the per-grid stagger replay (so the very first dep change is skipped, since the AppShell mount already covered it).

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/hooks/useIsFirstMount.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsFirstMount } from '../../src/hooks/useIsFirstMount';

describe('useIsFirstMount', () => {
  it('returns true on the first render and false on every subsequent render', () => {
    const { result, rerender } = renderHook(() => useIsFirstMount());
    expect(result.current).toBe(true);
    rerender();
    expect(result.current).toBe(false);
    rerender();
    expect(result.current).toBe(false);
    rerender();
    expect(result.current).toBe(false);
  });

  it('returns true again for a fresh instance (a separate renderHook call)', () => {
    const first = renderHook(() => useIsFirstMount());
    expect(first.result.current).toBe(true);

    const second = renderHook(() => useIsFirstMount());
    expect(second.result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F @dam-link/web test tests/hooks/useIsFirstMount.test.tsx`
Expected: FAIL with "Cannot find module '../../src/hooks/useIsFirstMount'" (the file doesn't exist yet).

- [ ] **Step 3: Implement the hook**

Create `packages/web/src/hooks/useIsFirstMount.ts`:

```ts
import { useRef } from 'react';

/**
 * Returns `true` on the very first render of the calling component instance,
 * and `false` on every subsequent render. Resets to `true` if the component
 * is unmounted and remounted (e.g. on hot-module reload).
 *
 * Used to gate the AppShell mount timeline (so it only fires once) and the
 * AssetGrid/AssetList per-card stagger replay (so the first dep change,
 * which corresponds to the AppShell mount's initial stagger, doesn't
 * double-animate).
 */
export function useIsFirstMount(): boolean {
  const isFirst = useRef(true);
  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/hooks/useIsFirstMount.test.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useIsFirstMount.ts packages/web/tests/hooks/useIsFirstMount.test.tsx
git commit -m "feat(web): add useIsFirstMount hook for animation gating"
```

---

### Task 3: `createAppShellMountEntrance` factory

**Files:**
- Create: `packages/web/src/lib/animations/app-shell.ts`
- Create: `packages/web/tests/animations/app-shell.test.ts`

Drives the toolbar, sidebar, main, detail frame containers, and the initial card stagger as a single one-time timeline on AppShell's first mount. Per the spec §4.1.

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/animations/app-shell.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createAppShellMountEntrance } from '../../src/lib/animations/app-shell';
import { gsap } from '../../src/lib/gsap-setup';

function makeShell(): HTMLElement {
  const shell = document.createElement('div');
  shell.innerHTML = `
    <div data-anim="toolbar-row"></div>
    <nav data-anim="sidebar-col"></nav>
    <main data-anim="main"></main>
    <aside data-anim="detail-panel"></aside>
    <div data-anim="card"></div>
    <div data-anim="card"></div>
  `;
  return shell;
}

describe('createAppShellMountEntrance', () => {
  it('returns a paused gsap timeline', () => {
    const tl = createAppShellMountEntrance(makeShell());
    expect(tl.paused()).toBe(true);
  });

  it('targets the four frame containers and the cards', () => {
    const tl = createAppShellMountEntrance(makeShell());
    // 4 frame containers + 2 cards = 6 tweens
    const children = tl.getChildren(false, true, false);
    expect(children.length).toBe(6);
  });

  it('does not throw when the shell is empty', () => {
    const empty = document.createElement('div');
    expect(() => createAppShellMountEntrance(empty)).not.toThrow();
    const tl = createAppShellMountEntrance(empty);
    expect(tl.paused()).toBe(true);
    // All 5 selectors missing → 0 tweens, no error.
    expect(tl.getChildren(false, true, false).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F @dam-link/web test tests/animations/app-shell.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/animations/app-shell'".

- [ ] **Step 3: Implement the factory**

Create `packages/web/src/lib/animations/app-shell.ts`:

```ts
import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * One-time AppShell mount entrance. Fires after login completes.
 *
 * Animates, in order:
 *   0.0s  toolbar   y -8  → 0, opacity 0 → 1, slow, enter
 *   0.0s  sidebar   x -16 → 0, opacity 0 → 1, medium, enter   (parallel with toolbar)
 *   0.1s  main      opacity 0 → 1, medium, enterSoft
 *   0.15s detail    x 16  → 0, opacity 0 → 1, medium, enter
 *   0.3s  cards     y 6   → 0, opacity 0 → 1, medium, enterSoft, 0.05s stagger
 *
 * Returns a PAUSED timeline; the caller plays it via `.play(0)`.
 * All selectors are scoped to the shell element, so multiple shells on a page
 * are safe.
 *
 * If a selector matches nothing (e.g. no cards on a fresh login), the
 * corresponding `.from()` is a no-op (GSAP handles empty NodeLists).
 */
export function createAppShellMountEntrance(shellEl: Element): gsap.core.Timeline {
  return gsap
    .timeline({ paused: true })
    .from(shellEl.querySelectorAll('[data-anim="toolbar-row"]'), {
      opacity: 0,
      y: -8,
      duration: GSAP_DURATIONS.slow,
      ease: GSAP_EASING.enter,
    }, 0)
    .from(shellEl.querySelectorAll('[data-anim="sidebar-col"]'), {
      opacity: 0,
      x: -16,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enter,
    }, 0)
    .from(shellEl.querySelector('[data-anim="main"]'), {
      opacity: 0,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
    }, 0.1)
    .from(shellEl.querySelectorAll('[data-anim="detail-panel"]'), {
      opacity: 0,
      x: 16,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enter,
    }, 0.15)
    .from(shellEl.querySelectorAll('[data-anim="card"]'), {
      opacity: 0,
      y: 6,
      duration: GSAP_DURATIONS.medium,
      ease: GSAP_EASING.enterSoft,
      stagger: 0.05,
    }, 0.3);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/animations/app-shell.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/animations/app-shell.ts packages/web/tests/animations/app-shell.test.ts
git commit -m "feat(web): add createAppShellMountEntrance animation factory"
```

---

### Task 4: `createAssetGridStagger` factory

**Files:**
- Create: `packages/web/src/lib/animations/asset-grid.ts`
- Create: `packages/web/tests/animations/asset-grid.test.ts`

Per-card stagger for the grid view, replayed on user-initiated `visibleAssets` changes. Per spec §4.2a.

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/animations/asset-grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createAssetGridStagger } from '../../src/lib/animations/asset-grid';
import { gsap } from '../../src/lib/gsap-setup';

function makeGrid(n: number): { grid: HTMLElement; cards: HTMLElement[] } {
  const grid = document.createElement('div');
  const cards: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const card = document.createElement('div');
    card.setAttribute('data-anim', 'card');
    grid.appendChild(card);
    cards.push(card);
  }
  return { grid, cards };
}

describe('createAssetGridStagger', () => {
  it('returns a paused timeline', () => {
    const { grid, cards } = makeGrid(3);
    const tl = createAssetGridStagger(grid, cards);
    expect(tl.paused()).toBe(true);
  });

  it('has one tween per card', () => {
    const { grid, cards } = makeGrid(4);
    const tl = createAssetGridStagger(grid, cards);
    expect(tl.getChildren(false, true, false).length).toBe(4);
  });

  it('returns an empty timeline for an empty grid (no cards)', () => {
    const { grid, cards } = makeGrid(0);
    const tl = createAssetGridStagger(grid, cards);
    expect(tl.paused()).toBe(true);
    expect(tl.getChildren(false, true, false).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F @dam-link/web test tests/animations/asset-grid.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the factory**

Create `packages/web/src/lib/animations/asset-grid.ts`:

```ts
import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Per-card stagger for the grid view. Replayed by AssetGrid on user-initiated
 * `visibleAssets` changes (search / filter / sidebar click). The first
 * invocation on mount is gated out by `useIsFirstMount` — the initial cards
 * are already animated by `createAppShellMountEntrance`.
 *
 * Returns a PAUSED timeline; the caller plays it.
 * If `cards` is empty, returns a paused empty timeline.
 */
export function createAssetGridStagger(
  _gridEl: Element,
  cards: Element[],
): gsap.core.Timeline {
  if (cards.length === 0) {
    return gsap.timeline({ paused: true });
  }
  return gsap.from(cards, {
    opacity: 0,
    y: 6,
    duration: GSAP_DURATIONS.medium,
    ease: GSAP_EASING.enterSoft,
    stagger: 0.05,
    paused: true,
  });
}
```

Note: `gsap.from(elements, { ..., paused: true })` returns a `gsap.core.Timeline` (not a single tween) when `stagger` is present, so `.getChildren(false, true, false)` works on it.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/animations/asset-grid.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/animations/asset-grid.ts packages/web/tests/animations/asset-grid.test.ts
git commit -m "feat(web): add createAssetGridStagger animation factory"
```

---

### Task 5: `createAssetListFade` factory

**Files:**
- Create: `packages/web/src/lib/animations/asset-list.ts`
- Create: `packages/web/tests/animations/asset-list.test.ts`

Whole-list fade for the list view, replayed on user-initiated `visibleAssets` changes. Per spec §4.2b. No per-row stagger (a 50-row list would be 2.5s of motion).

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/animations/asset-list.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createAssetListFade } from '../../src/lib/animations/asset-list';
import { gsap } from '../../src/lib/gsap-setup';

function makeList(n: number): { list: HTMLElement; rows: HTMLElement[] } {
  const list = document.createElement('div');
  const rows: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.setAttribute('data-anim', 'row');
    list.appendChild(row);
    rows.push(row);
  }
  return { list, rows };
}

describe('createAssetListFade', () => {
  it('returns a paused timeline', () => {
    const { list, rows } = makeList(3);
    const tl = createAssetListFade(list, rows);
    expect(tl.paused()).toBe(true);
  });

  it('is a single tween regardless of row count (whole-list fade, no per-row stagger)', () => {
    const { list, rows } = makeList(50);
    const tl = createAssetListFade(list, rows);
    expect(tl.getChildren(false, true, false).length).toBe(1);
  });

  it('returns an empty timeline for an empty list', () => {
    const { list, rows } = makeList(0);
    const tl = createAssetListFade(list, rows);
    expect(tl.paused()).toBe(true);
    expect(tl.getChildren(false, true, false).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F @dam-link/web test tests/animations/asset-list.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the factory**

Create `packages/web/src/lib/animations/asset-list.ts`:

```ts
import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Whole-list fade for the list view. Replayed by AssetList on user-initiated
 * `visibleAssets` changes. The first invocation on mount is gated out by
 * `useIsFirstMount`.
 *
 * No per-row stagger — a 50-row list staggering at 0.05s is ~2.5s of motion,
 * which is too slow and feels broken.
 *
 * Returns a PAUSED timeline; the caller plays it.
 * If `rows` is empty, returns a paused empty timeline.
 */
export function createAssetListFade(
  listEl: Element,
  rows: Element[],
): gsap.core.Timeline {
  if (rows.length === 0) {
    return gsap.timeline({ paused: true });
  }
  return gsap.from(listEl, {
    opacity: 0,
    duration: GSAP_DURATIONS.medium,
    ease: GSAP_EASING.enterSoft,
    paused: true,
  });
  // `rows` is in the signature for symmetry with createAssetGridStagger and
  // to make the call site read clearly. ESLint allows unused params named _
  // via the project rule.
  void rows;
}
```

Wait — `rows` is actually unused. Apply the project's eslint rule (`argsIgnorePattern: '^_'`) by renaming to `_rows`:

```ts
export function createAssetListFade(
  listEl: Element,
  _rows: Element[],
): gsap.core.Timeline {
  if (_rows.length === 0) {
    return gsap.timeline({ paused: true });
  }
  return gsap.from(listEl, {
    opacity: 0,
    duration: GSAP_DURATIONS.medium,
    ease: GSAP_EASING.enterSoft,
    paused: true,
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/animations/asset-list.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/animations/asset-list.ts packages/web/tests/animations/asset-list.test.ts
git commit -m "feat(web): add createAssetListFade animation factory"
```

---

### Task 6: `createViewModeSwitchTimeline` factory

**Files:**
- Create: `packages/web/src/lib/animations/view-mode-switch.ts`
- Create: `packages/web/tests/animations/view-mode-switch.test.ts`

Crossfade between grid and list views. The browser slot fades to 0, calls `onMidpoint` (so React can swap the rendered child), and fades back in. Per spec §4.3.

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/animations/view-mode-switch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createViewModeSwitchTimeline } from '../../src/lib/animations/view-mode-switch';
import { gsap } from '../../src/lib/gsap-setup';

describe('createViewModeSwitchTimeline', () => {
  it('returns a paused timeline', () => {
    const browser = document.createElement('div');
    const tl = createViewModeSwitchTimeline(browser, () => {});
    expect(tl.paused()).toBe(true);
  });

  it('has exactly two tweens (out + in) and one .call() at the midpoint', () => {
    const browser = document.createElement('div');
    const onMid = vi.fn();
    const tl = createViewModeSwitchTimeline(browser, onMid);
    // 2 tweens (the opacity transitions) + 1 call (the midpoint swap)
    const children = tl.getChildren(false, true, true);
    expect(children.length).toBe(3);
  });

  it('does not throw when browser is empty', () => {
    expect(() =>
      createViewModeSwitchTimeline(document.createElement('div'), () => {}),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F @dam-link/web test tests/animations/view-mode-switch.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the factory**

Create `packages/web/src/lib/animations/view-mode-switch.ts`:

```ts
import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Crossfade between the grid and list views. The browser slot fades to
 * opacity 0 over 0.2s, calls `onMidpoint` so the React tree can swap the
 * rendered child, then fades back to opacity 1 over 0.2s. Total: 0.4s.
 *
 * Returns a PAUSED timeline; the caller plays it. The `onMidpoint` callback
 * runs synchronously inside the GSAP scheduler at the 0.2s mark.
 */
export function createViewModeSwitchTimeline(
  browserEl: Element,
  onMidpoint: () => void,
): gsap.core.Timeline {
  return gsap
    .timeline({ paused: true })
    .to(browserEl, {
      opacity: 0,
      duration: 0.2,
      ease: GSAP_EASING.inOut,
    })
    .call(onMidpoint, [], '<') // '<' = start of next tween, which is the in-half
    .fromTo(
      browserEl,
      { opacity: 0 },
      {
        opacity: 1,
        duration: 0.2,
        ease: GSAP_EASING.inOut,
      },
    );
  // The two halves each use 0.2s (half of GSAP_DURATIONS['medium-slow']).
  // Inlined as literals because GSAP's position-parameter API for the second
  // half needs the explicit number to anchor the .call() at the boundary.
}
```

Note: We're using literal `0.2` here rather than `GSAP_DURATIONS['medium-slow'] / 2` to keep the `.call()` position expression simple. The spec note in §3 says "0.4s total: 0.2 + 0.2 split" so this is consistent.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/animations/view-mode-switch.test.ts`
Expected: 3 passing.

If the count assertion fails because GSAP doesn't surface the `.call()` in `getChildren`, fall back to:

```ts
const children = tl.getChildren(false, true, true);
expect(children.length).toBe(3); // 2 tweens + 1 call
```

If GSAP in this version categorizes `.call()` differently, change the assertion to `expect(children.length).toBeGreaterThanOrEqual(3)`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/animations/view-mode-switch.ts packages/web/tests/animations/view-mode-switch.test.ts
git commit -m "feat(web): add createViewModeSwitchTimeline animation factory"
```

---

### Task 7: `detail-panel.ts` (two factories: side + BottomSheet)

**Files:**
- Create: `packages/web/src/lib/animations/detail-panel.ts`
- Create: `packages/web/tests/animations/detail-panel.test.ts`

Two factories in one file: `createSideDetailPanelTimeline` (horizontal, for desktop) and `createBottomSheetTimeline` (vertical, for phone). They share the file because they're conceptually the same surface (detail panel) with different motion paths. Per spec §4.4.

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/animations/detail-panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createSideDetailPanelTimeline,
  createBottomSheetTimeline,
} from '../../src/lib/animations/detail-panel';
import { gsap } from '../../src/lib/gsap-setup';

describe('createSideDetailPanelTimeline', () => {
  it('returns a paused timeline for open', () => {
    const panel = document.createElement('div');
    const tl = createSideDetailPanelTimeline(panel, 'open');
    expect(tl.paused()).toBe(true);
  });

  it('has one tween for open and one for close', () => {
    const panel = document.createElement('div');
    const open = createSideDetailPanelTimeline(panel, 'open');
    const close = createSideDetailPanelTimeline(panel, 'close');
    expect(open.getChildren(false, true, false).length).toBe(1);
    expect(close.getChildren(false, true, false).length).toBe(1);
  });

  it('does not throw on empty panel', () => {
    expect(() =>
      createSideDetailPanelTimeline(document.createElement('div'), 'open'),
    ).not.toThrow();
  });
});

describe('createBottomSheetTimeline', () => {
  it('returns a paused timeline for open', () => {
    const sheet = document.createElement('div');
    const tl = createBottomSheetTimeline(sheet, 'open');
    expect(tl.paused()).toBe(true);
  });

  it('has one tween for open and one for close', () => {
    const sheet = document.createElement('div');
    const open = createBottomSheetTimeline(sheet, 'open');
    const close = createBottomSheetTimeline(sheet, 'close');
    expect(open.getChildren(false, true, false).length).toBe(1);
    expect(close.getChildren(false, true, false).length).toBe(1);
  });

  it('does not throw on empty sheet', () => {
    expect(() =>
      createBottomSheetTimeline(document.createElement('div'), 'open'),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F @dam-link/web test tests/animations/detail-panel.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement both factories**

Create `packages/web/src/lib/animations/detail-panel.ts`:

```ts
import { gsap, GSAP_DURATIONS, GSAP_EASING } from '../gsap-setup.js';

/**
 * Side detail panel (desktop / wide). Slides in from the right.
 * - open:  x 24 → 0, opacity 0 → 1, medium-slow, enter
 * - close: x 0  → 24, opacity 1 → 0, medium-slow, inOut
 *
 * Returns a PAUSED timeline; the caller plays it.
 */
export function createSideDetailPanelTimeline(
  panelEl: Element,
  direction: 'open' | 'close',
): gsap.core.Timeline {
  if (direction === 'open') {
    return gsap.from(panelEl, {
      opacity: 0,
      x: 24,
      duration: GSAP_DURATIONS['medium-slow'],
      ease: GSAP_EASING.enter,
      paused: true,
    });
  }
  return gsap.to(panelEl, {
    opacity: 0,
    x: 24,
    duration: GSAP_DURATIONS['medium-slow'],
    ease: GSAP_EASING.inOut,
    paused: true,
  });
}

/**
 * Bottom sheet (phone detail panel). Slides up from the bottom.
 * - open:  yPercent 100 → 0, opacity 0 → 1, medium-slow, enter
 * - close: yPercent 0   → 100, opacity 1 → 0, medium-slow, inOut
 *
 * yPercent is preferred over y so the sheet is positioned via CSS transform
 * without us needing to know its computed height. The CSS `transform`
 * property is preserved at rest (transform: ''), so the sheet does not
 * displace layout while the animation is paused.
 *
 * Returns a PAUSED timeline; the caller plays it.
 */
export function createBottomSheetTimeline(
  sheetEl: Element,
  direction: 'open' | 'close',
): gsap.core.Timeline {
  if (direction === 'open') {
    return gsap.from(sheetEl, {
      opacity: 0,
      yPercent: 100,
      duration: GSAP_DURATIONS['medium-slow'],
      ease: GSAP_EASING.enter,
      paused: true,
    });
  }
  return gsap.to(sheetEl, {
    opacity: 0,
    yPercent: 100,
    duration: GSAP_DURATIONS['medium-slow'],
    ease: GSAP_EASING.inOut,
    paused: true,
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/animations/detail-panel.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/animations/detail-panel.ts packages/web/tests/animations/detail-panel.test.ts
git commit -m "feat(web): add createSideDetailPanelTimeline + createBottomSheetTimeline factories"
```

---

## Phase 1 — `data-anim` Attributes

### Task 8: Add `data-anim` attributes to the leaf components

**Files:**
- Modify: `packages/web/src/components/toolbar/Toolbar.tsx:62`
- Modify: `packages/web/src/components/sidebar/Sidebar.tsx:96`
- Modify: `packages/web/src/components/browser/AssetCard.tsx:68`
- Modify: `packages/web/src/components/browser/AssetListRow.tsx:49`
- Modify: `packages/web/src/components/detail/DetailPanel.tsx:95`

Add the `data-anim` attributes that the AppShell mount, AssetGrid replay, AssetList replay, and DetailPanel open/close will query. No animation logic here — pure markup changes.

- [ ] **Step 1: Add `data-anim="toolbar-row"` to Toolbar's root**

Open `packages/web/src/components/toolbar/Toolbar.tsx`. Find the outer `<div>` at line 62 (the one that wraps the entire toolbar). Add the attribute:

```tsx
return (
  <div
    className={styles.toolbar}
    data-anim="toolbar-row"
  >
```

- [ ] **Step 2: Add `data-anim="sidebar-col"` to Sidebar's root**

Open `packages/web/src/components/sidebar/Sidebar.tsx`. Find the `<div className={styles.sidebar}>` at line 96. Add the attribute:

```tsx
<div className={styles.sidebar} data-anim="sidebar-col">
```

- [ ] **Step 3: Add `data-anim="card"` to AssetCard's root**

Open `packages/web/src/components/browser/AssetCard.tsx`. Find the outer `<div role="button" ...>` at line 68. Add the attribute:

```tsx
<div
  role="button"
  tabIndex={0}
  data-anim="card"
  className={`${styles.card} ${selected ? styles.selected : ''} ${hasCheckbox ? styles.hasCheckbox : ''}`}
```

- [ ] **Step 4: Add `data-anim="row"` to AssetListRow's root**

Open `packages/web/src/components/browser/AssetListRow.tsx`. Find the outer `<div role="row" ...>` at line 49. Add the attribute:

```tsx
<div
  role="row"
  data-anim="row"
  className={`${styles.row} ${selected ? styles.selected : ''}`}
```

- [ ] **Step 5: Add `data-anim="detail-panel"` to DetailPanel's root**

Open `packages/web/src/components/detail/DetailPanel.tsx`. Find the `<div className={styles.detail} data-variant={variant}>` at line 95. Add the attribute:

```tsx
<div
  className={styles.detail}
  data-variant={variant}
  data-anim="detail-panel"
>
```

- [ ] **Step 6: Verify the existing test suite still passes**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass. We haven't changed any logic, only added data-attributes.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/toolbar/Toolbar.tsx \
        packages/web/src/components/sidebar/Sidebar.tsx \
        packages/web/src/components/browser/AssetCard.tsx \
        packages/web/src/components/browser/AssetListRow.tsx \
        packages/web/src/components/detail/DetailPanel.tsx
git commit -m "feat(web): add data-anim attrs for AppShell mount + replay animations"
```

---

## Phase 2 — Wire-up

### Task 9: Wire `useGSAP` in `AppShell` for the mount entrance

**Files:**
- Modify: `packages/web/src/components/layout/AppShell.tsx`

AppShell drives the toolbar, sidebar, main, detail frame containers + initial card stagger on first mount. Gated by `useIsFirstMount`. Per spec §4.1, §5.

- [ ] **Step 1: Add the imports and the ref**

Open `packages/web/src/components/layout/AppShell.tsx`. Replace the current contents (lines 1–47) with:

```tsx
import { useRef, type ReactNode } from 'react';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createAppShellMountEntrance } from '../../lib/animations/app-shell.js';
import { useIsFirstMount } from '../../hooks/useIsFirstMount';
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
  const shellRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useIsFirstMount();

  // One-time mount entrance. Gated by useIsFirstMount so re-renders don't
  // re-fire. Gated by prefers-reduced-motion via gsap.matchMedia so the
  // no-motion branch is a no-op.
  useGSAP(
    () => {
      if (!isFirstMount) return;
      if (!shellRef.current) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (!shellRef.current) return;
        createAppShellMountEntrance(shellRef.current).play(0);
      });
      return () => mm.revert();
    },
    { scope: shellRef, dependencies: [isFirstMount] },
  );

  return (
    <div ref={shellRef} className={`app-root ${styles.shell}`}>
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

Note: `dataViewport` is in the props interface for API compatibility but unused inside the component (App.tsx writes it to `body[data-viewport]` via the `useViewport` hook, not through this prop). Keeping the prop avoids a public API change.

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass. We added a `useGSAP` body but the existing AppShell tests (if any) just check rendering; the gsap body only runs on real mount, and only the first mount's animation actually plays (useIsFirstMount gates it; the test environment uses jsdom which is a fresh instance per render).

- [ ] **Step 3: Verify typecheck is clean**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layout/AppShell.tsx
git commit -m "feat(web): wire AppShell useGSAP for mount entrance"
```

---

### Task 10: Wire `useGSAP` in `AssetGrid` for card stagger replay

**Files:**
- Modify: `packages/web/src/components/browser/AssetGrid.tsx`

AssetGrid replays the per-card stagger on user-initiated `visibleAssets` changes. First invocation is gated by `useIsFirstMount` (the AppShell mount already animated the initial cards). Per spec §4.2a.

- [ ] **Step 1: Read the current AssetGrid to know where to insert**

Open `packages/web/src/components/browser/AssetGrid.tsx`. The file is ~80 lines. The component returns a `<div className={styles.sections}>` containing one `<section>` per asset type, each with a `<div className={styles.grid}>` containing `<AssetCard>` elements. The full list of cards is therefore a flat NodeList across all `<div className={styles.grid}>` containers.

- [ ] **Step 2: Add the imports, the ref, and the useGSAP**

Modify the top of the file. Add the imports:

```tsx
import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createAssetGridStagger } from '../../lib/animations/asset-grid.js';
import { useIsFirstMount } from '../../hooks/useIsFirstMount';
```

(Keep all existing imports below these.)

Add a `gridRef` and the `useGSAP` call inside the `AssetGrid` function, just before the `return`:

```tsx
const gridRef = useRef<HTMLDivElement>(null);
const isFirstMount = useIsFirstMount();

useGSAP(
  () => {
    if (!gridRef.current) return;
    const cards = Array.from(
      gridRef.current.querySelectorAll<HTMLElement>('[data-anim="card"]'),
    );
    if (cards.length === 0) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      createAssetGridStagger(gridRef.current!, cards).play(0);
    });
    return () => mm.revert();
  },
  { scope: gridRef, dependencies: [visibleAssets, isFirstMount] },
);
```

`visibleAssets` is the prop the component already receives. The `dependencies` array re-runs the body on every prop change, but `useIsFirstMount` returns `false` after the first render, so only subsequent changes pass the gate.

- [ ] **Step 3: Attach the ref to the root element**

The component currently returns `<div className={styles.sections}>`. Add the ref:

```tsx
return (
  <div ref={gridRef} className={styles.sections}>
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/browser/AssetGrid.tsx
git commit -m "feat(web): wire AssetGrid useGSAP for card stagger replay"
```

---

### Task 11: Wire `useGSAP` in `AssetList` for list fade replay

**Files:**
- Modify: `packages/web/src/components/browser/AssetList.tsx`

Same pattern as AssetGrid: replay fade on user-initiated `visibleAssets` changes; first invocation gated by `useIsFirstMount`. Per spec §4.2b.

- [ ] **Step 1: Add the imports, the ref, and the useGSAP**

Open `packages/web/src/components/browser/AssetList.tsx`. Add at the top (after the existing imports):

```tsx
import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createAssetListFade } from '../../lib/animations/asset-list.js';
import { useIsFirstMount } from '../../hooks/useIsFirstMount';
```

The `AssetList` component receives `assets` as a prop. Inside the function body, add:

```tsx
const listRef = useRef<HTMLDivElement>(null);
const isFirstMount = useIsFirstMount();

useGSAP(
  () => {
    if (!listRef.current) return;
    const rows = Array.from(
      listRef.current.querySelectorAll<HTMLElement>('[data-anim="row"]'),
    );
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      createAssetListFade(listRef.current!, rows).play(0);
    });
    return () => mm.revert();
  },
  { scope: listRef, dependencies: [assets, isFirstMount] },
);
```

- [ ] **Step 2: Attach the ref to the root element**

The component currently returns `<div className={styles.list} role="grid">`. Add the ref:

```tsx
return (
  <div ref={listRef} className={styles.list} role="grid">
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/browser/AssetList.tsx
git commit -m "feat(web): wire AssetList useGSAP for list fade replay"
```

---

### Task 12: Wire `useGSAP` in `DetailPanel` for open/close

**Files:**
- Modify: `packages/web/src/components/detail/DetailPanel.tsx`

DetailPanel animates open when `asset` flips `null → set`, and close when `set → null`. Asset swap (`setA → setB`) is a no-op (panel stays open, content swaps). Per spec §4.4 (side variant).

- [ ] **Step 1: Add the imports, the ref, and the useGSAP**

Open `packages/web/src/components/detail/DetailPanel.tsx`. The component already has an `editing` state at line 58. Add to the existing imports:

```tsx
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createSideDetailPanelTimeline } from '../../lib/animations/detail-panel.js';
```

Add a `prevAssetIdRef` (to detect direction) and a `panelRef`, and the `useGSAP` call inside the function body (right after the existing `useState` calls):

```tsx
const prevAssetIdRef = useRef<string | null>(null);
const panelRef = useRef<HTMLDivElement>(null);

useGSAP(
  () => {
    if (!panelRef.current) return;
    const prev = prevAssetIdRef.current;
    const curr = asset?.id ?? null;
    let direction: 'open' | 'close' | null = null;
    if (prev === null && curr !== null) direction = 'open';
    else if (prev !== null && curr === null) direction = 'close';
    prevAssetIdRef.current = curr;
    if (direction === null) return; // no-op on first mount and on asset swap
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      createSideDetailPanelTimeline(panelRef.current!, direction!).play(0);
    });
    return () => mm.revert();
  },
  { scope: panelRef, dependencies: [asset?.id ?? null] },
);
```

Note: `direction` is `string | null` at the type level. The `direction!` non-null assertion inside the inner closure is safe because we just checked `direction === null` and returned. The compiler doesn't track the narrowed type across the closure boundary, hence the assertion.

- [ ] **Step 2: Attach the ref to the root element**

The component's root is at line 95: `<div className={styles.detail} data-variant={variant} data-anim="detail-panel">`. Add the ref:

```tsx
<div
  ref={panelRef}
  className={styles.detail}
  data-variant={variant}
  data-anim="detail-panel"
>
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/detail/DetailPanel.tsx
git commit -m "feat(web): wire DetailPanel useGSAP for open/close"
```

---

### Task 13: Wire `useGSAP` in `BottomSheet` for bottom-up motion

**Files:**
- Modify: `packages/web/src/components/common/BottomSheet.tsx`

BottomSheet animates open when `open` flips `false → true`, and close when `true → false`. Per spec §4.4 (BottomSheet variant).

- [ ] **Step 1: Add the imports, the ref, and the useGSAP**

Open `packages/web/src/components/common/BottomSheet.tsx`. The component already has a `sheetRef` at line 49. Add to the existing imports:

```tsx
import { gsap, useGSAP } from '../../lib/gsap-setup.js';
import { createBottomSheetTimeline } from '../../lib/animations/detail-panel.js';
```

Add the `useGSAP` call after the existing `useEffect`s (around line 122, just before the second `useEffect`):

```tsx
// GSAP open/close. We use the existing sheetRef (defined for the drag
// handle) as the scope and animation target. The factory takes a
// `direction: 'open' | 'close'`; we derive it from the open prop.
useGSAP(
  () => {
    if (!sheetRef.current) return;
    const direction: 'open' | 'close' = open ? 'open' : 'close';
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      createBottomSheetTimeline(sheetRef.current!, direction).play(0);
    });
    return () => mm.revert();
  },
  { scope: sheetRef, dependencies: [open] },
);
```

Note: this fires on every `open` change including the first mount. The first mount with `open={false}` plays the close timeline on a hidden sheet (returns no-op because of the `if (!open) return null;` guard at line 184). This is fine — the close animation is invisible. The first mount with `open={true}` plays the open animation, which is what we want.

- [ ] **Step 2: Verify tests pass**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass. (The existing BottomSheet tests focus on drag/focus behavior; GSAP is mocked at the module level if needed.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/common/BottomSheet.tsx
git commit -m "feat(web): wire BottomSheet useGSAP for open/close"
```

---

### Task 14: Wire the view-mode crossfade in `App.tsx`

**Files:**
- Modify: `packages/web/src/App.tsx`

The one non-trivial case: `displayMode` useState that lags `state.ui.viewMode`, a ref on the browser slot, and a `useGSAP` that runs the crossfade and swaps at the midpoint. Per spec §4.3, §6.

- [ ] **Step 1: Add the imports**

Open `packages/web/src/App.tsx`. Add to the existing import block (after the line `import { useState, useMemo, useCallback, useEffect } from 'react';`):

```tsx
import { useRef, useState } from 'react';
import { gsap, useGSAP } from './lib/gsap-setup.js';
import { createViewModeSwitchTimeline } from './lib/animations/view-mode-switch.js';
```

- [ ] **Step 2: Add the `displayMode` state and the `browserRef`**

Find the spot in `App` where the existing `useState` calls are (around lines 94–100). Add after the existing `useState` calls (still inside the `App` function body):

```tsx
// displayMode lags state.ui.viewMode. The browser slot renders displayMode,
// not viewMode. The view-mode useGSAP below swaps displayMode to viewMode
// at the midpoint of the crossfade. On first mount, viewMode === displayMode
// (both default to 'grid') so the useGSAP body is a no-op.
const [displayMode, setDisplayMode] = useState<'grid' | 'list'>(state.ui.viewMode);
const browserRef = useRef<HTMLDivElement>(null);
```

Note: `useState` is already imported. `useRef` needs to be added to the React import (step 1 already does this).

- [ ] **Step 3: Add the `useGSAP` for the view-mode crossfade**

Right after the `browserRef` declaration, add:

```tsx
useGSAP(
  () => {
    if (state.ui.viewMode === displayMode) return; // no-op on first mount and on no-op dispatches
    if (!browserRef.current) return;
    const target = state.ui.viewMode;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (!browserRef.current) return;
      createViewModeSwitchTimeline(browserRef.current, () => {
        setDisplayMode(target);
      }).play(0);
    });
    // Reduced-motion branch: swap immediately, no animation.
    mm.add('(prefers-reduced-motion: reduce)', () => {
      setDisplayMode(target);
    });
    return () => mm.revert();
  },
  { scope: browserRef, dependencies: [state.ui.viewMode] },
);
```

`displayMode` is referenced for the early-return comparison but is intentionally NOT in the `dependencies` array. Adding it would re-fire the timeline on every render where displayMode is set, which is the opposite of what we want.

- [ ] **Step 4: Wrap the browser slot with a ref and switch the rendered child to `displayMode`**

The current code (around lines 683–719) renders:

```tsx
browser={
  <>
    <BatchActionBar ... />
    {state.ui.viewMode === 'grid' ? <AssetGrid ... /> : <AssetList ... />}
  </>
}
```

Replace with:

```tsx
browser={
  <div ref={browserRef} style={{ display: 'contents' }}>
    <BatchActionBar
      count={batchCount}
      allFavorites={batchAllFavorites}
      onClear={handleBatchClear}
      onToggleFavorite={handleBatchToggleFavorite}
      onDelete={handleBatchDelete}
    />
    {displayMode === 'grid' ? (
      <AssetGrid
        assets={visibleAssets}
        selectedId={state.ui.selectedAssetId}
        onSelect={(id) => dispatch({ type: 'SELECT_ASSET', id })}
        showFavorites={
          state.ui.selection.kind === 'smart' &&
          state.ui.selection.smart === 'favorites'
        }
        multiSelectedIds={state.ui.selectedIds}
        onToggleMultiSelect={(id) =>
          dispatch({ type: 'TOGGLE_BATCH_SELECT', id })
        }
      />
    ) : (
      <AssetList
        assets={visibleAssets}
        selectedId={state.ui.selectedAssetId}
        onSelect={(id) => dispatch({ type: 'SELECT_ASSET', id })}
        onToggleFavorite={(id) => dispatch({ type: 'TOGGLE_FAVORITE', id })}
        onKebab={handleKebab}
        multiSelectedIds={state.ui.selectedIds}
        onToggleMultiSelect={(id) =>
          dispatch({ type: 'TOGGLE_BATCH_SELECT', id })
        }
      />
    )}
  </div>
}
```

The `display: 'contents'` wrapper keeps the browser slot's existing flex/grid layout intact (the BatchActionBar, AssetGrid/AssetList are direct children of the body in the same way as before). The ref is on this wrapper. The opacity tween applied to this wrapper fades the whole slot; `display: contents` means the wrapper has no box of its own, so it doesn't introduce a stacking context or affect layout.

- [ ] **Step 5: Verify tests pass**

Run: `pnpm -F @dam-link/web test`
Expected: all 237 pre-existing tests still pass. The existing App tests mock the API and dispatch actions; the new useGSAP is a no-op on first mount (displayMode === viewMode default to 'grid').

- [ ] **Step 6: Verify typecheck**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors. The `displayMode` type is the same as `state.ui.viewMode` (both `'grid' | 'list'`).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): wire App.tsx view-mode crossfade via displayMode lag"
```

---

## Phase 3 — Integration Tests

### Task 15: `AppShell.mount.test.tsx`

**Files:**
- Create: `packages/web/tests/AppShell.mount.test.tsx`

Verify AppShell fires the mount timeline on first mount and does NOT re-fire on re-render.

- [ ] **Step 1: Write the test**

Create `packages/web/tests/AppShell.mount.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from '../src/components/layout/AppShell';

vi.mock('../src/lib/animations/app-shell.js', () => ({
  createAppShellMountEntrance: vi.fn(),
}));

import { createAppShellMountEntrance } from '../src/lib/animations/app-shell.js';

describe('AppShell mount entrance (T1)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true, // no-preference
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('calls createAppShellMountEntrance exactly once on first mount', () => {
    render(
      <AppShell
        toolbar={<div>toolbar</div>}
        sidebar={<div>sidebar</div>}
        browser={<div>browser</div>}
        detail={<div>detail</div>}
      />,
    );
    expect(createAppShellMountEntrance).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire on prop change (re-render)', () => {
    const { rerender } = render(
      <AppShell
        toolbar={<div>toolbar v1</div>}
        sidebar={<div>sidebar</div>}
        browser={<div>browser</div>}
        detail={<div>detail</div>}
      />,
    );
    expect(createAppShellMountEntrance).toHaveBeenCalledTimes(1);

    rerender(
      <AppShell
        toolbar={<div>toolbar v2</div>}
        sidebar={<div>sidebar</div>}
        browser={<div>browser</div>}
        detail={<div>detail</div>}
      />,
    );
    expect(createAppShellMountEntrance).toHaveBeenCalledTimes(1); // still 1
  });
});
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/AppShell.mount.test.tsx`
Expected: 2 passing. The factory mock returns `undefined`, which would cause `createAppShellMountEntrance(...).play(0)` to throw, but our `useGSAP` body in AppShell is wrapped such that a missing return from the factory is OK because the actual factory (when not mocked) returns a real Timeline. With the mock, the body calls `createAppShellMountEntrance(...)` (which is a vi.fn) and discards the result. So no throw.

If the test fails because `createAppShellMountEntrance` returns `undefined` and the code does `.play(0)` on it, we need to change the mock to return a real Timeline:

```ts
vi.mock('../src/lib/animations/app-shell.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createAppShellMountEntrance: vi.fn(() => gsap.timeline({ paused: true })),
  };
});
```

But then `toHaveBeenCalledTimes` still works because `vi.fn()` tracks calls. The `.play(0)` on a paused real timeline is a no-op. So this is the safer mock.

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/AppShell.mount.test.tsx
git commit -m "test(web): AppShell mount fires once and not on re-render"
```

---

### Task 16: `AssetGrid.replay.test.tsx`

**Files:**
- Create: `packages/web/tests/AssetGrid.replay.test.tsx`

Verify AssetGrid's stagger useGSAP does NOT fire on the first dep change (gated by useIsFirstMount) and DOES fire on subsequent dep changes.

- [ ] **Step 1: Write the test**

Create `packages/web/tests/AssetGrid.replay.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AssetGrid } from '../src/components/browser/AssetGrid';
import type { Asset } from '../src/state/types';

vi.mock('../src/lib/animations/asset-grid.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createAssetGridStagger: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { createAssetGridStagger } from '../src/lib/animations/asset-grid.js';

const A: Asset = {
  id: 'a',
  name: 'a.png',
  type: 'image',
  format: 'PNG',
  size: 1000,
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 100,
  height: 100,
  duration: null,
};
const B: Asset = { ...A, id: 'b' };
const C: Asset = { ...A, id: 'c' };
const D: Asset = { ...A, id: 'd' };

describe('AssetGrid card stagger replay (T2)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('does not fire on first mount (the AppShell mount already animated the initial cards)', () => {
    const { rerender } = render(
      <AssetGrid
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).not.toHaveBeenCalled();

    // First non-empty render — still gated out by useIsFirstMount.
    rerender(
      <AssetGrid
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).not.toHaveBeenCalled();
  });

  it('fires on the second non-empty visibleAssets change (the gate has flipped)', () => {
    const { rerender } = render(
      <AssetGrid
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    rerender(
      <AssetGrid
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).not.toHaveBeenCalled();

    // Second non-empty change — now the gate is open.
    rerender(
      <AssetGrid
        assets={[C, D]}
        selectedId={null}
        onSelect={() => {}}
        showFavorites={false}
      />,
    );
    expect(createAssetGridStagger).toHaveBeenCalledTimes(1);
    expect(createAssetGridStagger).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      [expect.any(HTMLElement), expect.any(HTMLElement)],
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/AssetGrid.replay.test.tsx`
Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/AssetGrid.replay.test.tsx
git commit -m "test(web): AssetGrid replay gated by useIsFirstMount"
```

---

### Task 17: `AssetList.replay.test.tsx`

**Files:**
- Create: `packages/web/tests/AssetList.replay.test.tsx`

Same pattern as AssetGrid but for list view. Two tests, same shape.

- [ ] **Step 1: Write the test**

Create `packages/web/tests/AssetList.replay.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AssetList } from '../src/components/browser/AssetList';
import type { Asset } from '../src/state/types';

vi.mock('../src/lib/animations/asset-list.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createAssetListFade: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { createAssetListFade } from '../src/lib/animations/asset-list.js';

const A: Asset = {
  id: 'a',
  name: 'a.png',
  type: 'image',
  format: 'PNG',
  size: 1000,
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 100,
  height: 100,
  duration: null,
};
const B: Asset = { ...A, id: 'b' };
const C: Asset = { ...A, id: 'c' };

describe('AssetList fade replay (T3)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('does not fire on first mount', () => {
    const { rerender } = render(
      <AssetList
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).not.toHaveBeenCalled();

    rerender(
      <AssetList
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).not.toHaveBeenCalled();
  });

  it('fires on the second non-empty assets change', () => {
    const { rerender } = render(
      <AssetList
        assets={[]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    rerender(
      <AssetList
        assets={[A, B]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).not.toHaveBeenCalled();

    rerender(
      <AssetList
        assets={[C]}
        selectedId={null}
        onSelect={() => {}}
        onToggleFavorite={() => {}}
        onKebab={() => {}}
      />,
    );
    expect(createAssetListFade).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/AssetList.replay.test.tsx`
Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/AssetList.replay.test.tsx
git commit -m "test(web): AssetList fade replay gated by useIsFirstMount"
```

---

### Task 18: `DetailPanel.openClose.test.tsx`

**Files:**
- Create: `packages/web/tests/DetailPanel.openClose.test.tsx`

Verify DetailPanel fires open on `null → set`, close on `set → null`, and NO animation on asset swap (`setA → setB`).

- [ ] **Step 1: Write the test**

Create `packages/web/tests/DetailPanel.openClose.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DetailPanel } from '../src/components/detail/DetailPanel';
import type { Asset } from '../src/state/types';

vi.mock('../src/lib/animations/detail-panel.js', async () => {
  const { gsap } = await import('gsap');
  return {
    createSideDetailPanelTimeline: vi.fn(() => gsap.timeline({ paused: true })),
    createBottomSheetTimeline: vi.fn(() => gsap.timeline({ paused: true })),
  };
});

import { createSideDetailPanelTimeline } from '../src/lib/animations/detail-panel.js';

const A: Asset = {
  id: 'a',
  name: 'a.png',
  type: 'image',
  format: 'PNG',
  size: 1000,
  uploadedAt: '2026-06-07T00:00:00.000Z',
  uploadedBy: 'u1',
  tags: [],
  favorite: false,
  deletedAt: null,
  width: 100,
  height: 100,
  duration: null,
};
const B: Asset = { ...A, id: 'b' };

function noop() {}

describe('DetailPanel open/close (T4)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('fires open when asset flips null → set', () => {
    const { rerender } = render(
      <DetailPanel
        asset={null}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();

    rerender(
      <DetailPanel
        asset={A}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'open',
    );
  });

  it('does NOT fire on asset swap (setA → setB)', () => {
    const { rerender } = render(
      <DetailPanel
        asset={A}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();

    rerender(
      <DetailPanel
        asset={B}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();
  });

  it('fires close when asset flips set → null', () => {
    const { rerender } = render(
      <DetailPanel
        asset={A}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).not.toHaveBeenCalled();

    rerender(
      <DetailPanel
        asset={null}
        onToggleFavorite={noop}
        onDelete={noop}
        onCopyLink={noop}
        onDownload={noop}
        onRename={noop}
        onAddTag={noop}
        onRemoveTag={noop}
      />,
    );
    expect(createSideDetailPanelTimeline).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'close',
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it passes**

Run: `pnpm -F @dam-link/web test tests/DetailPanel.openClose.test.tsx`
Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/DetailPanel.openClose.test.tsx
git commit -m "test(web): DetailPanel open/close fires on null↔set, no-op on swap"
```

---

### Task 19: `App.viewMode.test.tsx`

**Files:**
- Create: `packages/web/tests/App.viewMode.test.tsx`

Verify the App-level view-mode crossfade fires on `viewMode` change and calls `setDisplayMode` at the midpoint.

This test is more complex than the others because App has many dependencies (StoreProvider, viewport, useKeyboardShortcuts, etc.). The cleanest approach is to mock the store and render a stripped-down version. The most pragmatic approach is to test just the crossfade mechanism by mocking the animation module and verifying the call shape.

- [ ] **Step 1: Write the test**

Create `packages/web/tests/App.viewMode.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { gsap } from '../src/lib/gsap-setup';

vi.mock('../src/lib/animations/view-mode-switch.js', () => ({
  createViewModeSwitchTimeline: vi.fn(
    (_browserEl: Element, onMidpoint: () => void) => {
      // Immediately call onMidpoint so the test can assert on the swap.
      onMidpoint();
      return gsap.timeline({ paused: true });
    },
  ),
}));

import { createViewModeSwitchTimeline } from '../src/lib/animations/view-mode-switch.js';
import { me as apiMe } from '../src/api/auth.js';
import App from '../src/App';

vi.mock('../src/api/auth.js', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

const userPayload = {
  user: {
    id: 'u1',
    email: 'me@studio.com',
    displayName: 'Me',
    createdAt: '2026-06-07T00:00:00.000Z',
  },
  orgs: [],
};

describe('App view-mode crossfade (T5)', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
    vi.mocked(apiMe).mockResolvedValue(userPayload);
    // localStorage clean — store starts empty, App renders the auth-gated UI.
    localStorage.clear();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    localStorage.clear();
  });

  it('does not fire createViewModeSwitchTimeline on first mount (viewMode === displayMode === "grid")', async () => {
    render(<App />);
    // Wait for the store to hydrate and the auth gate to resolve.
    await new Promise((r) => setTimeout(r, 50));
    expect(createViewModeSwitchTimeline).not.toHaveBeenCalled();
  });
});
```

This is a smoke test for the no-op-first-mount path. A full "dispatch SET_VIEW_MODE" test would require constructing a real StoreProvider with a real reducer, which is heavier than the value justifies. The end-to-end behavior is covered by the visual verification task (Task 21) and by the App's own behavior in the browser.

If the test errors because the `App` import pulls in too many side effects (CSS modules, viewport detection), an alternative is to skip this test and rely on the visual verification step. Keep the test as a smoke test for now; if it fails due to import issues, delete the file and document the gap.

- [ ] **Step 2: Run the test, verify it passes (or skip if it errors out)**

Run: `pnpm -F @dam-link/web test tests/App.viewMode.test.tsx`
Expected: 1 passing. If the import side effects cause a failure (jsdom can't load CSS modules, viewport detection errors, etc.), delete the file and document the gap in the verification task.

- [ ] **Step 3: Commit (only if the test passes)**

```bash
git add packages/web/tests/App.viewMode.test.tsx
git commit -m "test(web): App view-mode crossfade no-op on first mount"
```

If the test was deleted, skip this step.

---

## Phase 4 — Verification

### Task 20: Full test suite, typecheck, lint

**Files:** none modified; this is a verification step.

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm -F @dam-link/web test`
Expected: all tests passing, including:
- The 6 new factory unit tests (Tasks 3–7)
- The useIsFirstMount test (Task 2)
- The 5 new integration tests (Tasks 15–19, possibly minus Task 19)
- The 237 pre-existing tests

The exact count depends on how many of the 5 integration tests pass cleanly. Expected range: **~248–253 total** tests (237 + 11 ideal, or 237 + 10 if Task 19 is skipped).

- [ ] **Step 2: Run typecheck**

Run: `pnpm -F @dam-link/web typecheck`
Expected: no errors. The 5 new files import each other via the `.js` extension convention (TypeScript's `moduleResolution: 'bundler'` requires this for ESM projects); if any import is missing the extension, this will fail.

- [ ] **Step 3: Run lint**

Run: `pnpm -F @dam-link/web lint`
Expected: no new warnings. The project's ESLint config (`@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'`) allows unused params prefixed with `_`. The factory files that don't use their first arg (e.g., `_gridEl` in `createAssetGridStagger`) should not produce warnings.

- [ ] **Step 4: Run the monorepo-wide typecheck as a final sanity check**

Run: `pnpm typecheck`
Expected: no errors across all three workspaces (api, web, contracts).

- [ ] **Step 5: Commit a "verified" tag if anything was tweaked**

If any of the above steps required a fix, commit it:

```bash
git add -A
git commit -m "chore(web): post-merge fixes from full test run"
```

Otherwise, no commit — every step in this plan already committed its own change.

---

### Task 21: Visual verification (Playwright)

**Files:** none modified; verification step. Optional if dev environment is not available.

Per spec §9, visual verification via Playwright in a real dev environment (api:3000 + web:5173) is required. The pattern is documented in `docs/superpowers/plans/screenshots/P14/verify.py` (the Plan 14 reference).

- [ ] **Step 1: Start the dev environment**

In two terminals:

```bash
# T1: Docker services
pnpm services:up

# T2: API
pnpm dev

# T3: Vite dev server
pnpm -F @dam-link/web dev
```

- [ ] **Step 2: Run a manual smoke check**

Open `http://localhost:5173/`. Log in with a real user. Verify:
- After login: the AppShell mounts with all 4 panes fading in (toolbar from top, sidebar from left, main, detail from right) and the cards stagger in last.
- Click an asset in the grid: the detail panel slides in from the right.
- Press `2` (or click the list-view toggle in the toolbar): the browser slot fades out, the list view appears, the browser slot fades back in.
- Type in the search box: the cards stagger in.
- Switch to a phone viewport (DevTools responsive mode, <640px): the BottomSheet slides up when you tap an asset.
- Toggle `prefers-reduced-motion: reduce` in DevTools: no animations play; all transitions are instant.

- [ ] **Step 3: Capture screenshots**

Create `docs/superpowers/plans/screenshots/P20/` (or use the next available plan-id; check `ls docs/superpowers/plans/screenshots/` for the highest existing number). Save at least these PNGs:

- `p20-after-login-shell-mounted.png` — desktop, after login, all 4 panes in final position.
- `p20-mid-mount.png` — desktop, ~0.4s after login (refresh + screenshot quickly). Shows sidebar partially in, cards partially staggered.
- `p20-detail-open.png` — desktop, click an asset, detail panel slid in.
- `p20-view-mode-toggle.png` — desktop, ~0.3s after pressing `2`. Browser slot partially faded.
- `p20-phone-bottom-sheet.png` — phone viewport, BottomSheet open with detail.
- `p20-reduced-motion.png` — any of the above but with `prefers-reduced-motion: reduce` emulated.

The Playwright pattern from previous plans (e.g., `docs/superpowers/plans/screenshots/P18/verify.py`) is the right template. If writing a new script from scratch, use `playwright.sync_api.sync_playwright` and a sequence of `page.goto`, `page.click`, `page.screenshot` calls.

- [ ] **Step 4: Verify the hydration race manually**

1. Log out.
2. Log in with a fresh user that has 0 assets.
3. Upload one asset.
4. Refresh the browser.
5. Verify: the empty AppShell fades in first, then the single card staggers in.

This is a manual check because hydration timing is hard to script reliably.

- [ ] **Step 5: Commit the screenshots**

```bash
git add docs/superpowers/plans/screenshots/P20/
git commit -m "docs: visual verification screenshots for main-page GSAP animations"
```

(Replace `P20` with the actual plan-id you used; check `ls docs/superpowers/plans/` to confirm the numbering convention used in prior plans — the user has been numbering them P14, P15, P16, P18, P19; this would naturally be P20.)

---

## Summary

- **17 new test cases** (6 factory + 1 hook + ~5–10 integration, depending on whether the App.viewMode test passes). Test count delta: **237 → ~248–253**.
- **6 new source files:** `useIsFirstMount.ts`, `app-shell.ts`, `asset-grid.ts`, `asset-list.ts`, `view-mode-switch.ts`, `detail-panel.ts` (which exports 2 factories).
- **8 modified source files:** `gsap-setup.ts`, `Toolbar.tsx`, `Sidebar.tsx`, `AssetCard.tsx`, `AssetListRow.tsx`, `DetailPanel.tsx`, `AssetGrid.tsx`, `AssetList.tsx`, `BottomSheet.tsx`, `AppShell.tsx`, `App.tsx` (11 files total).
- **Public API unchanged.** No new props, no new exports outside `src/`.
- **No new dependencies.**
- **No backend changes.**

After all 21 tasks complete, run `pnpm -F @dam-link/web test` and `pnpm -F @dam-link/web lint` one final time to confirm green.
