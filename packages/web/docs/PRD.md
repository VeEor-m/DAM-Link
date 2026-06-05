# PRD: DAM Link — Asset Browser

## Problem Statement

Designers, marketers, and content teams need a single place to find, organize, and act on brand assets (images, videos, documents, audio). Existing tools are either too heavy (enterprise DAMs with weeks of setup) or too shallow (shared folders with no metadata, no filtering, no tags, no trash, no favorites). Users want the visual polish and metadata richness of a real DAM, but in a lightweight client-side app that runs in the browser and works offline. The reference design (`asset_browser_mockup.html`) shows a familiar 3-pane layout: categories on the left, asset grid in the middle, metadata + actions on the right. The mockup is static; the user wants a React app that delivers the same visual fidelity and makes every interaction in the mockup real.

## Solution

Build a single-page React app in `D:/DAM-Link/` that reproduces the mockup 1:1 and layers full functionality on top:

- The static layout becomes a working DAM browser with localStorage persistence, so refreshing the page preserves the asset library.
- Click handlers in the mockup become real navigation: clicking a card selects it, clicking a sidebar item filters the grid, switching view modes re-renders the layout.
- Search, filter, sort, favorite, tag, rename, trash, restore, empty-trash, upload, download, and copy-link all work end-to-end.
- File upload is real (file picker + drag-and-drop) but lightweight (metadata + canvas thumbnails persisted, not full binary blobs).
- Keyboard shortcuts and screen-reader semantics make the app feel like a polished desktop tool, not a static demo.

The app is **desktop-only** (≥1024px). Smaller screens show a friendly fallback message — this is a power-user tool, not a mobile app.

## User Stories

### Browse and navigate

1. As a designer, I want to see all assets in a single grid view, so that I can scan the entire library at a glance.
2. As a designer, I want the grid grouped by asset type (images, videos, documents, audio), so that I can find the right kind of asset quickly.
3. As a designer, I want to click a sidebar category (图片 / 视频 / 文档 / 音频) and see only assets of that type, so that I can narrow down fast.
4. As a designer, I want to click 全部资产 in the sidebar to return to the full library, so that I can recover my view after drilling down.
5. As a designer, I want the sidebar to show live counts next to each category (e.g. 图片 (24)), so that I know what's in the library without clicking.
6. As a designer, I want to click a tag in the sidebar (e.g. 品牌物料) and see only assets with that tag, so that I can find related work for a project.
7. As a designer, I want to click 已收藏 in the sidebar and see only my favorited assets, so that I can quickly retrieve work I marked as important.
8. As a designer, I want to click 最近上传 in the sidebar and see only assets uploaded in the last 30 days, so that I can find what I (or my team) worked on recently.
9. As a designer, I want to click 回收站 in the sidebar to see trashed assets, so that I can restore something I deleted by mistake.
10. As a designer, I want each sidebar item to show a clear active state, so that I always know which filter is currently applied.
11. As a designer, I want to switch between 网格 and 列表 view via the toolbar, so that I can choose the layout that fits the current task.
12. As a designer, I want the view mode choice to be remembered across page reloads, so that I don't have to toggle it back every session.

### Search and filter

13. As a designer, I want to type in the search box and have the grid filter live (with a 150ms debounce), so that I can find an asset by name without clicking away.
14. As a designer, I want the search to match against the asset name, format (e.g. "mp4"), uploader name, and tags, so that I can find things through any identifying string.
15. As a designer, I want the search to be case-insensitive, so that I don't have to remember exact capitalization.
16. As a designer, I want to press Esc to clear the search query, so that I can quickly return to the unfiltered list.
17. As a designer, I want to press `/` from anywhere in the app to focus the search box, so that I can search without reaching for the mouse.
18. As a designer, I want a 筛选 button in the toolbar that opens a filter panel, so that I can compose multiple filter conditions.
19. As a designer, I want the filter panel to let me filter by type, format, size bucket (Small/Medium/Large), date range (7/30/90 days/all), uploader, and tags, so that I can drill down to exactly the assets I need.
20. As a designer, I want the filter button to show a badge with the count of active filters, so that I know when filters are constraining my results.
21. As a designer, I want a "Clear all" button in the filter panel, so that I can reset filters in one click.
22. As a designer, I want the search query, active sidebar selection, and filter state to combine (AND), so that I can layer constraints.
23. As a designer, I want the main pane to show a friendly empty state ("没有匹配的资产") when nothing matches, so that I know the result is constrained, not broken.

