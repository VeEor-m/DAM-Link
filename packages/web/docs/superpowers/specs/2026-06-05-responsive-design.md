# DAM-Link Responsive Design — 2026-06-05

> **Scope:** Add screen-size adaptation to DAM-Link, replacing the locked decision #13 (desktop-only ≥1024px) with a 4-tier responsive layout.
> **Supersedes:** Decision #13 from the 16-round grill (CLAUDE.md / MEMORY.md).
> **Status:** Spec — pending user review before writing the implementation plan.

---

## 1. Motivation

The current app is desktop-only (≥1024px). Below 1024px, `global.css` shows a "请使用更大屏幕" fallback. The user wants to overturn this and let the app work on phones, tablets, and large monitors. The current 3-pane layout (`Sidebar | Browser | Detail` at fixed 160px / flex / 200px) doesn't adapt.

---

## 2. Goals & non-goals

**Goals**
- The app is usable on screens from 320px (small phone) to 1920px+ (wide desktop).
- Same feature surface (upload, search, filter, favorite, trash, context menu) at every breakpoint.
- Touch and keyboard both work; gestures complement the visible UI rather than replace it.
- No regression on the current 1024-1280px desktop experience.

**Non-goals**
- No new data model fields (description, EXIF, etc.).
- No new persistence format; existing localStorage data is untouched.
- No backend changes; the spec'd `/api/v1/*` contract is independent.
- No native app wrapping (PWA / Capacitor) — web only.
- No internationalization changes.

---

## 3. Breakpoints

| Tier    | Width range   | Layout                                                       |
|---------|---------------|--------------------------------------------------------------|
| phone   | ≤ 640px       | Toolbar (☰ + search + view + upload) / main only / **bottom sheet** for detail |
| tablet  | 641–1023px    | Toolbar (☰ + search + view + upload) / main 60% + **side detail 40%** / sidebar in drawer |
| desktop | 1024–1280px   | Current 3-pane (sidebar 160 / main flex / detail 200)         |
| wide    | > 1280px      | 3-pane with wider sidebar (200), wider detail (320), bigger grid cards (140px min) |

Breakpoints are detected by `useViewport()` reading `window.innerWidth` and writing `body[data-viewport]`. All layout logic in CSS uses the attribute selector `[data-viewport="phone"] .body { ... }`.

**First-paint:** `useState` init reads `window.innerWidth` synchronously, so the first render has the correct viewport. No flash of wrong layout. (No SSR — Vite SPA, so no hydration mismatch risk.)

---

## 4. Design decisions (locked)

| # | Decision       | Choice                                                                |
|---|----------------|-----------------------------------------------------------------------|
| 1 | Phone layout   | **A** — Drawer + bottom sheet                                          |
| 2 | Tablet layout  | **A2** — Drawer + side detail panel                                    |
| 3 | Sheet behavior | **B1** — Peek at 50% default, drag handle to 90%                       |
| 4 | List on small  | **L3** — Stacked card list (each row a horizontal card)                |
| 5 | Wide screen    | **W3** — Comprehensive (wider sidebar + detail + bigger grid cards)    |
| 6 | Touch menu     | **T2** — Always-visible ⋮ button (no long-press)                       |

## 5. Edge decisions (locked)

| # | Decision                                                       |
|---|----------------------------------------------------------------|
| E1 | Phone sheet persists across selections (content swaps)         |
| E2 | Phone drawer closes on Sidebar selection                        |
| E3 | Tablet side detail persists across selections                  |
| E4 | Upload button stays in toolbar (no FAB)                          |
| E5 | Search stays visible on phone (compact placeholder)              |
| E6 | Stacked card row: ⋮ top-right                                   |
| E7 | Wide detail: larger preview, full tag chips, larger font (no new fields) |
| E8 | First-paint viewport via `useState` init (sync `window.innerWidth`) |

---

## 6. New components

### 6.1 `<Drawer>` (`src/components/common/Drawer.tsx`)

Slide-in overlay from `left` or `right`. Used for the phone/tablet sidebar and the tablet side detail.

```ts
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  width?: string;          // CSS length, default '280px'
  label: string;           // aria-label
  children: ReactNode;
}
```

Behavior:
- Renders via `createPortal(..., document.body)`.
- When `open=false`, returns `null` (so the off-viewport slot is unmounted).
- Backdrop with `onClick={onClose}`; clicking inside the drawer does not close.
- `role="dialog"`, `aria-modal="true"`, focus trap (Tab/Shift+Tab), Esc closes.
- `transition: transform var(--motion-normal)` for slide-in.
- Closes on Escape with `e.stopImmediatePropagation()` (same pattern as Modal, C1 fix).

### 6.2 `<BottomSheet>` (`src/components/common/BottomSheet.tsx`)

Bottom-anchored sheet with two snap points (`peek` and `expanded`) and a drag handle.

```ts
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  peekHeight?: string;     // default '50%'
  expandedHeight?: string; // default '90%'
  label: string;
  children: ReactNode;
}
```

