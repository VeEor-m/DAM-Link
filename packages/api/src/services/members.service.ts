import { AppError } from '../plugins/error-handler.js';
import {
  createMembership,
  deleteMembership,
  findMembership,
  isLastOwner,
  listMembershipsByOrg,
  updateMembershipRole,
} from '../repositories/memberships.repo.js';
import { findUserByEmail } from '../repositories/users.repo.js';
import { countAssetsInOrg } from '../repositories/assets.repo.js';
import type { Role } from '@dam-link/contracts';
import type { Org, Membership } from '../db/schema.js';

export async function listMembers(orgId: string) {
  return listMembershipsByOrg(orgId);
}

export async function inviteMember(
  orgId: string,
  input: { email: string; role: Exclude<Role, 'owner'> },
): Promise<Membership> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new AppError(
      422,
      'USER_NOT_FOUND',
      'No registered user with that email. They must register first.',
    );
  }
  const existing = await findMembership(user.id, orgId);
  if (existing) {
    throw new AppError(409, 'ALREADY_MEMBER', 'User is already a member of this org');
  }
  return createMembership({ userId: user.id, orgId, role: input.role });
}

export async function changeMemberRole(
  orgId: string,
  userId: string,
  role: Role,
): Promise<Membership> {
  const existing = await findMembership(userId, orgId);
  if (!existing) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'User is not a member of this org');
  }
  if (existing.role === 'owner' && role !== 'owner') {
    if (await isLastOwner(orgId, userId)) {
      throw new AppError(409, 'LAST_OWNER', 'Cannot demote the last owner');
    }
  }
  return updateMembershipRole(userId, orgId, role);
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const existing = await findMembership(userId, orgId);
  if (!existing) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'User is not a member of this org');
  }
  if (existing.role === 'owner' && (await isLastOwner(orgId, userId))) {
    throw new AppError(409, 'LAST_OWNER', 'Cannot remove the last owner');
  }
  await deleteMembership(userId, orgId);
}

export async function getOrgStats(orgId: string): Promise<{ memberCount: number; assetCount: number }> {
  const { countMembers } = await import('../repositories/memberships.repo.js');
  const [memberCount, assetCount] = await Promise.all([
    countMembers(orgId),
    countAssetsInOrg(orgId),
  ]);
  return { memberCount, assetCount };
}

export type { Org };