### Asset details and editing

24. As a designer, I want to click any asset card to select it and see its full details in the right-hand panel, so that I can inspect metadata before acting.
25. As a designer, I want the detail panel to show the file's thumbnail (or a type icon if no preview), name, size, dimensions (for images and videos), duration (for video/audio), format, upload date, uploader, and tags, so that I have all the context I need.
26. As a designer, I want the currently selected card to have a visible selected state (blue border), so that I can see at a glance which asset the detail panel refers to.
27. As a designer, I want to rename an asset by clicking the name in the detail panel and typing a new name, so that I can fix typos or give context.
28. As a designer, I want the rename to commit when I press Enter and cancel when I press Esc, so that the interaction feels natural.
29. As a designer, I want to add a new tag to an asset by typing in the tag input and pressing Enter, so that I can categorize without leaving the panel.
30. As a designer, I want to remove a tag by clicking the X on the tag chip, so that I can refine categorization quickly.
31. As a designer, I want to toggle the favorite status of an asset via a star button in the detail panel, so that I can bookmark important assets.
32. As a designer, I want the favorite state to be visible on the card thumbnail as a small star, so that I can scan favorites at a glance.
33. As a designer, I want all edits (rename, tag, favorite) to persist immediately to localStorage, so that refreshing the page preserves my work.

### Upload

34. As a designer, I want to click the 上传 button in the toolbar to open an upload dialog, so that I have a clear entry point for adding new assets.
35. As a designer, I want to drag-and-drop files into the upload zone, so that I can batch-add without using a file picker.
36. As a designer, I want to use the native file picker to select one or more files, so that I can fall back to the OS-level picker.
37. As a designer, I want each uploaded file to appear immediately in the grid with a generated thumbnail (canvas-rendered for images, emoji for other types), so that I get visual feedback without manual entry.
38. As a designer, I want the upload to read each file's size, type, and (for images) dimensions automatically, so that I don't have to enter metadata by hand.
39. As a designer, I want uploaded files to default to the current user's name ("我") and the current date, so that the metadata is plausible.
40. As a designer, I want a successful upload to close the dialog and show a success toast, so that I have confirmation.
41. As a designer, I want unsupported file types to be rejected with a toast explaining why, so that I know what went wrong.

### Lifecycle: trash, restore, delete

42. As a designer, I want to click 移到回收站 in the detail panel to remove an asset from the active view, so that I can declutter without permanent loss.
43. As a designer, I want a toast to appear after deletion with an Undo action that restores the asset if I click within 5 seconds, so that I can recover from accidental deletes.
44. As a designer, I want the trashed asset to appear in 回收站, so that I can find it later if I need to restore.
45. As a designer, I want the detail panel to show 永久删除 and 恢复 buttons when I'm viewing a trashed asset, so that I have the right actions in the right context.
46. As a designer, I want to click 恢复 to bring a trashed asset back to the active library, so that I can undo a deletion.
47. As a designer, I want to click 永久删除 on a trashed asset to remove it forever, with a confirmation dialog, so that I don't lose work by accident.
48. As a designer, I want an "Empty trash" action in the 回收站 view that deletes all trashed assets after a confirmation showing the count, so that I can clean up.
49. As a designer, I want downloads and copy-link to be disabled for trashed assets, so that I can't accidentally share deleted content.

### Sharing and download

50. As a designer, I want to click 下载 in the detail panel to trigger a browser download of the asset, so that I can save it to my machine.
51. As a designer, I want to click 复制链接 to copy a deep link to the asset to my clipboard, with a toast confirming the copy, so that I can paste the link into Slack or email.

