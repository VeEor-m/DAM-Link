# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DAM-Link is a desktop-only (≥1024px) Digital Asset Management browser built with Vite + React 19 + TypeScript. The 3-pane layout (Sidebar / Browser grid / Detail panel) mirrors `C:/Users/Administrator/Downloads/asset_browser_mockup.html` 1:1. State lives in a single `useReducer` + Context store, persisted to `localStorage` under key `dam-link-state-v1`. Persistence is metadata + canvas thumbnails for images only — no real blob storage. The app is shipped in 5 incremental phases; current branch is `feat/phases-2-5`.

## Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run build        # tsc -b && vite build (production)
npm run preview      # Preview production build
npm run lint         # ESLint (flat config in eslint.config.js)
npm test             # Vitest, single run, --passWithNoTests
npm run test:watch   # Vitest watch mode
npm run test:ui      # Vitest with UI
```

**Run a single test file:** `npx vitest run tests/selectors.test.ts` (or any path under `tests/`).

**Type-check only:** `npx tsc -b` (uses both `tsconfig.app.json` and `tsconfig.test.json` via project references).

## Architecture

### Directory layout
```
src/
  components/
    layout/         AppShell.tsx — 3-pane grid, sr-only <h1>
    toolbar/        Toolbar.tsx — search, view toggle, filter, upload buttons
    sidebar/        Sidebar.tsx — tagged-union selection, live counts
    browser/        AssetGrid + AssetCard — grouped-by-type card grid
    detail/         DetailPanel + TagEditor — metadata, inline rename, tag chips
    common/         Modal, ConfirmDialog, Toast/ToastProvider — portal + focus trap
    filter/         (empty — Phase 2)
    upload/         (empty — Phase 2)
  hooks/            useStore, useDebounce, useToast (re-export)
  state/            store, actions, types, selectors, assetOps, persistence, mockData
  utils/            fileType, format, clipboard, download, uploadParser, id
  styles/           global.css + tokens.css (CSS variables — single source of truth)
