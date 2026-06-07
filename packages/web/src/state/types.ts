// Domain types for the DAM browser.

import type { SidebarCounts } from '@dam-link/contracts';

export type AssetType = 'image' | 'video' | 'document' | 'audio';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  format: string; // uppercase extension: PNG, JPG, MP4, PDF...
  size: number; // bytes
  uploadedAt: string; // ISO 8601
  uploadedBy: string;
  tags: string[];
  favorite: boolean;
  deletedAt: string | null;
  // type-specific
  width?: number;
  height?: number;
  duration?: number; // seconds, for video/audio
  // base64 data URL — only populated for client-side canvas thumbnails
  // (legacy: Plan 8 was localStorage-only). Prefer `_thumbnailUrl` below.
  previewDataUrl?: string;
  /** Presigned URL to the server-rendered thumbnail (image/video) or
   *  document preview, populated by `persistence.loadState()` from the API
   *  list response. Lives on the runtime asset (not persisted) because the
   *  signature expires. `null` means the API didn't return a URL (e.g. the
   *  asset has no thumbnail yet). */
  _thumbnailUrl?: string | null;
}

/** View modes for the main browser pane. */
export type ViewMode = 'grid' | 'list';

/** Sort keys for the asset list/grid. */
export type SortKey = 'name' | 'type' | 'size' | 'date' | 'favorite';

/** Sort direction. */
export type SortDir = 'asc' | 'desc';

/** Sidebar selection. Tagged unions keep the predicate logic explicit. */
export type SidebarSelection =
  | { kind: 'all' }
  | { kind: 'type'; type: AssetType }
  | { kind: 'tag'; tag: string }
  | { kind: 'smart'; smart: SmartCollection };

export type SmartCollection = 'recent' | 'favorites' | 'trash';

export type SizeBucket = 'small' | 'medium' | 'large';
export type DateBucket = '7d' | '30d' | '90d' | 'all';

export interface FilterState {
  typeFilter: AssetType[];
  formatFilter: string[];
  sizeBucket: SizeBucket | null;
  dateBucket: DateBucket;
  uploaderFilter: string[];
}

export interface UIState {
  searchQuery: string;
  selection: SidebarSelection;
  viewMode: ViewMode;
  selectedAssetId: string | null;
  filterPanelOpen: boolean;
  uploadDialogOpen: boolean;
  filter: FilterState;
  /** Ids checked for multi-select / batch operations. Orthogonal to
   *  `selectedAssetId` (the single asset open in the detail panel). */
  selectedIds: string[];
  /** Sort key + direction applied to the visible assets. Lives in UI
   *  state so it persists across view-mode switches and sessions. */
  sortKey: SortKey;
  sortDir: SortDir;
  /** Active org id. Loaded by `loadState()` from the first org the user
   *  belongs to. `null` when the user has no orgs yet. */
  activeOrgId: string | null;
  /** Server-side counts for the sidebar (authoritative, refetched on a
   *  debounce). `null` until the first `loadState()` completes. The
   *  shape matches the `GET /sidebar-counts` response (`SidebarCounts`
   *  in `@dam-link/contracts`). */
  sidebarCounts: SidebarCounts | null;
}

export interface AppState {
  assets: Asset[];
  ui: UIState;
}