### List view (Phase 5)

52. As a designer, I want the list view to show one row per asset with columns: thumbnail, name, type icon, size, dimensions/duration, tags (truncated), uploader, uploaded date, favorite star.
53. As a designer, I want to click any column header in the list view to sort by that column, so that I can find the largest files or the most recent uploads.
54. As a designer, I want a kebab menu (⋮) on each list row with actions: Download, Copy link, Toggle favorite, Rename, Move to trash, so that I don't have to enter the detail panel for common actions.
55. As a designer, I want the list view to scroll smoothly and stay performant with the full library, so that it remains usable as assets accumulate.

### Keyboard shortcuts

56. As a power user, I want to press `/` to focus the search box, so that I can search without a mouse.
57. As a power user, I want to press `↑` / `↓` to navigate between assets in the current view, so that I can browse quickly.
58. As a power user, I want to press `Enter` to open / select the highlighted asset, so that I can act on it.
59. As a power user, I want to press `Esc` to clear the search, deselect, or close any open dialog, so that I have a consistent "back out" key.
60. As a power user, I want to press `Delete` (or `Backspace`) to move the selected asset to trash, with the same undo toast as the button, so that the keyboard and mouse paths match.
61. As a power user, I want to press `F` to toggle favorite on the selected asset, so that I can bookmark from the keyboard.
62. As a power user, I want to press `U` to open the upload dialog, so that I can upload without reaching for the toolbar.
63. As a power user, I want to press `1` / `2` to switch between grid and list view, so that I can flip layouts quickly.
64. As a power user, I want to press `?` to open a shortcuts help modal, so that I can discover the keybindings.
65. As a power user, I want shortcuts to be suppressed when I'm typing in an input, so that they don't interfere with editing.

### Accessibility

66. As a screen reader user, I want the toolbar buttons to have descriptive `aria-label` attributes, so that I know what each icon button does.
67. As a screen reader user, I want the active sidebar item to be marked with `aria-current="page"`, so that I can tell which filter is applied.
68. As a screen reader user, I want the asset grid to announce the position of each card (e.g. "1 of 24"), so that I have spatial context.
69. As a screen reader user, I want toasts to be announced via an `aria-live="polite"` region, so that I get feedback on actions.
70. As a screen reader user, I want modal dialogs (upload, confirm, filter) to trap focus and announce their title, so that I can use them with a keyboard or screen reader.
71. As a keyboard user, I want visible focus rings on all interactive elements, so that I can see where I am.
72. As a keyboard user, I want the search input, sidebar, and detail panel to be navigable in a logical tab order, so that I can reach every control.
73. As a user on a screen narrower than 1024px, I want to see a friendly message asking me to use a larger screen, so that I understand why the app isn't working.
74. As a user, I want a screen-reader-only heading describing the page, so that landmark navigation is meaningful.

### Persistence

75. As a user, I want all assets, edits, favorites, tags, trashed state, view mode, search, sidebar selection, and filters to persist across page reloads via localStorage, so that my work survives a refresh.
76. As a user, I want a versioned storage key, so that future schema changes don't crash old saved state.

## Implementation Decisions

### Stack and architecture (locked)

- **Vite + React 19 + TypeScript** with the modern JSX transform.
- **CSS Modules** for component styles, **one global `tokens.css`** for design tokens, and **one global `global.css`** for resets, sr-only, scrollbars, and the mobile fallback.
- **`useReducer` + Context** for state management. One root reducer for `{assets, ui}`. A single `useStore()` hook returns `{state, dispatch}`. Persistence is a `useEffect` that writes to localStorage on every state change.
- **`@tabler/icons-react`** for all icons. The mockup uses Tabler Icons (ti-* classes), so this is a 1:1 port.
- **No external state lib** (no Zustand, no Redux). No router. No theming library.

### File structure (locked)

