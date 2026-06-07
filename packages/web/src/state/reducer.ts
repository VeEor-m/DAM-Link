import type { AppState, FilterState } from './types';
import type { Action } from './actions';

const EMPTY_FILTER: FilterState = {
  typeFilter: [],
  formatFilter: [],
  sizeBucket: null,
  dateBucket: 'all',
  uploaderFilter: [],
};

function patchFromAction(
  action:
    | { type: 'UPDATE_ASSET'; patch: Record<string, unknown> }
    | { type: 'TOGGLE_FAVORITE' }
    | { type: 'RENAME_ASSET'; name: string }
    | { type: 'ADD_TAG'; tag: string }
    | { type: 'REMOVE_TAG'; tag: string },
): Record<string, unknown> {
  switch (action.type) {
    case 'UPDATE_ASSET':
      return action.patch;
    case 'TOGGLE_FAVORITE':
      return {}; // computed below
    case 'RENAME_ASSET':
      return { name: action.name };
    case 'ADD_TAG':
      return {}; // computed below
    case 'REMOVE_TAG':
      return {}; // computed below
  }
}

/**
 * Pure state reducer. Kept in its own file (not store.tsx) so it can be
 * unit-tested without going through the React provider, and so HMR works
 * correctly (`.tsx` files can only export components per react-refresh).
 */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE_STATE':
      // Spread the ui to avoid TypeScript inferring a narrower literal type
      // when the discriminated union grows (HYDRATE_STATE's payload `ui` is
      // typed as UIState, but the case's return must also be AppState).
      return { assets: action.state.assets, ui: { ...action.state.ui } };
    case 'SET_SEARCH':
      return { ...state, ui: { ...state.ui, searchQuery: action.query } };
    case 'SET_SELECTION':
      return { ...state, ui: { ...state.ui, selection: action.selection } };
    case 'SET_VIEW_MODE':
      return { ...state, ui: { ...state.ui, viewMode: action.mode } };
    case 'SELECT_ASSET':
      return { ...state, ui: { ...state.ui, selectedAssetId: action.id } };
    case 'SET_FILTER_PANEL':
      return { ...state, ui: { ...state.ui, filterPanelOpen: action.open } };
    case 'SET_UPLOAD_DIALOG':
      return { ...state, ui: { ...state.ui, uploadDialogOpen: action.open } };
    case 'SET_FILTER':
      return {
        ...state,
        ui: {
          ...state.ui,
          filter: { ...state.ui.filter, ...action.filter },
        },
      };
    case 'CLEAR_FILTERS':
      return { ...state, ui: { ...state.ui, filter: { ...EMPTY_FILTER } } };
    case 'SET_SORT':
      return {
        ...state,
        ui: { ...state.ui, sortKey: action.sortKey, sortDir: action.sortDir },
      };
    case 'TOGGLE_BATCH_SELECT': {
      const has = state.ui.selectedIds.includes(action.id);
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedIds: has
            ? state.ui.selectedIds.filter((x) => x !== action.id)
            : [...state.ui.selectedIds, action.id],
        },
      };
    }
    case 'CLEAR_BATCH_SELECTION':
      return { ...state, ui: { ...state.ui, selectedIds: [] } };
    case 'SELECT_ALL_VISIBLE':
      return { ...state, ui: { ...state.ui, selectedIds: [...action.ids] } };
    case 'ADD_ASSET':
      return { ...state, assets: [action.asset, ...state.assets] };
    case 'UPDATE_ASSET':
    case 'TOGGLE_FAVORITE':
    case 'RENAME_ASSET':
    case 'ADD_TAG':
    case 'REMOVE_TAG': {
      const patch = patchFromAction(action);
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.id ? { ...a, ...patch } : a,
        ),
      };
    }
    case 'SET_SIDEBAR_COUNTS':
      return { ...state, ui: { ...state.ui, sidebarCounts: action.counts } };
    case 'OPEN_LIGHTBOX':
      return {
        ...state,
        ui: { ...state.ui, lightboxAssetId: action.assetId, selectedAssetId: action.assetId },
      };
    case 'CLOSE_LIGHTBOX':
      return { ...state, ui: { ...state.ui, lightboxAssetId: null } };
    case 'LIGHTBOX_NAVIGATE':
      return {
        ...state,
        ui: { ...state.ui, lightboxAssetId: action.assetId, selectedAssetId: action.assetId },
      };
    default:
      return state;
  }
}
