# Frontend Main-Page GSAP Animations — Design Spec

**Date:** 2026-06-07
**Status:** Approved (pending final user review)
**Scope:** Add GSAP-powered entrance, transition, and open/close animations to the main asset browser page (the post-login `App.tsx` 3-pane shell + its contents). The login screen already has GSAP from Plan 11; this spec extends the same vocabulary to the rest of the UI.

---

## 1. Goals

Make the post-login asset browser feel as deliberate and crafted as the login screen, using the same GSAP setup, the same `useGSAP` lifecycle, the same Editorial/Calm motion vocabulary, and the same data-anim selector pattern. Animations must:

1. Run once on initial mount and on user-initiated state changes, **never** on hydration, on React re-renders, or on hot-module reloads (where avoidable).
2. Respect `prefers-reduced-motion: reduce` via `gsap.matchMedia()` — when reduce-motion is on, every animation is a no-op and the UI behaves like a static app.
3. Live next to the components whose DOM they touch (no central orchestrator in `App.tsx`).
4. Be unit-testable in isolation: every animation factory takes a DOM element, returns a `gsap.core.Timeline`, and is pure.

## 2. Non-Goals (Out of Scope)

- Page transitions (we have no router; the only "page" is the AppShell, plus the LoginScreen which is already done).
- Scroll-linked animations (no ScrollTrigger).
- Spring physics (no `@gsap/react` or `MotionPathPlugin`).
- A generalized "animation registry" or "animation hooks" library. Five small factory files, period.
- Re-touching LoginScreen or its animations.
- Any backend change. (Pure frontend.)

## 3. Motion Vocabulary

The existing `packages/web/src/lib/gsap-setup.ts` is extended by **one** constant: a new `medium-slow` duration tier for the view-mode crossfade and detail-panel open. Nothing else changes — we deliberately reuse the existing four durations and three easings to stay visually consistent with the login screen.

```ts
// After this plan, GSAP_DURATIONS gains exactly one new entry:
export const GSAP_DURATIONS = {
  slow: 0.8,         // hero elements
  medium: 0.5,       // secondary copy
  fast: 0.35,        // mode-switch sub copy crossfade
  micro: 0.25,       // button/switch fade-in
  'medium-slow': 0.4,// NEW: view-mode crossfade midpoint, detail-panel open
} as const;

export const GSAP_EASING = {
  enter: 'power3.out',
  enterSoft: 'power2.out',
  inOut: 'power2.inOut',
} as const;
```

**Editorial/Calm defaults per surface:**

| Surface | Duration | Easing | Stagger | Motion |
|---|---|---|---|---|
| Toolbar (in) | `slow` (0.8s) | `enter` (power3.out) | — | y -8 → 0, opacity 0 → 1 |
| Sidebar (in) | `medium` (0.5s) | `enter` | — | x -16 → 0, opacity 0 → 1 |
| Main (in) | `medium` (0.5s) | `enterSoft` | — | opacity 0 → 1 |
| Detail (in, frame) | `medium` (0.5s) | `enter` | — | x 16 → 0, opacity 0 → 1 |
| Cards (in) | `medium` (0.5s) | `enterSoft` | 0.05s | y 6 → 0, opacity 0 → 1 |
| Toolbar starts at 0.0s, sidebar 0.0s (parallel), main 0.1s, detail 0.15s, cards 0.3s. | | | | |
| View-mode crossfade (out half) | `medium-slow` (0.4s total: 0.2 + 0.2 split) | `inOut` | — | opacity 1 → 0 then 0 → 1 |
| View-mode crossfade (in half) | `medium-slow` | `inOut` | — | opacity 0 → 1 |
| Detail panel open (side/wide) | `medium-slow` (0.4s) | `enter` | — | x 24 → 0, opacity 0 → 1 |
| Detail panel close (side/wide) | `medium-slow` | `inOut` | — | x 0 → 24, opacity 1 → 0 |
| BottomSheet open (phone) | `medium-slow` | `enter` | — | y +100% → 0, opacity 0 → 1 |
| BottomSheet close (phone) | `medium-slow` | `inOut` | — | y 0 → +100%, opacity 1 → 0 |
| List fade | `medium` | `enterSoft` | — | opacity 0 → 1 (whole list, no per-row stagger) |