- `src/styles/` — tokens.css, global.css
- `src/state/` — types.ts, store.tsx, actions.ts, selectors.ts, persistence.ts, mockData.ts
- `src/hooks/` — useStore.ts, useDebounce.ts, useKeyboardShortcuts.ts, useDragDrop.ts
- `src/utils/` — format.ts, fileType.ts, id.ts, download.ts, clipboard.ts, uploadParser.ts
- `src/components/layout/` — AppShell
- `src/components/toolbar/` — Toolbar
- `src/components/sidebar/` — Sidebar
- `src/components/browser/` — AssetGrid, AssetCard, AssetList, AssetListRow
- `src/components/detail/` — DetailPanel, TagEditor, DetailActions
- `src/components/filter/` — FilterPanel
- `src/components/upload/` — UploadDialog, DropZone
- `src/components/common/` — Modal, ConfirmDialog, Toast, ToastProvider

### Data model (locked)

```ts
type AssetType = 'image' | 'video' | 'document' | 'audio';

interface Asset {
  id: string;                 // crypto.randomUUID()
  name: string;
  type: AssetType;
  format: string;             // uppercase ext: PNG, JPG, MP4
  size: number;               // bytes
  uploadedAt: string;         // ISO 8601
  uploadedBy: string;
  tags: string[];
  favorite: boolean;
  deletedAt: string | null;
  width?: number;
  height?: number;
  duration?: number;          // seconds
  previewDataUrl?: string;    // base64 thumbnail for image previews
}
```

`previewDataUrl` is the only large field. For seed assets it's absent (the card renders an emoji thumbnail). For uploaded images it's a downsized canvas JPEG (max 200×150). Other upload types also get a generated data URL preview when feasible (e.g. video poster frame).

The `Asset.uploadedBy` defaults to `"我"` for uploads. The `Asset.id` is `crypto.randomUUID()`.

Sidebar selections are *predicates* over the asset list, not separate fields. The tagged union `SidebarSelection` is the single source of truth for "what is the user looking at?":

```ts
type SidebarSelection =
  | { kind: 'all' }
  | { kind: 'type'; type: AssetType }
  | { kind: 'tag'; tag: string }
  | { kind: 'smart'; smart: 'recent' | 'favorites' | 'trash' };
```

### State shape and actions (locked)

```ts
interface AppState {
  assets: Asset[];
  ui: {
    searchQuery: string;
    selection: SidebarSelection;
    viewMode: 'grid' | 'list';
    selectedAssetId: string | null;
    filterPanelOpen: boolean;
    uploadDialogOpen: boolean;
    filter: FilterState;
  };
}

// Actions
SET_SEARCH, SET_SELECTION, SET_VIEW_MODE, SET_FILTER_PANEL, SET_UPLOAD_DIALOG
SELECT_ASSET, CLEAR_SELECTION
SET_FILTER_TYPE, SET_FILTER_FORMAT, SET_FILTER_SIZE, SET_FILTER_DATE,
SET_FILTER_UPLOADER, SET_FILTER_TAG, CLEAR_FILTERS
ADD_ASSET, UPDATE_ASSET, REMOVE_ASSET, RESTORE_ASSET, EMPTY_TRASH
TOGGLE_FAVORITE, RENAME_ASSET, ADD_TAG, REMOVE_TAG
HYDRATE_STATE
```

### Deep modules to extract

The most important architectural units — each one encapsulates a coherent responsibility behind a small, stable interface:

1. **`selectors.ts`** — `selectVisibleAssets(state)`, `selectSidebarCounts(state)`, `selectActiveFilterCount(state)`, `matchesSearch(asset, query)`, `matchesFilters(asset, filter)`, `isInSelection(asset, selection)`. Pure functions over the state tree. Testable in isolation. This is the **filtering engine** that every pane reads from.

2. **`persistence.ts`** — `loadState()` returns `AppState | null` from localStorage; `saveState(state)` debounced-writes. Includes a `STORAGE_VERSION` constant and migration shim so future schema bumps don't crash on old data. Tiny, no React.

3. **`uploadParser.ts`** — `parseFile(file: File, opts): Promise<Asset>` is the single entry point for converting a `File` into an `Asset`. Reads type, size, dimensions (via `Image` element), and generates a downsized `previewDataUrl` for images. Video/audio use a similar pattern with a hidden `<video>` / `<audio>` element. Testable by injecting a mock File.