tests/              Vitest specs, mirrors src/ layout, setup.ts cleans up DOM + localStorage
```

### Data model (`src/state/types.ts`)
- `Asset`: id, name, type (`image|video|document|audio`), format (UPPERCASE ext), size, uploadedAt (ISO), uploadedBy, tags, favorite, deletedAt (`string | null`), optional width/height/duration, optional `previewDataUrl` (base64 thumbnail — only for uploaded images).
- `AppState = { assets: Asset[], ui: UIState }`. UI is the only "ephemeral" part of state (search, selection, viewMode, selectedAssetId, panel toggles, FilterState).
- `SidebarSelection` is a **tagged union** — `all | type | tag | smart` (where `smart ∈ recent|favorites|trash`). Trashed assets are excluded from every selection except `smart: 'trash'`.
- `FilterState` has 5 dimensions: typeFilter, formatFilter, sizeBucket (`small<1MB|medium<10MB|large`), dateBucket (`7d|30d|90d|all`), uploaderFilter. Tag filtering is handled by the sidebar's `kind: 'tag'` selection — duplicating it in the filter panel was removed.

### State management (`src/state/store.tsx`)
- `useReducer` with a single `reducer(state, action)` switch — all UI changes and asset CRUD go through actions.
- `StoreProvider` initializes from `loadState()` (localStorage) or falls back to `MOCK_ASSETS`.
- **Every state change triggers a `saveState(state)`** (debounced 300ms inside `persistence.ts`).
- `wrappedDispatch` in the provider translates the `TOGGLE_FAVORITE` / `ADD_TAG` / `REMOVE_TAG` actions into the generic `UPDATE_ASSET` by reading the current asset, so the reducer stays pure.
- Pure ops that need to return an undo payload live in `src/state/assetOps.ts` (`deleteAsset`, `restoreAsset`, `permanentDelete`, `emptyTrash`) and return `{ nextState, undo? }`. The app applies `nextState` via `HYDRATE_STATE` and uses `undo.asset` for the toast's Undo action.

### Actions (`src/state/actions.ts`)
- UI: `SET_SEARCH`, `SET_SELECTION`, `SET_VIEW_MODE`, `SELECT_ASSET`, `SET_FILTER_PANEL`, `SET_UPLOAD_DIALOG`, `SET_FILTER` (partial), `CLEAR_FILTERS`.
- Asset: `HYDRATE_STATE`, `ADD_ASSET`, `UPDATE_ASSET` (generic), `TOGGLE_FAVORITE`, `RENAME_ASSET`, `ADD_TAG`, `REMOVE_TAG`, `DELETE_ASSET` (sets `deletedAt`), `RESTORE_ASSET`, `PERMANENT_DELETE`, `EMPTY_TRASH`.
- `Action` is a discriminated union; `HYDRATE_STATE`'s payload uses a structural `AppState` type to avoid a circular import with `store.tsx`.

### Selectors (`src/state/selectors.ts`)
- `matchesSearch(asset, query)` — case-insensitive substring on name + format + uploader + tags (returns true for empty query).
- `matchesFilters(asset, f)` — all 6 dimensions ANDed.
- `isInSelection(asset, sel)` — sidebar predicate; `kind: 'all'` excludes trashed.
- `selectVisibleAssets(assets, ui)` — composes all three (selection ∧ filters ∧ search).
- `selectSidebarCounts(assets)` — counts by type/tag for sidebar, plus `favorites` and `trash`.
- `selectActiveFilterCount(f)` — number of populated filter dimensions (for the toolbar badge).

### Component patterns
- All components use **CSS Modules** (`Foo.tsx` + `Foo.module.css`) — no Tailwind, no inline styles for layout.
- Modals/Toasts render via `createPortal(..., document.body)`.
- `Modal` has focus trap (Tab/Shift+Tab), Esc-to-close, and restores `document.activeElement` on unmount (`src/components/common/Modal.tsx`).
- `ToastProvider` exposes `useToast()` — toasts auto-dismiss after 4s, capped at 3 visible, rendered in an `aria-live="polite"` region.
- `ConfirmDialog` + `useConfirm()` is the standard pattern for destructive confirmations (returns a Promise).
- `App.tsx` debounces the search query by 150ms via `useDebounce` before passing to `selectVisibleAssets`.

### File upload (`src/utils/uploadParser.ts`)
- `parseFile(file, uploader='我', when=new Date())` returns a populated `Asset`.
- Images: reads `naturalWidth/Height` and generates a canvas-rendered JPEG thumbnail (max dim 200px, quality 0.7) into `previewDataUrl`.
- Video: reads `videoWidth/videoHeight/duration` via a hidden `<video preload="metadata">`.
- Audio: reads `duration` via a hidden `<audio>`.
- Docs: base fields only.
- All four readers have a 2-second jsdom fallback that resolves to empty/zeros so unit tests don't hang on synthetic files.

### Conventions / things to remember
- **Trash is soft** — `DELETE_ASSET` sets `deletedAt`; `PERMANENT_DELETE` actually removes. Only `smart: 'trash'` selection shows trashed assets.
- **IDs** come from `crypto.randomUUID()` (`src/utils/id.ts`).
- **Search debounce** is 150ms in `App.tsx`; **persistence debounce** is 300ms in `persistence.ts`. These are independent.
- **Persisted state shape** must satisfy `isAppState()` — if it doesn't (corrupt JSON or shape mismatch), `loadState()` returns null and the app falls back to mocks.
- **Selectors are pure** — put filter/search/visibility logic in `selectors.ts`, not in components.
- **Sidebar selection is a tagged union** — branch with `sel.kind`, not with duck-typing.
- **CSS variables in `tokens.css`** are the single source of truth for color/radius/spacing. New styles should consume them; hard-coded colors are discouraged.
- **The desktop-only fallback is gone.** As of 2026-06-05 (see `docs/superpowers/specs/2026-06-05-responsive-design.md`), the app supports a 4-tier responsive layout (phone ≤640 / tablet 641–1023 / desktop 1024–1280 / wide >1280). Viewport is derived via `useViewport()` and written to `body[data-viewport]`; CSS responds via attribute selectors. On phone/tablet, `<Sidebar>` lives in a `<Drawer>` and `<DetailPanel>` on phone lives in a `<BottomSheet>`. Do not reintroduce the old `.fallback-narrow` width gate.

### TypeScript configuration
Both `tsconfig.app.json` and `tsconfig.test.json` enable:
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — use `import type { ... }` for type-only imports
- `erasableSyntaxOnly: true` — no enums or namespaces; use string-literal unions
- `moduleResolution: "bundler"`, `target: "es2023"`, `jsx: "react-jsx"`

The test config additionally pulls in `vitest/globals` and `@testing-library/jest-dom`. Test files don't need to import from these — they're global.

### Test layout
Each module has a corresponding test file. New utilities/components should ship with `tests/<name>.test.{ts,tsx}`. `tests/setup.ts` runs `cleanup()` and clears `localStorage` in `afterEach`, so tests are isolated by default.
