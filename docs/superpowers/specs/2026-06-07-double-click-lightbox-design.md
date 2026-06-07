# Double-Click to Preview — Design

**Date:** 2026-06-07
**Status:** Approved
**Scope:** `packages/web` only. Pure interaction change. No backend, no new reducer action, no new dependencies.

## Problem

Plan 18's `lightbox-fixes-v0.18.0` (commit `0a49188`) wired single-click → `OPEN_LIGHTBOX` for image/video. This makes the Lightbox pop up the moment a user touches an image card, **obscuring the DetailPanel** that should appear behind it. The user has to close the Lightbox to read metadata — defeating the purpose of selecting the card.

We want the standard file-manager interaction:

- **Single-click** → select (DetailPanel / BottomSheet opens).
- **Double-click** → open preview (Lightbox, image/video only).

This matches macOS Finder, Windows Explorer, Google Drive, Dropbox, and Adobe Bridge.

## Behavior

### Click semantics

| Surface                            | Single-click on image/video | Single-click on audio/document | Double-click on image/video | Double-click on audio/document |
|------------------------------------|-----------------------------|--------------------------------|-----------------------------|--------------------------------|
| `AssetCard` (grid)                 | `SELECT_ASSET`              | `SELECT_ASSET`                 | `OPEN_LIGHTBOX`             | `SELECT_ASSET` (no extra)       |
| `AssetListRow` (desktop list)      | `SELECT_ASSET`              | `SELECT_ASSET`                 | `OPEN_LIGHTBOX`             | `SELECT_ASSET` (no extra)       |
| `StackedCardList` row (phone list) | `SELECT_ASSET`              | `SELECT_ASSET`                 | `OPEN_LIGHTBOX`             | `SELECT_ASSET` (no extra)       |

### Keyboard semantics (card focus)

| Key     | Action                                                                 |
|---------|------------------------------------------------------------------------|
| `Space` | Select (single-click equivalent). Dispatches `SELECT_ASSET`.            |
| `Enter` | Open preview (double-click equivalent). Dispatches `OPEN_LIGHTBOX` for image/video, `SELECT_ASSET` otherwise. |

Direction keys (↑/↓) and the existing global keymap remain unchanged: arrow keys select, `Delete` soft-deletes, `f` toggles favorite, `?` shows help. The Lightbox-internal keymap (←/→, Esc) is unchanged.

### Event timing

The browser fires `click, click, dblclick` for a double-click (default dblclick threshold: 500ms). React dispatches all three synthetic events synchronously in the same tick. Our handler pipeline:

1. `click #1` → `SELECT_ASSET`
2. `click #2` → `SELECT_ASSET` (re-dispatch, reducer no-op since the id is unchanged)
3. `dblclick` → `OPEN_LIGHTBOX`

End state for image: `selectedAssetId === id` AND `lightboxAssetId === id`. The Lightbox overlays the DetailPanel; closing the Lightbox reveals the now-populated DetailPanel.

For audio/document, all three events dispatch `SELECT_ASSET`. End state: `selectedAssetId === id`, DetailPanel rendered.

## Architecture

### App.tsx — split `handleSelectAsset`

The current single handler at `App.tsx:272-282` branches by type:

```ts
const handleSelectAsset = useCallback((id: string) => {
  const a = state.assets.find((x) => x.id === id);
  if (a && (a.type === 'image' || a.type === 'video')) {
    dispatch({ type: 'OPEN_LIGHTBOX', assetId: id });
  } else {
    dispatch({ type: 'SELECT_ASSET', id });
  }
}, [state.assets, dispatch]);
```

Replace with two handlers:

```ts
// Single-click: always select.
const handleSelect = useCallback(
  (id: string) => dispatch({ type: 'SELECT_ASSET', id }),
  [dispatch],
);

// Double-click: open preview if previewable, else just select.
const handleOpen = useCallback(
  (id: string) => {
    const a = state.assets.find((x) => x.id === id);
    if (a && (a.type === 'image' || a.type === 'video')) {
      dispatch({ type: 'OPEN_LIGHTBOX', assetId: id });
    } else {
      dispatch({ type: 'SELECT_ASSET', id });
    }
  },
  [state.assets, dispatch],
);
```

`handleSelect` is now trivial (one line, pure dispatch) and is stably memoized. `handleOpen` retains the same deps as before (`[state.assets, dispatch]`).

Pass them to the three surfaces:

```tsx
<AssetGrid
  ...
  onSelect={handleSelect}      // renamed from onSelect to keep card's prop name
  onOpen={handleOpen}          // NEW
  ...
/>
<AssetList
  ...
  onSelect={handleSelect}
  onOpen={handleOpen}
  ...
/>
<StackedCardList
  ...
  onSelect={handleSelect}
  onOpen={handleOpen}
  ...
/>
```

