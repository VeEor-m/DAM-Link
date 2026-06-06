import { api } from './client.js';

export interface ShareLink {
  id: string;
  assetId: string;
  orgId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  hasPassword: boolean;
}

export interface CreateShareLinkInput {
  password?: string;
  expiresAt?: string; // ISO 8601
}

export async function createShareLink(
  orgId: string,
  assetId: string,
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  return api<ShareLink>(`/orgs/${orgId}/assets/${assetId}/share-links`, {
    method: 'POST',
    body: input,
  });
}

export async function listShareLinks(orgId: string, assetId: string): Promise<ShareLink[]> {
  return api<ShareLink[]>(`/orgs/${orgId}/assets/${assetId}/share-links`);
}

export async function revokeShareLink(orgId: string, linkId: string): Promise<void> {
  await api<void>(`/orgs/${orgId}/share-links/${linkId}`, { method: 'DELETE' });
}
