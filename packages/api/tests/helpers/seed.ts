import { insertAsset } from '../../src/repositories/assets.repo.js';
import { createMembership } from '../../src/repositories/memberships.repo.js';
import { createOrg } from '../../src/repositories/orgs.repo.js';
import { createUser } from '../../src/repositories/users.repo.js';
import type { AssetType, Role } from '@dam-link/contracts';

export interface SeededOrg {
  ownerId: string;
  ownerSession: string;
  orgId: string;
  viewerId?: string;
  editorId?: string;
}

export interface SeededAsset {
  id?: string;
  name: string;
  type: AssetType;
  format: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
  tags: string[];
  favorite: boolean;
  deletedAt: Date | null;
  visibility: 'private' | 'org' | 'link';
  width: number | null;
  height: number | null;
  duration: number | null;
}

export async function seedUser(email: string): Promise<string> {
  const u = await createUser({ email, passwordHash: 'h', displayName: email });
  return u.id;
}

export async function seedOrgWith(
  ownerEmail: string,
  orgName: string,
  members: Array<{ email: string; role: Exclude<Role, 'owner'> }> = [],
): Promise<SeededOrg> {
  const owner = await createUser({ email: ownerEmail, passwordHash: 'h', displayName: ownerEmail });
  const org = await createOrg({ name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-'), createdAt: new Date() });
  await createMembership({ userId: owner.id, orgId: org.id, role: 'owner' });
  const out: SeededOrg = { ownerId: owner.id, ownerSession: '', orgId: org.id };
  for (const m of members) {
    const u = await createUser({ email: m.email, passwordHash: 'h', displayName: m.email });
    await createMembership({ userId: u.id, orgId: org.id, role: m.role });
    if (m.role === 'viewer') out.viewerId = u.id;
    if (m.role === 'editor') out.editorId = u.id;
  }
  return out;
}

export async function seedAsset(
  orgId: string,
  uploaderId: string,
  partial: Partial<SeededAsset> = {},
): Promise<string> {
  const row = await insertAsset({
    ...(partial.id ? { id: partial.id } : {}),
    orgId,
    uploadedBy: uploaderId,
    name: partial.name ?? 'untitled.png',
    type: (partial.type ?? 'image') as AssetType,
    format: partial.format ?? 'PNG',
    size: partial.size ?? 1000,
    mimeType: 'image/png',
    uploadedAt: partial.uploadedAt ?? new Date(),
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    deletedAt: partial.deletedAt ?? null,
    objectKey: `originals/${orgId}/${partial.id ?? 'placeholder'}`,
    status: 'ready',
    visibility: partial.visibility ?? 'org',
    width: partial.width ?? null,
    height: partial.height ?? null,
    duration: partial.duration ?? null,
  });
  return row.id;
}