## 4. The Four Surfaces (and their variants)

The four user-picked surfaces are: **(1) AppShell mount, (2) card stagger when visibleAssets changes, (3) view-mode crossfade, (4) detail panel open/close.** Surfaces 2 and 4 each have a grid/list or desktop/phone variant, both covered below.

### 4.1 AppShell mount entrance (one-time, post-login)

- **File:** `packages/web/src/lib/animations/app-shell.ts`
- **Factory:** `createAppShellMountEntrance(shellEl: Element): gsap.core.Timeline`
- **Returns:** a paused timeline. The caller is responsible for `.play(0)`.
- **Targets (via `data-anim` selectors inside `shellEl`):**
  - `[data-anim="toolbar-row"]` (added by Toolbar.tsx to its root)
  - `[data-anim="sidebar-col"]` (added by Sidebar.tsx to its root)
  - `[data-anim="main"]` (added by AppShell.tsx to its `<main>` slot)
  - `[data-anim="detail-panel"]` (added by DetailPanel.tsx to its root; always present even when `asset={null}`)
  - `[data-anim="card"]` (added by AssetCard inside AssetGrid; optional — if no cards, this step is a no-op)
- **Consumer:** `AppShell.tsx`, with `useGSAP(() => ..., { scope: shellRef, dependencies: [] })` gated on `useIsFirstMount()`. Skips on re-renders.
- **Reduced motion:** the `useGSAP` body is wrapped in `mm.add('(prefers-reduced-motion: no-preference)', () => ...)`. Reduced-motion branch is a no-op.

### 4.2 Card stagger when `visibleAssets` changes (replay on user-initiated changes)

Two variants, same trigger semantics, two factories.

**4.2a Grid mode (per-card stagger):**
- **File:** `packages/web/src/lib/animations/asset-grid.ts`
- **Factory:** `createAssetGridStagger(gridEl: Element, cards: Element[]): gsap.core.Timeline`
- **Motion:** cards y 6 → 0 + opacity 0 → 1, `medium` duration, `enterSoft` easing, **0.05s stagger**.
- **Consumer:** `AssetGrid.tsx`, with `useGSAP(() => ..., { scope: gridRef, dependencies: [visibleAssets] })` gated on `useIsFirstMount()` so the very first invocation (the one that fires on mount) is skipped. Subsequent invocations (search/filter/sidebar click) replay.
- **Why per-card stagger, not whole-grid fade:** a whole-grid fade feels like a single switch. A stagger feels like the user's query is *producing* the result.

**4.2b List mode (whole-list fade):**
- **File:** `packages/web/src/lib/animations/asset-list.ts`
- **Factory:** `createAssetListFade(listEl: Element, rows: Element[]): gsap.core.Timeline`
- **Motion:** whole-list opacity 0 → 1, `medium` duration, `enterSoft`. **No per-row stagger** (a 50-row list staggering at 0.05s is ~2.5s of motion — too slow, and feels broken).
- **Consumer:** `AssetList.tsx`, same pattern as AssetGrid (dependencies on `visibleAssets`, gated by `useIsFirstMount`).

### 4.3 View-mode crossfade (grid ↔ list)

- **File:** `packages/web/src/lib/animations/view-mode-switch.ts`
- **Factory:** `createViewModeSwitchTimeline(browserEl: Element, onMidpoint: () => void): gsap.core.Timeline`
- **Returns:** paused timeline. Caller plays.
- **Motion:** two tweens on the same element.
  - `tween 1` (0 → 0.2s): opacity 1 → 0, `inOut` easing.
  - `tween 2` (0.2s → 0.4s): opacity 0 → 1, `inOut` easing.
  - `.call(onMidpoint, [], '+=0' /* i.e. right before tween 2 */)` at 0.2s — this is the React `setDisplayMode` swap point.
- **Consumer:** `App.tsx`, with a `displayMode` `useState` that lags `state.ui.viewMode`. The browser slot renders `displayMode`, not `viewMode`. The `useGSAP` watches `[state.ui.viewMode]` and fires only when they diverge.
- **Why `displayMode` lag is needed:** React only renders one child at a time (a literal crossfade between two mounted children would require a transition group library or a render prop). The "lag + midpoint swap" pattern gives the same visual with vanilla React + a single `useState`.