Behavior:
- `createPortal` to `document.body`.
- Drag handle at top: pointer events track vertical drag; release snaps to nearest of `peek` / `expanded` / `closed`.
- `transform: translateY(...)` based on snap, not height animation (smoother).
- `role="dialog"`, `aria-modal="true"`, focus trap, Esc closes.
- Backdrop click closes.
- If user drags below 20% of viewport, sheet closes on release.
- Body scroll lock while open (preserve scroll position on close).

### 6.3 `<StackedCardList>` (`src/components/browser/StackedCardList.tsx`)

L3 list view for phone. Each row is a horizontal card, not a dense grid row.

```ts
interface StackedCardListProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onKebab: (asset: Asset, anchor: HTMLElement) => void;
}
```

Row layout: 40px thumb | name + 2 meta lines (size, type) | ⋮ top-right | favorite star below kebab (T2 always visible).

Selection ring uses `var(--color-border-info)` (same as desktop).

### 6.4 `useViewport` (`src/hooks/useViewport.ts`)

```ts
type Viewport = 'phone' | 'tablet' | 'desktop' | 'wide';

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => computeVp(window.innerWidth));
  useEffect(() => {
    const onResize = () => setVp(computeVp(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { document.body.dataset.viewport = vp; }, [vp]);
  return vp;
}
function computeVp(w: number): Viewport {
  if (w <= 640) return 'phone';
  if (w <= 1023) return 'tablet';
  if (w <= 1280) return 'desktop';
  return 'wide';
}
```

`resize` fires rarely; no debounce needed.

---

## 7. Modified components

| Component | Change                                                                                  |
|-----------|-----------------------------------------------------------------------------------------|
| `AppShell.tsx` + `.module.css` | Add `data-viewport` to inner `.body`; CSS grid template responds to `body[data-viewport]` attribute. No JS layout logic. |
| `App.tsx`                       | Call `useViewport()`. Render Sidebar in **two slots** (nav for desktop/wide; Drawer for phone/tablet). Render DetailPanel in **two slots** (side panel for tablet/desktop/wide; BottomSheet for phone). Add local `useState` for `sidebarOpen`, `sheetOpen`. |
| `Toolbar.tsx` + `.module.css`   | Add `compact` prop: on phone/tablet, filter button is replaced with ☰ hamburger that opens sidebar drawer. View toggle stays. Search input has shorter placeholder on compact. |
| `Sidebar.tsx` + `.module.css`   | No structural change. CSS adds padding/sizing tweaks via the parent's `data-viewport`. |
| `DetailPanel.tsx`               | Add `variant: 'side' \| 'sheet'` prop. Sheet variant moves the close button to the drag-handle area instead of top-left (so the drag handle is at the visual top of the sheet). |
| `AssetCard.tsx` + `.module.css` | Always render the ⋮ button (T2). Wrap existing `:hover` styles in `@media (hover: hover)` so touch devices don't get stuck hover states. |
| `AssetListRow.tsx` + `.module.css` | Same as AssetCard — always-visible ⋮ + `hover: hover` media query. |
| `AssetList.tsx`                 | When viewport is `phone`, render `<StackedCardList>` instead of the current 10-column grid. Otherwise unchanged. |
| `tokens.css`                    | Add: `--layout-sidebar-width-wide: 200px`, `--layout-detail-width-wide: 320px`, `--layout-grid-min-card-wide: 140px`, `--touch-target-min: 44px`. |
| `global.css`                    | Remove the `@media (max-width: 1023px) .app-root { display: none }` and `.fallback-narrow` block. Remove `.fallback-narrow` div from App.tsx. |
| `state/types.ts`                | **No change.** `viewport` is derived, not stored. |
| `state/store.tsx`               | **No change.** |

---

## 8. State changes

**None in `AppState`.** `viewport` is derived; drawer/sheet open state is local `useState` in `App.tsx`. Persisted state shape is unchanged. `isAppState()` validator is unchanged. `persistence.ts` is unchanged.

---

## 9. Touch & accessibility

- **Pointer events** for drag (BottomSheet) and tap (everywhere). No separate `touchstart`/`touchend` handlers.
- **Touch targets** ≥ 44×44px enforced via `--touch-target-min` token; applied via `min-width`/`min-height` on `button` in tokens.
- **Hover** styles wrapped in `@media (hover: hover)` (matches modern CSS) so touch devices don't get stuck hover styles.
- **Focus trap** + `aria-modal` + `aria-label` on Drawer and BottomSheet (reusing the Modal pattern from C1).
- **Keyboard shortcuts** (`useKeyboardShortcuts`) continue to work. On iPad with attached keyboard, `/`, `↑↓`, `Esc`, `F`, `Delete`, `1`/`2`, `?` all function. The keymap description for Escape is updated to say "清除搜索或取消选择 / 关闭 Sheet" (or similar) to reflect that Escape also closes drawer/sheet.
- **`prefers-reduced-motion`**: BottomSheet drag transitions respect the existing `global.css` rule that already kills animations when reduced motion is requested.

---

## 10. Testing

New unit tests (Vitest + Testing Library, in `tests/`):

