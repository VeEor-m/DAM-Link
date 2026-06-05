import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../lib/s3.js';
import { generateThumbnail, isProcessableImageMime, probeImage } from '../lib/sharp.js';
import { updateAsset } from '../repositories/assets.repo.js';
import { findAssetById } from '../repositories/assets.repo.js';
import { logger } from '../lib/logger.js';
import type { Asset } from '../db/schema.js';

/** Read an S3 object into a Buffer. */
async function readObject(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const stream = res.Body as NodeJS.ReadableStream | undefined;
  if (!stream) throw new Error(`readObject: empty body for ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function writeObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export interface ThumbnailResult {
  thumbnailKey: string;
  width: number;
  height: number;
}

/**
 * Generate a thumbnail for an asset and persist the result.
 * - For processable images: download original, generate WebP, upload to
 *   thumbnails/{orgId}/{assetId}.webp, update asset.thumbnailKey + dimensions.
 * - For other types: a no-op (returns null).
 *
 * Failures mark the asset status as 'failed' with a metadata.error field.
 */
export async function generateThumbnailForAsset(asset: Asset): Promise<ThumbnailResult | null> {
  if (!isProcessableImageMime(asset.mimeType)) {
    return null;
  }

  const key = `thumbnails/${asset.orgId}/${asset.id}.webp`;

  try {
    const original = await readObject(asset.objectKey);
    const thumb = await generateThumbnail(original);
    await writeObject(key, thumb, 'image/webp');
    const probed = await probeImage(original);

    await updateAsset(asset.orgId, asset.id, {
      thumbnailKey: key,
      width: probed.width,
      height: probed.height,
    });

    logger.info(
      { assetId: asset.id, key, w: probed.width, h: probed.height },
      'thumbnail generated',
    );

    return { thumbnailKey: key, width: probed.width, height: probed.height };
  } catch (err) {
    logger.error({ err, assetId: asset.id }, 'thumbnail generation failed');
    await updateAsset(asset.orgId, asset.id, {
      status: 'failed',
      metadata: { ...(asset.metadata ?? {}), error: 'thumbnail_failed' },
    });
    throw err;
  }
}

/** Fire-and-forget wrapper that catches errors so they don't crash the process. */
export function enqueueThumbnail(asset: Asset): void {
  void generateThumbnailForAsset(asset).catch((err) => {
    logger.error({ err, assetId: asset.id }, 'thumbnail job crashed');
  });
}

/** Re-attempt thumbnail generation for an asset in 'failed' or 'ready' state. */
export async function retryThumbnail(orgId: string, assetId: string): Promise<ThumbnailResult | null> {
  const asset = await findAssetById(orgId, assetId);
  if (!asset) throw new Error(`retryThumbnail: asset ${assetId} not found`);
  // Reset status to ready (was failed) so the UI shows the asset again.
  await updateAsset(orgId, assetId, { status: 'ready' });
  return generateThumbnailForAsset(asset);
}