### AssetCard / AssetListRow — accept `onDoubleClick`

`AssetCard.tsx` already exposes `onClick: () => void`. Add an optional `onDoubleClick?: () => void`. Wire the prop to the card's `onDoubleClick` event. The `onKeyDown` handler (currently maps `Enter` and `Space` to `onClick`) splits:

```ts
function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (e.target !== e.currentTarget) return;  // don't steal from focused children
  if (e.key === 'Enter') {
    e.preventDefault();
    onDoubleClick ? onDoubleClick() : onClick();
  } else if (e.key === ' ') {
    e.preventDefault();
    onClick();
  }
}
```

The `Enter` fallback to `onClick` preserves backward compatibility for callers that don't pass `onDoubleClick` (DetailPanel's preview thumbnail, etc.).

`AssetListRow.tsx` gets the same treatment. `StackedCardList` row component — same.

### AssetGrid / AssetList — forward `onOpen`

Add `onOpen?: (id: string) => void` to the prop interfaces. Forward to each card/row. If `onOpen` is omitted, the card behaves as before (no dblclick behavior); this keeps the favorites sidebar and other non-Grid callers backward-compatible.

### Reducer / Store

No changes. The three existing actions `SELECT_ASSET`, `OPEN_LIGHTBOX`, `CLOSE_LIGHTBOX` cover every case. No new actions, no state shape change.

### Lightbox / hooks

No changes to `Lightbox.tsx`, `MediaStage.tsx`, `NeighborStrip.tsx`, `useLightbox.ts`, `useIdleTimer.ts`. The Lightbox continues to:
- Render based on `state.ui.lightboxAssetId`
- Navigate `←`/`→` over `selectLightboxVisibleAssetIds`
- Cinema-mode via `useIdleTimer`
- Close via `Esc` or backdrop click

The Plan 20 `PREVIEWABLE_ASSET_TYPES` filter on the lightbox's neighbor chain is preserved (audio/document never enter the Lightbox's prev/next chain).

## What does NOT change

- Backend, DB, API contracts, migrations.
- Reducer, store, actions.
- `App.tsx` keyboard handler (existing keymap).
- Lightbox internals (`Lightbox.tsx`, `useLightbox.ts`, `useIdleTimer.ts`).
- `selectLightboxVisibleAssetIds` (Plan 20 filter).
- `selectVisibleAssets`, `selectActiveFilterCount`, sidebar counts.
- CSS, design tokens, animation vocabulary.
- DetailPanel logic on desktop/tablet/phone.
- The "close the Lightbox on visible-list change" effect at `App.tsx:287-292` (still needed when the user switches selection while the Lightbox is open).

## Test plan

### Updated tests

- **`tests/App.handlers.test.tsx`** — the 10 tests from Plan 14 that assert the old `handleSelectAsset` behavior must be split:
  - Image card click → dispatches `SELECT_ASSET`, **NOT** `OPEN_LIGHTBOX`
  - Image card double-click → dispatches both `SELECT_ASSET` and `OPEN_LIGHTBOX`
  - Audio card click → dispatches `SELECT_ASSET` (unchanged)
  - Audio card double-click → dispatches `SELECT_ASSET` (no lightbox, no error)
  - Document card click / dblclick → same as audio

### New tests

- **`tests/browser/AssetCard.dblclick.test.tsx`** — `onDoubleClick` handler called on native `dblclick` event; omitted → no error; card still clickable.
- **`tests/browser/AssetListRow.dblclick.test.tsx`** — same shape.
- **`tests/browser/StackedCardList.dblclick.test.tsx`** — same shape (phone list).
- **Keyboard:** add to the AssetCard test:
  - `Enter` on focused card → `onDoubleClick` (if provided) else `onClick`
  - `Space` on focused card → `onClick`
  - `Enter`/`Space` while focus is on a child button (checkbox, kebab) → does not propagate to the card handler

### Existing tests that must still pass

- All 316 web tests prior to this change.
- Plan 18's 6 lightbox-filter regression tests (they assert the chevron chain & NeighborStrip don't include non-previewable types — orthogonal to click semantics).
- Plan 20's 1 visual-verification screenshot.
- The 12 LoginScreen tests, the AppShell mount tests, the 14 useUpload tests, etc.

### Visual verification (Playwright)

A new `docs/superpowers/plans/screenshots/P21/verify.py` based on the P20 pattern. Real dev env (api:3000 + web:5173), real user via `POST /auth/register` + `POST /orgs` + draft/finalize for 1 image + 1 document. Captures:

