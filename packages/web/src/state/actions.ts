import type {
  Asset,
  FilterState,
  SidebarSelection,
  SortDir,
  SortKey,
  ViewMode,
} from './types';

export type Action =
  // UI
  | { type: 'SET_SEARCH'; query: string }
  | { type: 'SET_SELECTION'; selection: SidebarSelection }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SELECT_ASSET'; id: string | null }
  | { type: 'SET_FILTER_PANEL'; open: boolean }
  | { type: 'SET_UPLOAD_DIALOG'; open: boolean }
  | { type: 'SET_FILTER'; filter: Partial<FilterState> }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_SORT'; sortKey: SortKey; sortDir: SortDir }
  // Multi-select
  | { type: 'TOGGLE_BATCH_SELECT'; id: string }
  | { type: 'CLEAR_BATCH_SELECTION' }
  | { type: 'SELECT_ALL_VISIBLE'; ids: string[] }
  // Assets
  | { type: 'HYDRATE_STATE'; state: { assets: Asset[]; ui: AppState['ui'] } }
  | { type: 'ADD_ASSET'; asset: Asset }
  | { type: 'UPDATE_ASSET'; id: string; patch: Partial<Asset> }
  | { type: 'TOGGLE_FAVORITE'; id: string }
  | { type: 'RENAME_ASSET'; id: string; name: string }
  | { type: 'ADD_TAG'; id: string; tag: string }
  | { type: 'REMOVE_TAG'; id: string; tag: string }
  | { type: 'DELETE_ASSET'; id: string; deletedAt: string }
  | { type: 'RESTORE_ASSET'; id: string }
  | { type: 'PERMANENT_DELETE'; id: string }
  | { type: 'EMPTY_TRASH' }
  // Batch asset mutations
  | { type: 'BATCH_DELETE'; ids: string[]; when: Date }
  | { type: 'BATCH_TOGGLE_FAVORITE'; ids: string[] }
  | { type: 'BATCH_ADD_TAG'; ids: string[]; tag: string }
  | { type: 'BATCH_REMOVE_TAG'; ids: string[]; tag: string };

// `AppState` is the local shape — defined in store.tsx; we use a structural
// type to avoid a circular import. Keep this in sync with the real
// UIState in ./types.ts so action payloads (HYDRATE_STATE) type-check.
interface AppState {
  ui: {
    searchQuery: string;
    selection: SidebarSelection;
    viewMode: ViewMode;
    selectedAssetId: string | null;
    filterPanelOpen: boolean;
    uploadDialogOpen: boolean;
    filter: FilterState;
    selectedIds: string[];
    sortKey: SortKey;
    sortDir: SortDir;
  };
}