### 4.4 Detail panel open/close (desktop/wide/phone)

Two variants, one shared file.

**File:** `packages/web/src/lib/animations/detail-panel.ts` exports **two** factories:

- **`createSideDetailPanelTimeline(panelEl, direction)`** — used by `DetailPanel.tsx` for the desktop/wide right-side column.
  - Motion (open): x 24 → 0 + opacity 0 → 1, `medium-slow`, `enter`.
  - Motion (close): x 0 → 24 + opacity 1 → 0, `medium-slow`, `inOut`.

- **`createBottomSheetTimeline(sheetEl, direction)`** — used by `BottomSheet.tsx` for the phone bottom-up overlay.
  - Motion (open): y +100% → 0 + opacity 0 → 1, `medium-slow`, `enter`.
  - Motion (close): y 0 → +100% + opacity 1 → 0, `medium-slow`, `inOut`.

Both factories return a paused timeline. Both take `direction: 'open' | 'close'`. They are separate functions, not parameterized, because the motion path (horizontal vs vertical), the tween properties (`x` vs `y`+`yPercent`), and the consumer component differ. Splitting them keeps each factory's contract small and testable.

**Consumer (side, desktop/wide):** `DetailPanel.tsx`, with `useGSAP(() => ..., { scope: panelRef, dependencies: [selected?.id ?? null] })`.
  - `null → set` → open.
  - `set → null` → close.
  - `setA → setB` (different asset while panel is open) → no animation (content swap, panel stays open). The factory detects "previous non-null, new non-null" and returns an empty timeline.
  - First mount with `asset={null}` → empty timeline, no-op.

**Consumer (BottomSheet, phone):** `BottomSheet.tsx`, with `useGSAP(() => ..., { scope: sheetRef, dependencies: [open] })`.
  - `false → true` → open.
  - `true → false` → close.
  - First mount with `open={false}` → empty timeline, no-op.

## 5. File Layout

### New files (5 animation factories + 1 hook + 1 spec-implementation note in `useIsFirstMount`)

```
packages/web/src/
  hooks/
    useIsFirstMount.ts                    NEW — returns true once, then false. Gates AppShell mount vs grid card stagger so they don't double-animate.
  lib/
    animations/
      app-shell.ts                        NEW — createAppShellMountEntrance(shellEl)
      asset-grid.ts                       NEW — createAssetGridStagger(gridEl, cards)
      asset-list.ts                       NEW — createAssetListFade(listEl, rows)
      view-mode-switch.ts                 NEW — createViewModeSwitchTimeline(browserEl, onMidpoint)
      detail-panel.ts                     NEW — createSideDetailPanelTimeline(panelEl, dir) + createBottomSheetTimeline(sheetEl, dir)
  tests/
    animations/
      app-shell.test.ts                   NEW
      asset-grid.test.ts                  NEW
      asset-list.test.ts                  NEW
      view-mode-switch.test.ts            NEW
      detail-panel.test.ts                NEW
    hooks/
      useIsFirstMount.test.tsx            NEW
    AppShell.mount.test.tsx               NEW
    AssetGrid.replay.test.tsx             NEW
    AssetList.replay.test.tsx             NEW
    DetailPanel.openClose.test.tsx        NEW
    App.viewMode.test.tsx                 NEW
```

### Modified files

