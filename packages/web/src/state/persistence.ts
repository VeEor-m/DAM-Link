import { me } from '../api/auth.js';
import { listMyOrgs } from '../api/orgs.js';
import { listAssets, sidebarCounts } from '../api/assets.js';
import { initialUI } from './initialUI.js';
import type { AppState } from './types.js';
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
      return { assets: [], ui: { ...initialUI, sidebarCounts: null } };
    }
    const listArgs = { limit: 200, sort: 'uploadedAt:desc', dateBucket: 'all' } as const;
    const [activeRes, trashRes] = await Promise.all([
      listAssets(firstOrg.org.id, listArgs),
      listAssets(firstOrg.org.id, { ...listArgs, inTrash: true }),
    ]);
    // The server's default `buildWhereClause` is "active only" so the
    // trash list excludes soft-deleted. The two lists should be disjoint
    // (a row can't be both active and trashed) but we dedupe defensively
    // in case the server contract changes.
    const seen = new Set<string>();
    const items = [...activeRes.items, ...trashRes.items].filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    const counts = await sidebarCounts(firstOrg.org.id).catch(() => null);
    return {
      assets: items.map(apiAssetToLocal),
      ui: { ...initialUI, activeOrgId: firstOrg.org.id, sidebarCounts: counts },
    };
  } catch {
    return null;
  }
}

/** No-op for the API-backed store; the server persists. */
export function saveState(_state: AppState): void {
  // intentional no-op
}
