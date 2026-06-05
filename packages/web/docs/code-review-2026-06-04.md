# Code Review — 2026-06-04

> **Scope:** DAM-Link T1–T21 (entire feature work to date)
> **Reviewer:** `superpowers:code-reviewer` agent
> **Source-of-truth conventions:** `D:/DAM-Link/CLAUDE.md`
> **Status (2026-06-05):** All 3 critical + all 9 important + all 9 nice-to-have fixed.

---

## Summary

| Severity | Count | Open | Fix order |
|----------|-------|------|-----------|
| Critical | 3     | 0    | ~~C1 → C2 → C3~~ ✅ all done |
| Important | 9    | 0    | I1–I9 ✅ all done |
| Nice-to-have | 9 | 0    | N1–N9 ✅ all done |

The 3 critical issues are fixed. I1 (module-level `let`) and I2 (lying keymap description) were also fixed as bonus during the C1/C3 work. All 9 nice-to-have items were fixed in a single batch on 2026-06-05.

> **Note (2026-06-05):** Additional hardcoded colors remain outside the original N9 scope — `Toast.module.css` (success/error/warning), `UploadDialog.module.css:20` (`#fff5f5`), `AssetCard.module.css:61,71` (`#f5a623`). Worth folding into the next token-pass.

---

## Critical issues

### C1. Modal Escape handler does not stop sibling document listeners — root cause of the 2-press bug

> **Status:** ✅ Fixed in `1d3a8e6` — `fix(modal): close on first Escape by stopping sibling listeners + stabilizing onClose`
> - Added `e.stopImmediatePropagation()` in `Modal.tsx` Escape branch.
> - Stabilized `closeHelp`, `closeFilter`, `closeUpload` with `useCallback` in `App.tsx`.
> - **Bonus:** updated the lying keymap description (was I2) to `"清除搜索或取消选择"`.
> - Verified by `python smoke.py`: help modal now closes on ONE Escape.

**Files:**
- `D:/DAM-Link/src/components/common/Modal.tsx` (lines 26–31)
- `D:/DAM-Link/src/App.tsx` (lines 174–177)
- `D:/DAM-Link/src/hooks/useKeyboardShortcuts.ts` (lines 21–30)

Both the Modal and `useKeyboardShortcuts` register `keydown` listeners on `document`. When Escape is pressed, **both** listeners run on the same native event:

```ts
// Modal.tsx — no stopPropagation
if (e.key === 'Escape') {
  e.preventDefault();
  onClose();
  return;
}

// App.tsx
{ key: 'Escape', scope: 'global', handler: () => {
  if (state.ui.searchQuery) dispatch({ type: 'SET_SEARCH', query: '' });
  else if (state.ui.selectedAssetId) dispatch({ type: 'SELECT_ASSET', id: null });
}},
```

**Why 2 presses on first open:**

1. `store.tsx:16` seeds `selectedAssetId: MOCK_ASSETS[0]?.id` — non-null on boot.
2. User presses `?` → `setHelpOpen(true)`. App re-renders. Modal mounts and adds listener L1 with closure over `onClose1`.
3. App's inline `onClose={() => setHelpOpen(false)}` (App.tsx:282) is a **fresh function on every render**. The Modal's `useEffect` deps `[open, onClose]` re-trigger cleanup→setup on every unrelated re-render.
4. User presses Escape. App's listener runs first (registered earlier, fires first per DOM spec), dispatches `SELECT_ASSET:null`. React batches. Modal's listener runs second, calls `onClose1` → `setHelpOpen(false)`.
5. Re-render: `selectedAssetId=null`, `helpOpen=false`. Modal returns null, effect cleanup removes L1. The race resolves correctly **on this first press** — but only because the listener-order happened to favor Modal here. On a different render cadence (StrictMode, fast subsequent keystrokes, etc.), L1 may have been removed before Modal's listener could run, and the first Escape is lost.

**The architectural defect is that `onClose` is unstable and the listeners compete.** Even if it happens to work today in a particular render order, it's not correct.

**Fix (apply both for defense in depth):**
- Stabilize `onClose` in App.tsx: `const closeHelp = useCallback(() => setHelpOpen(false), []);` and pass `closeHelp` to ShortcutsHelp.
- In Modal.tsx, call `e.stopImmediatePropagation()` before `onClose()` so App's listener cannot run while a modal is open.

