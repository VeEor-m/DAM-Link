import { AppError } from '../plugins/error-handler.js';
import { newToken } from '../lib/ids.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  findShareLinkById,
  findShareLinkByToken,
  listShareLinksForAsset,
  createShareLink,
  revokeShareLink,
} from '../repositories/share-links.repo.js';
import { findAssetById } from '../repositories/assets.repo.js';
import { presignGet } from '../lib/s3.js';
import { logger } from '../lib/logger.js';
import type { ShareLink, NewShareLink } from '../db/schema.js';
import type { CreateShareLinkInput, PublicShareInfo } from '@dam-link/contracts';

const DOWNLOAD_TTL_SEC = 5 * 60;
const THUMBNAIL_TTL_SEC = 60 * 60;

function toPublic(s: ShareLink) {
  return {
    id: s.id,
    assetId: s.assetId,
    orgId: s.orgId,
    token: s.token,
    createdBy: s.createdBy,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
    hasPassword: !!s.passwordHash,
  };
}

/** True if the link is redeemable right now (not expired, not revoked). */
export function isLinkRedeemable(s: ShareLink, now: Date = new Date()): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export async function createShareLinkForAsset(
  orgId: string,
  userId: string,
  assetId: string,
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  const asset = await findAssetById(orgId, assetId);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.visibility === 'private') {
    throw new AppError(
      409,
      'ASSET_PRIVATE',
      'Asset visibility is "private"; change it to "link" or "org" before sharing',
    );
  }

  const token = newToken(32);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const row: NewShareLink = {
    assetId,
    orgId,
    token,
    createdBy: userId,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    passwordHash,
  };
  const link = await createShareLink(row);
  logger.info({ assetId, linkId: link.id, hasPassword: !!passwordHash }, 'share link created');
  return link;
}

export async function listShareLinks(orgId: string, assetId: string): Promise<ShareLink[]> {
  const asset = await findAssetById(orgId, assetId);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return listShareLinksForAsset(assetId);
}

export async function revokeLinkAsOwner(orgId: string, linkId: string): Promise<void> {
  const link = await findShareLinkById(linkId);
  if (!link) throw new AppError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found');
  if (link.orgId !== orgId) {
    // Don't leak existence across orgs.
    throw new AppError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found');
  }
  await revokeShareLink(linkId);
}

/* -------------------------------------------------------------------------- */
/* Public redemption                                                          */
/* -------------------------------------------------------------------------- */

export async function getPublicShareInfo(token: string): Promise<PublicShareInfo> {
  const link = await findShareLinkByToken(token);
  if (!link || !isLinkRedeemable(link)) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  const asset = await findAssetById(link.orgId, link.assetId);
  if (!asset) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  if (asset.visibility === 'private') {
    throw new AppError(403, 'SHARE_LINK_FORBIDDEN', 'Asset is not shared');
  }

  const thumbnailUrl = asset.thumbnailKey ? await presignGet(asset.thumbnailKey, THUMBNAIL_TTL_SEC) : null;

  return {
    asset: {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      format: asset.format,
      size: asset.size,
    },
    hasPassword: !!link.passwordHash,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    thumbnailUrl,
  };
}

export async function unlockShareLink(
  token: string,
  password: string,
): Promise<{ downloadUrl: string }> {
  const link = await findShareLinkByToken(token);
  if (!link || !isLinkRedeemable(link)) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  if (!link.passwordHash) {
    // No password set; nothing to unlock. Caller should have used the public info route.
    throw new AppError(400, 'NO_PASSWORD', 'This link has no password');
  }
  const ok = await verifyPassword(link.passwordHash, password);
  if (!ok) {
    // Constant-time-style: do not reveal whether the password was close.
    throw new AppError(401, 'INVALID_PASSWORD', 'Invalid password');
  }
  const asset = await findAssetById(link.orgId, link.assetId);
  if (!asset) throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');

  const downloadUrl = await presignGet(asset.objectKey, DOWNLOAD_TTL_SEC);
  return { downloadUrl };
}

export async function getDownloadUrlForToken(token: string): Promise<{ downloadUrl: string }> {
  const link = await findShareLinkByToken(token);
  if (!link || !isLinkRedeemable(link)) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  if (link.passwordHash) {
    // Refuse direct download for password-protected links; the client must unlock first.
    throw new AppError(401, 'PASSWORD_REQUIRED', 'Password required');
  }
  const asset = await findAssetById(link.orgId, link.assetId);
  if (!asset) throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  if (asset.visibility === 'private') {
    throw new AppError(403, 'SHARE_LINK_FORBIDDEN', 'Asset is not shared');
  }
  const downloadUrl = await presignGet(asset.objectKey, DOWNLOAD_TTL_SEC);
  return { downloadUrl };
}

export const toPublicShareLink = toPublic;
