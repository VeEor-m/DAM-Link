import { me } from '../api/auth.js';
import { listMyOrgs } from '../api/orgs.js';
import { listAssets, sidebarCounts } from '../api/assets.js';
import type { AppState, UIState } from './types.js';
import { apiAssetToLocal } from './assetAdapter.js';

/**
 * Hydrate AppState from the API. Returns null if the user is not logged in.
 * The returned AppState has the user's first org as the active selection;
 * the UI can offer an org-picker.
 */
export async function loadState(): Promise<AppState | null> {
  try {
    const meRes = await me();
    if (!meRes.user) return null;
    const orgs = await listMyOrgs();
    const firstOrg = orgs[0];
    if (!firstOrg) {
      return { assets: [], ui: defaultUI() };
    }
    const { items } = await listAssets(firstOrg.org.id, { limit: 200, sort: 'uploadedAt:desc', dateBucket: 'all' });
    void (await sidebarCounts(firstOrg.org.id)); // warm the cache; the UI re-fetches on demand
    return {
      assets: items.map(apiAssetToLocal),
      ui: { ...defaultUI(), activeOrgId: firstOrg.org.id },
    };
  } catch {
    return null;
  }
}

function defaultUI(): UIState {
  return {
    searchQuery: '',
    selection: { kind: 'all' },
    viewMode: 'grid',
    selectedAssetId: null,
    filterPanelOpen: false,
    uploadDialogOpen: false,
    filter: { typeFilter: [], formatFilter: [], sizeBucket: null, dateBucket: 'all', uploaderFilter: [] },
    selectedIds: [],
    sortKey: 'date',
    sortDir: 'desc',
    activeOrgId: null,
  };
}

/** No-op for the API-backed store; the server persists. */
export function saveState(_state: AppState): void {
  // intentional no-op
}