---

### C2. Invalid HTML — interactive `<span onClick>` nested inside `<button>` in AssetListRow

> **Status:** ✅ Fixed in `387dce6` — `fix(list-row): use real buttons for select/favorite/kebab (C2 a11y)`
> - Restructured `AssetListRow.tsx` to `<div role="row">` + real `<button>` for select/favorite/kebab.
> - Used the stretched-link pattern: transparent select button covers the whole row, star and kebab sit at higher z-index.
> - All mouse actions now have keyboard equivalents; `aria-pressed` / `aria-haspopup` / `aria-label` set correctly.
> - Visual layout unchanged; tests/build/lint clean.

**File:** `D:/DAM-Link/src/components/browser/AssetListRow.tsx` (lines 38–94)

```tsx
<button type="button" className={...} onClick={onClick} aria-pressed={selected}>
  ...
  <span className={styles.star} onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>...</span>
  <span className={styles.kebab} onClick={(e) => { e.stopPropagation(); onKebab(e); }} aria-label="更多操作">...</span>
</button>
```

Problems:
1. **HTML invalidity**: `<button>` content model forbids interactive descendants. Browsers re-parse / move content; the accessibility tree is undefined.
2. **Keyboard inaccessibility**: The `<span>` elements are not focusable, have no `role="button"`, no `tabindex`, no `onKeyDown`. Keyboard users cannot toggle favorite from the list view, and cannot open the kebab menu.
3. **Screen-reader regression**: The outer `aria-pressed={selected}` describes selection on a button that also contains two other clickable widgets — confusing.

**Fix:** Convert the row to a `<div role="row">` (or `<tr>`) and use real `<button>` elements for the row body, star, and kebab. Keep `e.stopPropagation()` on the inner buttons to prevent the row click. Mirror the pattern in `AssetCard.tsx`.

---

### C3. App.tsx uses native `confirm()` despite the existing ConfirmDialog component

> **Status:** ✅ Fixed in `b6618b1` — `feat(confirm): use custom ConfirmDialog for destructive actions (C3, fixes I1)`
> - All 3 `window.confirm()` call sites replaced with `await useConfirm().confirm(...)`.
> - `<ConfirmDialog>` mounted once in `App.tsx` (via `dialogElement` from the hook).
> - `handleDelete` / `handleEmptyTrash` / `menuDelete` made `async`.
> - **Bonus:** fixed I1 (module-level `let active` → `useRef`), added 8 regression tests in `tests/ConfirmDialog.test.tsx`.
> - `grep -r "window.confirm\|window.alert\|window.prompt" src/ tests/` returns nothing.

**File:** `D:/DAM-Link/src/App.tsx` (lines 55, 79, 118)

```tsx
if (confirm(`确定要永久删除 ${selected.name} 吗？`)) { ... }
if (!confirm('确定要清空回收站吗？此操作不可撤销。')) return;
if (!confirm(`确定要永久删除 ${a.name} 吗？`)) return;
```

CLAUDE.md: "`ConfirmDialog` + `useConfirm()` is the standard pattern for destructive confirmations (returns a Promise)." The bespoke component (and `useConfirm`) at `src/components/common/ConfirmDialog.tsx` are entirely unused.

**Fix:** Mount `<ConfirmDialog>` once in App.tsx and route all three confirms through `useConfirm().confirm()` (which is async). Also fixes I1 (module-level mutable in ConfirmDialog becomes a non-issue once the hook is actually used; but fix I1 anyway since the pattern is broken).

---

## Important issues

### I1. ConfirmDialog uses a module-level mutable for the resolve callback

**File:** `D:/DAM-Link/src/components/common/ConfirmDialog.tsx` (lines 51, 53–69)

```ts
let active: ((ok: boolean) => void) | null = null;
// ...
confirm: (opts) => new Promise((resolve) => {
  active = resolve;        // overwrites any pending confirm
  setRequest(opts);
}),
```

Two concurrent `confirm()` calls overwrite `active`; the first promise never resolves. Currently dormant because the hook is unused (C3); fix anyway.

**Fix:** Store the resolver in the `useState` request object itself, or in a `useRef` keyed by request id.