- `packages/web/src/lib/gsap-setup.ts` — add `'medium-slow': 0.4` to `GSAP_DURATIONS`. No other changes.
- `packages/web/src/components/layout/AppShell.tsx` — add `useGSAP` for shell mount; add `data-anim` attrs to its 4 frame containers (`toolbar` slot wrapper, `sidebar` `<nav>`, `main`, `aside`).
- `packages/web/src/components/toolbar/Toolbar.tsx` — add `data-anim="toolbar-row"` to the root element. No animation logic.
- `packages/web/src/components/sidebar/Sidebar.tsx` — add `data-anim="sidebar-col"` to the root element. No animation logic.
- `packages/web/src/components/detail/DetailPanel.tsx` — add `data-anim="detail-panel"` to the root; add `useGSAP` for open/close.
- `packages/web/src/components/browser/AssetGrid.tsx` — add `data-anim="card"` to each `AssetCard`; add `useGSAP` for stagger replay.
- `packages/web/src/components/browser/AssetList.tsx` — add `data-anim="row"` to each `AssetListRow`; add `useGSAP` for replay fade.
- `packages/web/src/components/browser/AssetCard.tsx` — add `data-anim="card"` to its root. No animation logic.
- `packages/web/src/components/browser/AssetListRow.tsx` — add `data-anim="row"` to its root. No animation logic.
- `packages/web/src/components/common/BottomSheet.tsx` — add `useGSAP` for bottom-up motion.
- `packages/web/src/App.tsx` — add `displayMode` `useState`; wrap the browser slot in a `useRef` + `useGSAP` for the crossfade; pass the ref to the slot wrapper.

### Public API

**Unchanged.** `AppShell`, `Toolbar`, `Sidebar`, `DetailPanel`, `AssetGrid`, `AssetList`, `BottomSheet` accept the same props. Animations attach via `data-anim` attributes and `useGSAP` calls inside the components, not via new props.

`useIsFirstMount` is an internal hook, not exported from any package `index`. The 5 new `lib/animations/*.ts` files are not imported by anything outside `src/components/...`.

## 6. Data Flow (the view-mode crossfade, end-to-end)

The other 5 surfaces are straightforward `useGSAP` consumers. The crossfade is the only one that needs explicit `useState` coordination. Walk-through:

1. Initial render: `state.ui.viewMode === 'grid'`, `displayMode` (local state) initialized to `'grid'`. `useGSAP` deps `[state.ui.viewMode]` evaluates `state.ui.viewMode === displayMode` → true → no-op. ✓
2. User presses `2` (or clicks list-view toggle in Toolbar). Toolbar dispatches `SET_VIEW_MODE` → `state.ui.viewMode` becomes `'list'`. App.tsx re-renders.
3. `useGSAP` deps changed → body re-runs. `state.ui.viewMode ('list') !== displayMode ('grid')` → run the timeline. Browser slot fades to opacity 0 over 0.2s.
4. At 0.2s, timeline `.call()` fires `setDisplayMode('list')`. App re-renders. The browser slot now renders `<AssetList>` instead of `<AssetGrid>`. The new child mounts.
5. The new child (`AssetList`) has its own `useGSAP` with deps `[visibleAssets]`. It fires on mount (first dep change). `useIsFirstMount` returns true → skipped.
6. Timeline continues. Browser slot fades from opacity 0 → 1 over 0.2s. The new AssetList becomes visible. The list's own useGSAP didn't run, so no double animation. ✓
7. User searches within list mode. `visibleAssets` changes (new reference from useMemo). `AssetList`'s `useGSAP` deps changed. `useIsFirstMount` returns false → list fade fires. ✓

## 7. Edge Cases (locked-down behavior)

