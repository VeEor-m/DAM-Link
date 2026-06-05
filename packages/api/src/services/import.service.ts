import { AppError } from '../plugins/error-handler.js';
import { newId } from '../lib/ids.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../lib/s3.js';
import { insertAsset } from '../repositories/assets.repo.js';
import { generateThumbnailForAsset } from './thumbnails.service.js';
import { logger } from '../lib/logger.js';
import { ImportManifestSchema, type ImportResult, type ImportManifest } from '@dam-link/contracts';

const THUMBNAIL_CT = 'image/webp';

export interface ImportedFile {
  fieldName: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Process a parsed manifest + thumbnail buffers. Creates draft assets,
 * uploads thumbnails, and (fire-and-forget) generates a server-side thumbnail
 * for each so width/height are populated.
 */
export async function processImport(
  orgId: string,
  userId: string,
  manifestRaw: unknown,
  files: ImportedFile[],
): Promise<ImportResult> {
  const parsed = ImportManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    throw new AppError(422, 'INVALID_MANIFEST', 'Manifest is not valid: ' + parsed.error.issues[0]?.message);
  }
  const manifest: ImportManifest = parsed.data;

  const fileByName = new Map(files.map((f) => [f.filename, f]));

  const imported: ImportResult['imported'] = [];
  const skipped: ImportResult['skipped'] = [];

  for (const entry of manifest.assets) {
    const serverId = newId();
    const objectKey = `imports/${orgId}/${serverId}/placeholder`;
    const thumbnailFilename = entry.thumbnailFilename;
    const file = thumbnailFilename ? fileByName.get(thumbnailFilename) : undefined;

    if (thumbnailFilename && !file) {
      skipped.push({ clientId: entry.clientId, reason: `thumbnail file "${thumbnailFilename}" not found in upload` });
      continue;
    }

    try {
      await insertAsset({
        id: serverId,
        orgId,
        uploadedBy: userId,
        name: entry.name,
        type: entry.type,
        format: entry.format.toUpperCase(),
        mimeType: entry.mimeType ?? 'application/octet-stream',
        size: entry.size ?? 0,
        objectKey,
        status: 'ready',
        tags: entry.tags,
        favorite: entry.favorite,
        uploadedAt: entry.uploadedAt ? new Date(entry.uploadedAt) : new Date(),
        width: entry.width ?? null,
        height: entry.height ?? null,
        duration: entry.duration ?? null,
      });

      if (file) {
        const thumbKey = `thumbnails/${orgId}/${serverId}.webp`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: thumbKey,
          Body: file.buffer,
          ContentType: file.mimeType || THUMBNAIL_CT,
        }));
        // Update with thumbnailKey + correct mime
        const { updateAsset } = await import('../repositories/assets.repo.js');
        await updateAsset(orgId, serverId, { thumbnailKey: thumbKey, mimeType: file.mimeType || 'image/webp' });
        // Fire-and-forget a real sharp pipeline so we get a clean WebP and any
        // missing width/height. If there's no original, this will mark the
        // asset as failed — that's OK for the MVP because the user re-uploads
        // originals later.
        const refreshed = await (await import('../repositories/assets.repo.js')).findAssetById(orgId, serverId);
        if (refreshed) {
          // Pass the uploaded thumbnail bytes as a placeholder object
          // by writing them to the objectKey first; the thumbnail service
          // expects an existing original.
          await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: objectKey,
            Body: file.buffer,
            ContentType: file.mimeType || THUMBNAIL_CT,
          }));
          void generateThumbnailForAsset(refreshed);
        }
      }

      imported.push({ clientId: entry.clientId, serverId, name: entry.name });
    } catch (err) {
      logger.error({ err, clientId: entry.clientId }, 'import: failed to insert asset');
      skipped.push({ clientId: entry.clientId, reason: 'insert failed' });
    }
  }

  return { imported, skipped };
}
