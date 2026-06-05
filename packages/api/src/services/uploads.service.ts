import { AppError } from '../plugins/error-handler.js';
import { newId } from '../lib/ids.js';
import { presignPut, s3, BUCKET } from '../lib/s3.js';
import { insertAsset, updateAsset, findAssetById } from '../repositories/assets.repo.js';
import { enqueueThumbnail } from './thumbnails.service.js';
import type {
  InitiateUploadInput,
  InitiateUploadResponse,
} from '@dam-link/contracts';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

const PRESIGN_EXPIRES_SEC = 5 * 60; // 5 minutes

/** Slug a filename so it is safe in an S3 key. */
function safeFilename(name: string): string {
  // Strip path separators and characters that are weird in URLs.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'file';
}

export async function initiateUpload(
  orgId: string,
  userId: string,
  input: InitiateUploadInput,
): Promise<InitiateUploadResponse> {
  const assetId = newId();
  const objectKey = `originals/${orgId}/${assetId}/${safeFilename(input.filename)}`;

  // Create the draft asset row up front so the assetId is owned by the org
  // before the browser starts uploading.
  await insertAsset({
    id: assetId,
    orgId,
    uploadedBy: userId,
    name: input.filename,
    type: input.type,
    format: input.format.toUpperCase(),
    mimeType: input.mimeType,
    size: input.size,
    objectKey,
    status: 'pending',
    tags: [],
    favorite: false,
  });

  const uploadUrl = await presignPut(objectKey, {
    contentLength: input.size,
    contentType: input.mimeType,
    expiresInSec: PRESIGN_EXPIRES_SEC,
  });

  return { assetId, uploadUrl, objectKey, expiresInSec: PRESIGN_EXPIRES_SEC };
}

export async function finalizeUpload(
  orgId: string,
  assetId: string,
  meta: { width?: number; height?: number; duration?: number },
): Promise<{ id: string; status: 'ready' }> {
  const existing = await findAssetById(orgId, assetId);
  if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (existing.status === 'ready') {
    // Idempotent: return success without re-finalizing.
    return { id: existing.id, status: 'ready' };
  }
  if (existing.status === 'failed') {
    throw new AppError(409, 'UPLOAD_FAILED', 'This asset previously failed to process');
  }

  // Verify the object actually landed in S3.
  let head;
  try {
    head = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: existing.objectKey }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'NotFound') {
      throw new AppError(
        409,
        'UPLOAD_NOT_FOUND',
        'No object found at the expected S3 key. Did the browser PUT succeed?',
      );
    }
    throw err;
  }

  if (typeof head.ContentLength === 'number' && head.ContentLength !== existing.size) {
    throw new AppError(
      409,
      'SIZE_MISMATCH',
      `Uploaded file size (${head.ContentLength}) does not match the declared size (${existing.size})`,
    );
  }

  const updated = await updateAsset(orgId, assetId, {
    status: 'ready',
    width: meta.width ?? existing.width,
    height: meta.height ?? existing.height,
    duration: meta.duration ?? existing.duration,
  });

  // Fetch the freshly-updated row so the thumbnail job has the latest
  // status ('ready'), width, and height.
  const refreshed = await findAssetById(orgId, assetId);
  if (refreshed) enqueueThumbnail(refreshed);
  return { id: updated.id, status: 'ready' };
}
