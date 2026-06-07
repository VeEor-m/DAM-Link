import { api } from './client.js';
import type { Asset, AssetListQuery, SidebarCounts } from '@dam-link/contracts';

export async function listAssets(orgId: string, q: AssetListQuery): Promise<{ items: Asset[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    if (Array.isArray(v)) params.set(k, v.join(','));
    else params.set(k, String(v));
  }
  return api(`/orgs/${orgId}/assets?${params.toString()}`);
}

export async function getAsset(orgId: string, id: string): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}`);
}

export async function updateAsset(orgId: string, id: string, patch: { name?: string; tags?: string[]; favorite?: boolean; visibility?: 'private' | 'org' | 'link' }): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}`, { method: 'PATCH', body: patch });
}

export async function softDelete(orgId: string, id: string): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}/soft-delete`, { method: 'POST' });
}

export async function restore(orgId: string, id: string): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}/restore`, { method: 'POST' });
}

export async function permanentDelete(orgId: string, id: string): Promise<void> {
  await api(`/orgs/${orgId}/assets/${id}`, { method: 'DELETE' });
}

export async function emptyTrash(orgId: string): Promise<{ deletedCount: number }> {
  return api(`/orgs/${orgId}/assets/empty-trash`, { method: 'POST' });
}

export async function sidebarCounts(orgId: string): Promise<SidebarCounts> {
  return api(`/orgs/${orgId}/assets/sidebar-counts`);
}

export async function getDownloadUrl(orgId: string, id: string): Promise<{ downloadUrl: string }> {
  return api<{ downloadUrl: string }>(`/orgs/${orgId}/assets/${id}/download-url`);
}

/** Alias for getDownloadUrl; named to convey "this URL is meant for
 *  <video>/<audio>/<img> playback, not for browser downloads". The server
 *  returns the same presigned URL in both cases. */
export const getPlaybackUrl = getDownloadUrl;