4. **`keymap.ts` + `useKeyboardShortcuts.ts`** — A central registry of `{key, scope, handler, description}`. `useKeyboardShortcuts` subscribes to keydown, filters by `scope` (e.g. `'global'`, `'modal'`, `'editing'`), and dispatches. Components register/unregister via context. The `?` help modal reads from the same registry.

5. **`toast/ToastProvider.tsx`** — A `useToast()` hook returning `showToast({message, action?, variant})`. Manages a stack with auto-dismiss timers. Renders into a portal with `aria-live="polite"`. The "moved to trash / Undo" flow is built on top: `deleteAsset()` dispatches, returns an undo payload, and the toast layer surfaces the Undo button.

6. **`assetOps.ts`** — `deleteAsset(state, id)`, `restoreAsset(state, id)`, `permanentDelete(state, id)`, `emptyTrash(state)`. Each returns `{nextState, undo?}` so the toast can offer Undo cleanly. The reducer calls these; the toast layer consumes their return values.

7. **`Modal` + `ConfirmDialog`** — A reusable modal primitive that handles focus trap, Escape to close, click-outside to close, and `role="dialog"` + `aria-modal="true"`. `ConfirmDialog` is a thin promise wrapper: `const ok = await confirm({title, body, confirmLabel})`.

8. **`useDragDrop.ts`** — Encapsulates dragover/dragleave/drop event handling. Returns `{dragActive, dropHandlers}`. The upload dialog consumes it; the visual feedback (overlay, "drop files here") lives in `DropZone` which uses the hook.

9. **`useDebounce.ts`** — Generic 150ms debounce used by the search input. Standard implementation, well-known.

10. **`id.ts`** — `newId()` wrapping `crypto.randomUUID()`. Lets us swap to a different ID strategy in tests.

### Visual / interaction details (locked)

- The toolbar's view toggle is a segmented control — the two buttons share a single border.
- The selected card has a 1.5px blue border; unselected cards have a 0.5px gray border. Selected state animates the border color over 120ms.
- The detail panel's favorite button is a star in the top-right of the preview thumbnail.
- Tags in the detail panel are blue pill chips. Below the chips is a tag input that adds a tag on Enter.
- The filter button shows a numeric badge when ≥1 filter is active.
- The upload dialog contains a drop zone (full-width, dashed border, file icon center) and a "选择文件" button that triggers a hidden `<input type="file" multiple>`.
- Toasts appear bottom-right, stack up to 3, auto-dismiss after 4s (errors 6s). When a toast has an action button (Undo), the timer pauses on hover.
- The `?` help modal lists all shortcuts grouped by scope: Navigation, Actions, Views.

### Mobile fallback (locked)

`@media (max-width: 1023px)`: hide `.app-root`, show a centered message. Implemented in `global.css` so it survives all component changes.

### Persistence details (locked)

- Storage key: `dam-link-state-v1`.
- `saveState` is debounced 300ms; called from a `useEffect` that watches the state via a stable ref to avoid render loops.
- On load, `loadState` validates the shape (light runtime check) and discards corrupt data. The `HYDRATE_STATE` action is dispatched once at app boot.
- The `previewDataUrl` is **not** persisted in the seed state (seed has no previews). For uploaded images it is persisted — keeps the demo small but uploaded thumbnails survive reloads.

### Out of scope (explicit non-goals)

- Real backend / network calls. The app is 100% client-side.
- Full binary blob storage in IndexedDB. We persist metadata + small thumbnails only.
- Light/dark theme switching. The mockup is a light theme; the tokens are written to make a dark variant possible later, but no toggle is built.
- Multi-user authentication. "Uploader" is just a string.
- Mobile / tablet layout. Desktop-only with friendly fallback.
- Multi-select with bulk actions (delete multiple, tag multiple). Single-select only.
- File replacement. To "replace" a file, delete and re-upload.
- Drag-to-reorder within a section, drag-to-tag, or any drag interaction other than file upload.

