import { AppError } from '../plugins/error-handler.js';
import {
  createOrg as createOrgRow,
  deleteOrg as deleteOrgRow,
  findOrgById,
  findAvailableSlug,
  updateOrg as updateOrgRow,
} from '../repositories/orgs.repo.js';
import {
  createMembership,
  deleteMembership,
  isLastOwner,
  listMembershipsByUser,
} from '../repositories/memberships.repo.js';
import { slugify } from '../lib/slug.js';
import type { Org } from '../db/schema.js';
import type { Role } from '@dam-link/contracts';

export async function createOrgForUser(
  userId: string,
  input: { name: string },
): Promise<{ org: Org; role: Role }> {
  const slug = await findAvailableSlug(slugify(input.name));
  const org = await createOrgRow({ name: input.name, slug, createdAt: new Date() });
  await createMembership({ userId, orgId: org.id, role: 'owner' });
  return { org, role: 'owner' };
}

export async function listOrgsForUser(
  userId: string,
): Promise<Array<{ org: Org; role: Role }>> {
  const memberships = await listMembershipsByUser(userId);
  const out: Array<{ org: Org; role: Role }> = [];
  for (const m of memberships) {
    const org = await findOrgById(m.orgId);
    if (org) out.push({ org, role: m.role });
  }
  return out;
}

export async function getOrgContextForUser(
  userId: string,
  orgId: string,
): Promise<{ org: Org; role: Role } | null> {
  const org = await findOrgById(orgId);
  if (!org) return null;
  const memberships = await listMembershipsByUser(userId);
  const m = memberships.find((x) => x.orgId === orgId);
  return m ? { org, role: m.role } : null;
}

export async function renameOrg(orgId: string, name: string): Promise<Org> {
  return updateOrgRow(orgId, { name });
}

export async function deleteOrgAsOwner(userId: string, orgId: string): Promise<void> {
  if (await isLastOwner(orgId, userId)) {
    throw new AppError(409, 'LAST_OWNER', 'Cannot delete an org with only one owner');
  }
  await deleteOrgRow(orgId);
}

export async function leaveOrg(userId: string, orgId: string): Promise<void> {
  if (await isLastOwner(orgId, userId)) {
    throw new AppError(409, 'LAST_OWNER', 'Cannot leave an org as the last owner');
  }
  await deleteMembership(userId, orgId);
}
