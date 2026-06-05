import type { UIState } from './types';

/**
 * The default ephemeral UI state. Used as the fallback for the very
 * first app load (no persisted state) and as the recovery target for
 * the top-level ErrorBoundary's "重试" button.
 */
export const initialUI: UIState = {
  searchQuery: '',
  selection: { kind: 'all' },
  viewMode: 'grid',
  selectedAssetId: null,
  filterPanelOpen: false,
  uploadDialogOpen: false,
  filter: {
    typeFilter: [],
    formatFilter: [],
    sizeBucket: null,
    dateBucket: 'all',
    uploaderFilter: [],
  },
  selectedIds: [],
  sortKey: 'date',
  sortDir: 'desc',
};