## Testing Decisions

### What makes a good test

Test **observable behavior** — what a user sees, what state changes, what the API contract guarantees. Don't test implementation details (specific CSS class names, internal hook state, exact rendering tree).

### Modules to test (in priority order)

The deep modules above are the testable surface. Recommend writing tests for:

1. **`selectors.ts`** — The filtering engine. Highest-leverage tests:
   - `matchesSearch` matches name, tags, uploader, format, case-insensitive
   - `matchesFilters` applies all six filter dimensions (type, format, size, date, uploader, tag)
   - `isInSelection` correctly routes to type/tag/smart filters
   - `selectVisibleAssets` composes all three correctly
   - Trashed assets are excluded from active views and shown only in trash

2. **`assetOps.ts`** — Lifecycle operations:
   - `deleteAsset` sets `deletedAt` to the current ISO time
   - `restoreAsset` clears `deletedAt`
   - `permanentDelete` removes the asset entirely
   - `emptyTrash` removes all trashed assets
   - Undo payload correctly captures the prior state for restoration

3. **`persistence.ts`** — Save/load roundtrip:
   - `loadState()` returns null for missing key
   - `saveState(state)` followed by `loadState()` returns the same data
   - Corrupt data is discarded (returns null, doesn't throw)
   - Versioned key handles future bumps

4. **`uploadParser.ts`** — File → Asset conversion:
   - `parseFile(imageFile)` infers type='image' and reads dimensions
   - `parseFile(videoFile)` infers type='video' and reads duration
   - Format is uppercased extension
   - `previewDataUrl` is generated for image files
   - Rejects with a clear error for unknown types

5. **`toast` undo flow** — End-to-end reducer + toast:
   - Dispatching DELETE shows a toast with Undo
   - Clicking Undo within the timer restores the asset
   - Toast auto-dismisses after 4s with no Undo click

6. **`keymap`** — Shortcut resolution:
   - `/` focuses the search input
   - `1` switches to grid, `2` switches to list
   - Shortcuts don't fire while typing in an input (scope = 'editing')
   - `?` opens the help modal

### Testing approach

- **Vitest** (Vite's native test runner) for unit tests on the modules above.
- **React Testing Library** for any component-level behavior tests.
- No end-to-end tests (Playwright) in the initial scope — out of budget.
- No visual regression tests in the initial scope.

### What's NOT tested (explicit)

- The styling (CSS modules, tokens).
- The static composition in `App.tsx` — it changes too often.
- The mock data file.

## Out of Scope

- **No backend, no auth, no multi-user sync.** This is a single-user client-side app.
- **No real binary file storage.** Thumbnails only. Large uploads don't survive reloads.
- **No light/dark theme toggle.** Light theme only.
- **No mobile/tablet layout.** Desktop-only with a friendly fallback for narrow screens.
- **No bulk operations.** Single-select only.
- **No file replacement or versioning.** Delete + re-upload is the workflow.
- **No drag-to-reorder within the grid, drag-to-tag, or any drag interaction other than file upload.**
- **No end-to-end or visual regression tests** in the initial scope. Unit tests on the deep modules only.

## Further Notes

- The reference mockup is at `C:/Users/Administrator/Downloads/asset_browser_mockup.html`. The CSS variables in `src/styles/tokens.css` are a 1:1 port of the design tokens it uses.
- Phase 1 (scaffold + static composition) is already complete. The remaining work is Phases 2-5.
- The phasing plan (locked):
  - **Phase 2** — State + Context + selection + sidebar filter + search wiring
  - **Phase 3** — Detail panel edits (rename, tags, favorite) + toast system
  - **Phase 4** — Upload (picker + drop) + delete/trash/restore/empty + undo
  - **Phase 5** — List view + sort + filter panel + keyboard shortcuts + a11y polish
- Each phase is a runnable, demoable increment.
- No issue tracker is currently configured for this project. To publish this PRD to GitHub Issues or another tracker, run `/setup-matt-pocock-skills` first.