1. `p21-grid-click-image.png` — click an image card → DetailPanel visible, no Lightbox.
2. `p21-grid-dblclick-image.png` — double-click the same image → Lightbox full-screen, DetailPanel hidden behind.
3. `p21-grid-dblclick-then-close.png` — after closing the Lightbox → DetailPanel visible again.
4. `p21-grid-dblclick-document.png` — double-click a document card → no Lightbox opens, DetailPanel shows the document.
5. `p21-list-dblclick-image.png` — list view, double-click image → Lightbox full-screen.
6. `p21-phone-dblclick-image.png` — phone viewport, double-click image → Lightbox full-screen.

A `p21-report.json` with 6 checks (one per screenshot) plus a `p21-summary.md` describing pass/fail per check.

## Generalization rules (anticipated)

1. **A click action and a confirm action should be different events.** "Select and reveal" (single-click) is a low-cost, low-commitment gesture. "Open a fullscreen overlay" (double-click) is a higher-commitment gesture. Conflating them is the bug we're fixing.
2. **Type-specific branches on click belong at the consumer, not in the click handler.** The new `handleOpen` (App.tsx) decides whether to open the Lightbox; the AssetCard's `onDoubleClick` is type-agnostic. The card doesn't know about types; App.tsx does.
3. **Re-dispatching the same action is a reducer no-op, not a bug.** The browser fires two clicks per dblclick. We let both through. The reducer's `SELECT_ASSET` for the same id produces the same state, so React skips the re-render.
4. **Keyboard activation should mirror mouse activation.** If a UI affordance is "double-click to X", the keyboard equivalent is `Enter`. If it's "click to X", the equivalent is `Space`. This rule covers future components without us having to re-decide.

## File-by-file change summary

| File                                              | Change                                                                 |
|---------------------------------------------------|------------------------------------------------------------------------|
| `packages/web/src/App.tsx`                        | Split `handleSelectAsset` → `handleSelect` + `handleOpen`; wire both to all three surfaces. |
| `packages/web/src/components/browser/AssetCard.tsx` | Add `onDoubleClick?: () => void` prop; wire native `onDoubleClick`; split keyboard `Enter`/`Space`. |
| `packages/web/src/components/browser/AssetListRow.tsx` | Same as AssetCard.                                              |
| `packages/web/src/components/browser/StackedCardList.tsx` | Same as AssetCard, but on the row component.                  |
| `packages/web/src/components/browser/AssetGrid.tsx` | Add `onOpen?: (id: string) => void` prop; forward to cards.    |
| `packages/web/src/components/browser/AssetList.tsx` | Add `onOpen?: (id: string) => void` prop; forward to rows.     |
| `packages/web/tests/App.handlers.test.tsx`         | Rewrite click-vs-dblclick assertions.                              |
| `packages/web/tests/browser/AssetCard.dblclick.test.tsx` | New. Mouse + keyboard activation of the new prop.          |
| `packages/web/tests/browser/AssetListRow.dblclick.test.tsx` | New. Same.                                               |
| `packages/web/tests/browser/StackedCardList.dblclick.test.tsx` | New. Same.                                            |
| `docs/superpowers/plans/2026-06-07-double-click-lightbox.md` | New. The implementation plan (next step).                |
| `docs/superpowers/plans/screenshots/P21/`         | New. Playwright verify script + 6 PNGs + `p21-report.json` + `p21-summary.md`. |

## Out of scope (deferred)

- Hover-preview (a small floating thumbnail on hover). Not requested; would be a separate plan.
- A keyboard shortcut to "open the currently selected asset in Lightbox" (e.g. `o`). Not requested; the `Enter` on focused card already covers keyboard activation. Could be added later.
- A "lightbox opens on click only for the first click of a multi-select" pattern. Multi-select is unrelated; multi-select already uses a dedicated checkbox (`AssetCard.tsx:85-101`).
- A "long-press to preview" gesture for touch devices. The double-click on phone StackedCardList is what we have; touch dblclick is widely supported by mobile Safari and Chrome.

## Acceptance criteria

- All 4 of the original Plan 18 hotfix generalizations (image/video enter lightbox; audio/document don't) still hold, but now via `onDoubleClick`.
- DetailPanel is visible immediately after a single click on any asset, with no Lightbox covering it.
- DetailPanel is visible again after closing the Lightbox.
- Mobile (phone viewport) double-click on image also opens Lightbox.
- Keyboard `Enter` on focused card opens Lightbox (or selects, for non-previewable).
- All existing 316 web tests pass + 4 new dblclick tests + the rewritten App.handlers tests.
- Playwright `P21/verify.py` produces 6 screenshots, all checks pass in `p21-report.json`.
- No new dependencies. No new reducer actions. No new components.
- The change is small: < 60 lines of source diff, ~150 lines of test diff.
