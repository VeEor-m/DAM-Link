import { AppError } from '../plugins/error-handler.js';
import { newId } from '../lib/ids.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../lib/s3.js';
import { insertAsset, updateAsset, deleteAssetHard } from '../repositories/assets.repo.js';
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
 * Process a parsed manifest + thumbnail buffers. Creates ready assets and
 * uploads their client-supplied thumbnails.
 *
 * MVP trade-off: the import bundle carries thumbnails but not the original
 * file bytes, so we do NOT run a server-side sharp pipeline here. status
 * is 'ready' (the thumbnail is already in S3) and the user re-uploads
 * originals later, at which point the standard upload pipeline generates
 * (or regenerates) thumbnails.
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

    // Roll back the row if anything after insertAsset fails (e.g. the S3
    // upload throws). Without this we'd leave an asset with thumbnailKey=null
    // and no UI surfacing.
    let inserted = false;
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
      inserted = true;

      if (file) {
        const thumbKey = `thumbnails/${orgId}/${serverId}.webp`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: thumbKey,
          Body: file.buffer,
          ContentType: file.mimeType || THUMBNAIL_CT,
        }));
        await updateAsset(orgId, serverId, { thumbnailKey: thumbKey, mimeType: file.mimeType || 'image/webp' });
      }

      imported.push({ clientId: entry.clientId, serverId, name: entry.name });
    } catch (err) {
      logger.error({ err, clientId: entry.clientId, serverId }, 'import: failed to process asset');
      if (inserted) {
        try {
          await deleteAssetHard(orgId, serverId);
        } catch (rollbackErr) {
          logger.error(
            { err: rollbackErr, clientId: entry.clientId, serverId },
            'import: rollback deleteAssetHard failed',
          );
        }
      }
      skipped.push({ clientId: entry.clientId, reason: 'insert failed' });
    }
  }

  return { imported, skipped };
}
