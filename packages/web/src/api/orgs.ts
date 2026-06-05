import { api } from './client.js';
import type { Org, Role } from '@dam-link/contracts';

export async function listMyOrgs(): Promise<Array<{ org: Org; role: Role }>> {
  return api('/orgs');
}

export async function createOrg(input: { name: string }): Promise<{ org: Org; role: Role }> {
  return api('/orgs', { method: 'POST', body: input });
}

export async function getOrg(orgId: string): Promise<{ org: Org; role: Role; memberCount: number; assetCount: number }> {
  return api(`/orgs/${orgId}`);
}