| File | Cases |
|------|-------|
| `useViewport.test.ts`         | All 4 boundaries (639→640, 640→641, 1023→1024, 1280→1281, 1281→1280). `data-viewport` set on body. Cleanup on unmount. |
| `Drawer.test.tsx`              | Opens/closes, click backdrop closes, Esc closes, focus trap, no close on inner click, `aria-modal` set, slide transition class applied. |
| `BottomSheet.test.tsx`         | Opens/closes, drag handle drag past 20% closes, snap to peek/expanded on release, Esc closes, focus trap, body scroll lock. |
| `StackedCardList.test.tsx`     | Renders rows, kebab visible without hover, click kebab fires `onKebab`, click row fires `onSelect`, selected state styling. |
| **Regression**: existing tests | All 13 test files / 85 tests must still pass. The `tests/DetailPanel.test.tsx` adds a case for `variant: 'sheet'`. |

**Visual QA** (manual, not automated): dev-server walkthrough at 375 / 768 / 1100 / 1440 / 1920 widths, plus portrait↔landscape rotation on tablet.

---

## 11. Migration & rollout

- **No data migration.** State shape is unchanged.
- **No CSS reset.** `global.css` is edited in place.
- **No router changes.** Drawer / Sheet are components, not routes. Browser back button does not close them.
- **Default for users on the current 1024-1280px desktop:** visual identity unchanged. They see the same 3-pane.
- **Deployment:** single normal release. No feature flag needed (no gradual rollout planned).

---

## 12. Risks

| Risk                                                                  | Mitigation                                                                 |
|-----------------------------------------------------------------------|----------------------------------------------------------------------------|
| BottomSheet drag math jittery on real touch devices                   | Use `transform: translateY` not `height` animation. Snap with velocity threshold. Test with pointer events. |
| Resize during drag leaves sheet in mid-state                          | On resize, snap to nearest of peek/expanded based on current viewport.     |
| Body scroll lock interacts badly with the open Modal (filter panel)   | Modal is rendered above the sheet; only one scroll-lock active at a time.  |
| jsdom doesn't support `pointer*` events by default                    | Use `fireEvent.pointerDown/Move/Up` (already used in ContextMenu tests).   |
| First-paint: `window.innerWidth` differs between SSR / client         | Vite SPA, no SSR. Not a risk.                                              |
| Wide-screen detail panel re-arrangement causes CLS                    | Use CSS Grid templates; no JS-driven sizing; the page doesn't reflow.      |

---

## 13. Out of scope (deferred)

- **More hardcoded colors** still in `Toast.module.css`, `UploadDialog.module.css:20`, `AssetCard.module.css:61,71` — the deferred token-pass from the code review 2026-06-04.
- **PWA / installable / offline** — separate spec.
- **Drag-to-reorder assets / folders** — out of scope, the data model has no folder hierarchy.
- **EXIF / image metadata display** — requires new Asset fields, out of scope.
- **Tablet split-view** (iPadOS Stage Manager) — Vite SPA renders one window; multi-window needs native wrappers.
- **RTL languages** — out of scope until i18n work begins.

---

## 14. File inventory (change summary)

**New files (8):**
- `src/components/common/Drawer.tsx` + `Drawer.module.css`
- `src/components/common/BottomSheet.tsx` + `BottomSheet.module.css`
- `src/components/browser/StackedCardList.tsx` + `StackedCardList.module.css`
- `src/hooks/useViewport.ts`
- `tests/Drawer.test.tsx`
- `tests/BottomSheet.test.tsx`
- `tests/StackedCardList.test.tsx`
- `tests/useViewport.test.ts`

**Modified files (~12):**
- `src/components/layout/AppShell.tsx` + `AppShell.module.css`
- `src/components/toolbar/Toolbar.tsx` + `Toolbar.module.css`
- `src/components/sidebar/Sidebar.module.css` (small touch)
- `src/components/detail/DetailPanel.tsx` + `DetailPanel.module.css` (variant prop)
- `src/components/browser/AssetCard.tsx` + `AssetCard.module.css` (always-visible ⋮, hover guard)
- `src/components/browser/AssetListRow.tsx` + `AssetListRow.module.css` (same)
- `src/components/browser/AssetList.tsx` (router to StackedCardList on phone)
- `src/App.tsx` (useViewport, two-slot Sidebar, two-slot DetailPanel)
- `src/styles/tokens.css` (new layout tokens)
- `src/styles/global.css` (remove fallback message)
- `tests/DetailPanel.test.tsx` (add sheet variant case)
- `docs/code-review-2026-06-04.md` (update N9 follow-up note re: this spec)

**Unchanged:**
- All `src/state/*` files
- `src/components/common/Modal.tsx`, `ContextMenu.tsx`, `ConfirmDialog.tsx`, `ShortcutsHelp.tsx`, `ToastProvider.tsx`, `EmptyState.tsx`
- All existing component tests except `DetailPanel.test.tsx`

---

## 15. Open questions

None at this point. All user-facing decisions are locked in §4 and §5. Implementation-level choices (e.g. snap velocity threshold) are deferred to the implementation plan.