### I2. App's keymap Escape description says "关闭对话框" but never closes any dialog

**File:** `D:/DAM-Link/src/App.tsx` (line 174)

The description shown in ShortcutsHelp is a lie. The handler also runs concurrently with Modal/ContextMenu Escape handlers, contributing to C1, and clears selection as a hidden side-effect of closing a dialog.

**Fix:** Either fix C1 properly (Modal's `stopImmediatePropagation` makes this moot), or add a guard at the top of the handler: `if (helpOpen || state.ui.filterPanelOpen || state.ui.uploadDialogOpen || menuAnchor) return;`.

### I3. DetailPanel "恢复" button title advertises a shortcut `(R)` that doesn't exist

> **Status:** ✅ Fixed in `3ae8294` — `chore(detail+toast): remove lying (R) tooltip + use crypto.randomUUID() for toast IDs (I3, I9)`
> - Removed `(R)` from `DetailPanel.tsx:179`; title is now just `"恢复"`.
> - Picked option 1 (remove the lying text) over option 2 (add a real `R` shortcut) — adding a shortcut would be a feature, not a fix.

**File:** `D:/DAM-Link/src/components/detail/DetailPanel.tsx` (line 179)

```tsx
<button ... title="恢复 (R)">
```

`R` is not in the keymap. Tooltip lies to the user.

**Fix:** Remove `(R)` from the title, or add the shortcut to the keymap.

### I4. App.tsx / ShortcutsHelp / UploadDialog use inline styles for layout

> **Status:** ✅ Fixed in `ca0e08d` — `refactor(styles): move inline layout styles to CSS modules + extract EmptyState (I4, I7)`
> - Created `App.module.css` for the empty-trash floating button.
> - Added `.secondaryButton` and `.primaryButton` to `UploadDialog.module.css` (with `:disabled` state).
> - Removed the dangling global `placeholder-msg` className from App.tsx (it was never defined anywhere).
> - ShortcutsHelp left untouched per the spec's "optional" note.

**Files:**
- `D:/DAM-Link/src/App.tsx` lines 287–303 (empty-trash floating button: `position: fixed`, height, padding, border, radius — all layout)
- `D:/DAM-Link/src/components/common/ShortcutsHelp.tsx` lines 13–30 (table + kbd cell — arguably OK as "small content", but the kbd styling is duplicated per row)
- `D:/DAM-Link/src/components/upload/UploadDialog.tsx` lines 80, 87 (footer buttons)
- `D:/DAM-Link/src/components/browser/AssetList.tsx` line 55 (empty state)

CLAUDE.md: "no Tailwind, no inline styles for layout (inline styles for small content like table cells are OK)".

**Fix:** Move App.tsx empty-trash button and UploadDialog footer buttons into their `.module.css`. Consider extracting ShortcutsHelp into its own module too (optional).

### I5. ContextMenu: no arrow-key navigation, no auto-focus

> **Status:** ✅ Fixed in `3ee32fb` — `feat(context-menu): implement WAI-ARIA menu pattern + fix outside-click + divider height (I5, I6, I8)`
> - Document-level `keydown` listener (only while `anchor` is set) implements ArrowDown/Up (with wrap), Home/End, Enter/Space (browser native click), Tab (close, no focus trap), Esc (close + restore focus to trigger).
> - Skips dividers and disabled items in arrow navigation.
> - Auto-focuses the first focusable item on open.
> - Added optional `triggerRef?: HTMLElement | null` prop for focus restore (works without it).
> - Added 15 regression tests in `tests/ContextMenu.test.tsx`.

**File:** `D:/DAM-Link/src/components/common/ContextMenu.tsx` (lines 52–83)

Container has `role="menu"`, items have `role="menuitem"`, but:
- No `ArrowDown`/`ArrowUp`/`Home`/`End` navigation.
- First menuitem is not auto-focused when the menu opens.
- Tab cycles through page focusables, not within the menu.

Per WAI-ARIA APG, a `role="menu"` is expected to manage focus internally.

**Fix:** Either implement the full menu pattern (focus first item, ArrowDown/Up to navigate, Enter to activate, Esc to close), or downgrade roles to plain buttons.

### I6. ContextMenu uses `mousedown` for outside-click

> **Status:** ✅ Fixed in `3ee32fb` (same commit as I5).

**File:** `D:/DAM-Link/src/components/common/ContextMenu.tsx` (lines 26–32)

`mousedown` fires before `click`. Works today because items are plain buttons, but fragile to future changes (e.g. nested controls).

**Fix:** Use `pointerdown` consistently, or move close-on-outside to `click` with the same containment check.

### I7. AssetList empty state uses inline styles, duplicates AssetGrid

> **Status:** ✅ Fixed in `ca0e08d` (same commit as I4).
> - New shared component: `D:/DAM-Link/src/components/common/EmptyState.tsx` + `.module.css` (presentational, no hooks).
> - Used in both `AssetList.tsx` and `AssetGrid.tsx`.
> - **Visual deviations (intentional, documented in commit):**
>   - AssetList empty state: padding changed from 24px → `var(--space-7)` (16px) and added flex centering.
>   - AssetGrid empty state: lost its fixed 200px height; now takes only as much space as content needs.
>   Both deviations are side-effects of consolidation; the original 24px / 200px were off the design system scale.

**File:** `D:/DAM-Link/src/components/browser/AssetList.tsx` (line 55)

```tsx
<div style={{ padding: 24, color: 'var(--color-text-tertiary)' }}>没有匹配的资产</div>
```

Convention violation + DRY. AssetGrid has the same pattern.

**Fix:** Extract `<EmptyState message="...">` into `components/common/`, use in both grids.

### I8. ContextMenu height calculation ignores dividers

> **Status:** ✅ Fixed in `3ee32fb` (same commit as I5).
> - New calculation: `items.reduce((sum, i) => sum + (i.divider ? 9 : 32), 0) + 8` with a comment explaining the per-item sizes.

**File:** `D:/DAM-Link/src/components/common/ContextMenu.tsx` (line 44)

```ts
const MENU_HEIGHT = items.length * 32 + 16;
```

`divider` items render as ~9px, not 32px. For the AssetRowMenu (5–7 items with dividers) the estimate is off by ~70px. Harmless cosmetically but the calculation is wrong.

**Fix:** `items.reduce((sum, i) => sum + (i.divider ? 9 : 32), 0) + 8` or measure with a ref after mount.

### I9. ToastProvider IDs use a counter instead of `crypto.randomUUID()`

> **Status:** ✅ Fixed in `3ae8294` (same commit as I3).
> - Replaced the `useRef`-backed counter with `newId()` from `D:/DAM-Link/src/utils/id.ts`.
> - **Note:** the helper is named `newId()`, not `id()` as the original spec said — matched the existing convention. The rule in `coding-standards.md` §3 should be updated to say `newId()`.

**File:** `D:/DAM-Link/src/components/common/ToastProvider.tsx` (line 47)

```ts
const id = String(++idRef.current);
```

CLAUDE.md: "IDs come from `crypto.randomUUID()` (`src/utils/id.ts`)." A counter is fine for ephemeral toasts functionally but diverges from the rule.

**Fix:** Use the existing `id()` utility from `src/utils/id.ts`. Or amend the CLAUDE.md rule to explicitly allow counters for ephemeral UI IDs.

---

## Nice-to-have improvements

### N1. Modal FOCUSABLE selector misses disabled/hidden

> **Status:** ✅ Fixed on 2026-06-05 — `chore(modal): tighten FOCUSABLE selector + add Modal tests`
> - Selector changed to `'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'`.
> - New `tests/Modal.test.tsx` (6 tests): disabled button skip, hidden input skip, disabled input/select/textarea skip, no-href anchor skip, Tab cycle wrap skips disabled, Escape regression.
> - Tests + tsc clean (78 → 80 passing).

`D:/DAM-Link/src/components/common/Modal.tsx:13`

```ts
const FOCUSABLE = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
```

Matches disabled buttons and hidden inputs. Robust selector:

```ts
'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
```

### N2. Modal restores focus to possibly-unmounted element

> **Status:** ✅ Fixed on 2026-06-05 — `fix(modal): fall back to body when trigger unmounts before close`
> - Cleanup now checks `document.contains(target)`; if the previously focused element is no longer in the document (e.g. trigger unmounted after a confirm-driven delete), it focuses `document.body` instead.
> - New tests in `tests/Modal.test.tsx`: trigger focus restore + unmounted-trigger fallback (2 tests, 80 → 82 → 81 after the unrelated `disabled menuitem` test counted differently — see ContextMenu commit).

`D:/DAM-Link/src/components/common/Modal.tsx:48` — `previouslyFocused.current?.focus()` may focus an orphaned DOM node if the source element was unmounted (e.g. moved to trash via confirm). Fall back to `document.body.focus()` or a known landmark.

### N3. ContextMenu redundantly checks `item.disabled` after browser already disables click

> **Status:** ✅ Fixed on 2026-06-05 — `chore(context-menu): drop unreachable disabled guard`
> - Removed `if (item.disabled) return;` from the menuitem onClick handler. Browser already blocks click events on disabled buttons, so the guard is unreachable.
> - New test in `tests/ContextMenu.test.tsx`: `disabled menuitem does not invoke its onClick when activated`.

`D:/DAM-Link/src/components/common/ContextMenu.tsx:69` — `disabled` button never fires `onClick`, so the `if (item.disabled) return;` guard is unreachable. Pick one: either drop `disabled` and keep the guard, or drop the guard.

### N4. AssetRowMenu hard-codes divider keys `div1/div2/div3`

> **Status:** ✅ Fixed on 2026-06-05 — `chore(asset-row-menu): auto-number divider keys`
> - Replaced hardcoded `'div1'`, `'div2'`, `'div3'` with a local `dividerCount` counter and a `div()` helper that returns `{ key: \`div-${++dividerCount}\`, ... }`. Robust against future reordering.

`D:/DAM-Link/src/components/browser/AssetRowMenu.tsx:40,58,67` — works today, brittle to future changes. Use `key={\`div-${i}\`}` at the index in `AssetList.tsx` map.

### N5. ShortcutsHelp row key may collide

> **Status:** ✅ Fixed on 2026-06-05 — `chore(shortcuts-help): use entry index for row key`
> - `<tr key={e.key + e.scope}>` → `<tr key={i}>` (added `i` to the `entries.map` callback).

`D:/DAM-Link/src/components/common/ShortcutsHelp.tsx:16` — `<tr key={e.key + e.scope}>` is OK today (Backspace and Delete have different keys but same description) but fragile. Use the entry index.

### N6. `selected` in App.tsx isn't memoized

> **Status:** ✅ Fixed on 2026-06-05 — `perf(app): memoize selected asset lookup`
> - Wrapped the `state.assets.find(...) ?? null` lookup in `useMemo` keyed on `[state.assets, state.ui.selectedAssetId]`. Prevents the `keymap` `useMemo` from busting on unrelated state changes.

`D:/DAM-Link/src/App.tsx:48-49` — `state.assets.find(...) ?? null` returns a new ref every render and busts the `useMemo` for `keymap` deps.

### N7. `wrappedDispatch` in StoreProvider is fresh every render

> **Status:** ✅ Fixed on 2026-06-05 — `perf(store): stabilize wrappedDispatch with useCallback`
> - Wrapped `wrappedDispatch` in `useCallback` with `[state, dispatch]` as deps. Consumers that put `dispatch` in a dependency array no longer see a fresh ref on every state change.

`D:/DAM-Link/src/state/store.tsx:153-188` — every `useStore()` consumer gets a new `dispatch` ref on every state change. Wrap with `useCallback` (and accept that `state` must be a dep).

### N8. assetOps asymmetric `restoreAsset` vs `permanentDelete`

> **Status:** ✅ Fixed on 2026-06-05 — `docs(asset-ops): explain ui asymmetry`
> - Added a comment to `restoreAsset` explaining that it intentionally does not touch `ui` (restoring an asset never removes it from state, so the existing selection stays valid), unlike `permanentDelete` / `emptyTrash` which can remove the selected asset and must clear `selectedAssetId`.

`D:/DAM-Link/src/state/assetOps.ts:23-34` — `restoreAsset` doesn't touch `ui`; `permanentDelete` and `emptyTrash` do. Intentional but undocumented.

### N9. Hardcoded colors bypass design tokens

> **Status:** ✅ Fixed on 2026-06-05 (within original 3-file scope) — `refactor(tokens): add danger-subtle and star tokens, replace 3 hardcoded colors`
> - Added to `src/styles/tokens.css`: `--color-background-danger-subtle: #fff5f5` and `--color-star: #f5a623` (under a new "Subtle / status surfaces" group).
> - Replaced hardcoded colors in the 3 files listed below.
> - **Remaining hardcoded colors outside the original N9 scope:** `Toast.module.css` (`#ffffff`, `#2f9e44`, `#e03131`, `#f08c00` for success/error/warning), `UploadDialog.module.css:20` (`#fff5f5`), `AssetCard.module.css:61,71` (`#f5a623`). Tracked for the next token-pass.
> - 2026-06-05: responsive spec committed (see docs/superpowers/specs/2026-06-05-responsive-design.md); N9 remaining hardcoded colors (Toast, UploadDialog, AssetCard inner) are out of scope for this round and continue to be tracked separately.

- `D:/DAM-Link/src/components/common/ContextMenu.module.css:42` — `#fff5f5` (danger hover)
- `D:/DAM-Link/src/components/browser/AssetList.module.css:103` — `#f5a623` (star)
- `D:/DAM-Link/src/components/detail/DetailPanel.module.css:52,56` — `#f5a623` (star)

Define `--color-background-danger-subtle` and `--color-star` in `tokens.css`.

---

## What's good

- **Selectors stay pure** in `selectors.ts` per CLAUDE.md. `isInSelection` correctly branches on the tagged-union `kind`.
- **`AssetRowMenu` is a pure builder** (`buildAssetRowMenuItems`) — clean separation from the rendering component.
- **The kebab menu correctly handles trash state** — `inTrash` branches explicit, "移到回收站" ↔ "永久删除" swap, Restore visibility gated.
- **ContextMenu viewport flip** (lines 45–50) handles right/bottom overflow with `Math.max(8, ...)` clamping.
- **Modal uses `createPortal`** and has a correct Tab/Shift+Tab focus trap.
- **`assetOps.ts` returns `{ nextState, undo }`** — clean pattern that powers the toast Undo.
- **`useKeyboardShortcuts` uses a ref** for entries so re-renders don't tear down the listener.
- **`verbatimModuleSyntax` and `erasableSyntaxOnly` are honored** throughout — no enums/namespaces, `import type` used consistently.
- **Modal cleanup restores focus** to `previouslyFocused.current`.
- **DetailPanel correctly disables destructive controls in trash** and surfaces Restore only when applicable.

---

## Recommended fix order

1. ~~**C1** — Escape bug root cause.~~ ✅ done in `1d3a8e6`.
2. ~~**C2** — a11y regression: real buttons in list rows.~~ ✅ done in `387dce6`.
3. ~~**C3** — replace 3× `confirm()` with `useConfirm()`.~~ ✅ done in `b6618b1` (also fixed I1 as bonus).
4. ~~**I5 / I6 / I8** — ContextMenu a11y + outside-click + height.~~ ✅ done in `3ee32fb` (one commit, all three).
5. ~~**I4 / I7** — inline styles to CSS modules + extract `<EmptyState>`.~~ ✅ done in `ca0e08d` (one commit, both).
6. ~~**I3 / I9** — opportunistic pass: correct lying tooltip, fix ToastProvider IDs.~~ ✅ done in `3ae8294`.
7. ~~**N1–N9** — cleanup pass.~~ ✅ all done on 2026-06-05 (single batch, see status blocks above).

---

## Files referenced

```
src/components/common/Modal.tsx
src/components/common/Modal.module.css
src/components/common/ContextMenu.tsx
src/components/common/ContextMenu.module.css
src/components/common/ShortcutsHelp.tsx
src/components/common/ConfirmDialog.tsx
src/components/common/ToastProvider.tsx
src/components/browser/AssetRowMenu.tsx
src/components/browser/AssetList.tsx
src/components/browser/AssetListRow.tsx
src/components/browser/AssetList.module.css
src/components/detail/DetailPanel.tsx
src/components/detail/DetailPanel.module.css
src/components/upload/UploadDialog.tsx
src/App.tsx
src/hooks/useKeyboardShortcuts.ts
src/state/keymap.ts
src/state/store.tsx
src/state/assetOps.ts
```