| Edge case | Behavior |
|---|---|
| `prefers-reduced-motion: reduce` | All `useGSAP` bodies are gated by `gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', ...)`. Reduced-motion branch is a no-op. App behaves like a static app. |
| Rapid asset selection (click A, then B before A's open finishes) | `DetailPanel`'s useGSAP watches `[selected?.id]`. The new dep change reverts the previous timeline (gsap.Context revert) and plays the new one. No queue, no overlap. |
| Click an asset while AppShell mount is still playing | Different gsap.Context (different component), so both run in parallel. Visually: the cards are still staggering in while the detail panel slides in from the right. Acceptable, even nice. |
| HMR edit of `AssetGrid.tsx` | AssetGrid re-mounts. Its `useIsFirstMount` resets. The grid's replay useGSAP first invocation (empty→A,B) is skipped by the gate. The user sees a blank flash, not a stagger. Acceptable dev cost. |
| HMR edit of `AppShell.tsx` | AppShell re-mounts. Its `useIsFirstMount` resets. AppShell mount fires again. Acceptable. LoginScreen has the same behavior. |
| Hydration race (store hydrates after `bootstrapped === true`) | AppShell mounts with an empty grid. AppShell mount fires; initial card stagger is a no-op (no cards). Store hydrates → `visibleAssets` changes from `[]` to `[N items]`. AssetGrid's replay useGSAP fires (`useIsFirstMount` is now false) → cards stagger in. Visually: empty grid fades in, then cards stagger in. Acceptable. |
| View mode toggle while a card stagger is in progress | App.tsx's crossfade fades the browser slot to 0. The in-progress card stagger gets parent-multiplied to invisible and the gsap.Context revert cancels it. The new view mounts at the midpoint and fades in with the slot. |
| Browser refresh | `useIsFirstMount` resets (new component instances). All animations fire on first render after login. ✓ |
| View mode toggle in reduced-motion mode | `useGSAP` body never runs. `displayMode` lags `state.ui.viewMode` indefinitely. Visually fine because reduced-motion users want instant transitions. If we want to be defensive, we can add `mm.add('(prefers-reduced-motion: reduce)', () => setDisplayMode(state.ui.viewMode))` to the matchMedia. Trivial. |

## 8. Testing

**Pure factory tests (5 files, ~3 tests each):** one per timeline factory. Mount a jsdom element with the expected `data-anim` attributes, call the factory, assert it returns a `gsap.core.Timeline` with the expected number of tweens. Defensive: assert it doesn't throw on an empty shell.

**Hook test:** `useIsFirstMount` — render N times, assert true on first, false on subsequent.

**Integration tests (4 files, the high-value ones):**

- `tests/AppShell.mount.test.tsx` — mount `<AppShell>` with all 4 `data-anim` containers. Spy on `gsap.timeline()`. Assert: 1 timeline on first render, 0 on re-render.
- `tests/AssetGrid.replay.test.tsx` — mount with `assets=[]`; assert no timeline. Re-render with `assets=[A,B]`; assert still no timeline (first dep change, gated by useIsFirstMount). Re-render with `assets=[C,D]`; assert timeline fires. This proves the gate.
- `tests/DetailPanel.openClose.test.tsx` — mount with `asset={null}`; no timeline. Re-render with `asset={a}`; open timeline. Re-render with `asset={b}`; no timeline (content swap). Re-render with `asset={null}`; close timeline.
- `tests/App.viewMode.test.tsx` — mount `<App>` with mock state, `viewMode='grid'`; assert no crossfade. Dispatch `SET_VIEW_MODE` to `'list'`; assert crossfade timeline fires with a `.call()` at the midpoint. Assert `displayMode` ends up as `'list'` and the rendered child is `<AssetList>`.

**Reduced-motion coverage:** folded into the integration tests by mocking `window.matchMedia` to return `matches: true` for `(prefers-reduced-motion: reduce)`. The existing `matchMedia` shim in `tests/setup.ts` is already mock-able. No new infrastructure.

**What we are NOT testing:**
- The hydration race edge case (hard to simulate reliably; behavior is "good enough" either way).
- HMR behavior (no good Vitest simulation). Documented in §7.

**Test count delta:** ~5 unit (factory) + 1 hook + 4 integration = **~10 new tests**. Web suite goes from 237 → ~247.

## 9. Verification

1. `pnpm -F @dam-link/web test` green. New tests pass; existing tests still pass.
2. `pnpm typecheck` clean.
3. `pnpm -F @dam-link/web lint` clean. No new lint warnings.
4. **Visual verification** via Playwright in a real dev environment (api:3000 + web:5173). Screenshots saved to `docs/superpowers/plans/screenshots/<plan-id>/`:
   - desktop login → after login: shell mounted, all 4 panes in final position
   - mid-mount (e.g. 0.4s after login): sidebar partially in, cards partially staggered
   - desktop: click an asset → detail panel open
   - desktop: view-mode toggle mid-crossfade (e.g. 0.3s after click)
   - phone viewport (<640px): BottomSheet open with detail
   - reduced motion: any of the above but with `prefers-reduced-motion: reduce` emulated — should look identical to "no animation" baseline
5. Verify the hydration race manually: log out, log in with a fresh user that has 0 assets, then upload one, then refresh — cards should appear and stagger in correctly.

## 10. Open Questions

None. All design decisions captured above.
