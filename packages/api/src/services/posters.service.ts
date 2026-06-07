import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../lib/s3.js';
import { extractFrame, isFfmpegAvailable } from '../lib/ffmpeg.js';
import { updateAsset } from '../repositories/assets.repo.js';
import { AppError } from '../plugins/error-handler.js';
import { logger } from '../lib/logger.js';
import type { Asset } from '../db/schema.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const POSTER_PREFIX = 'previews';

/** S3 key for a given asset's poster. */
export function posterKeyFor(orgId: string, assetId: string): string {
  return `${POSTER_PREFIX}/${orgId}/${assetId}-poster.jpg`;
}

/** Read an S3 object into a local tmp file. */
async function downloadToTmp(key: string, tmpPath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const stream = res.Body as NodeJS.ReadableStream | undefined;
  if (!stream) throw new Error(`downloadToTmp: empty body for ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk as Buffer);
  }
  await fs.writeFile(tmpPath, Buffer.concat(chunks));
}

export interface PosterResult {
  posterKey: string;
  width: number;
  height: number;
}

/**
 * Generate a poster (first-frame JPEG) for a video asset.
 * - Downloads the original to a tmp file
 * - Calls ffmpeg to extract a 1s keyframe as JPEG (max width 1280)
 * - Uploads to previews/{orgId}/{assetId}-poster.jpg
 * - Updates assets.posterKey
 *
 * Throws AppError(500, 'FFMPEG_UNAVAILABLE', ...) if ffmpeg is not on PATH.
 */
export async function generatePosterForAsset(asset: Asset): Promise<PosterResult> {
  if (asset.type !== 'video') {
    throw new Error(`generatePosterForAsset: asset ${asset.id} is not a video`);
  }
  if (!(await isFfmpegAvailable())) {
    throw new AppError(500, 'FFMPEG_UNAVAILABLE', 'ffmpeg is not installed on this server');
  }

  const posterKey = posterKeyFor(asset.orgId, asset.id);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'poster-'));
  const tmpIn = path.join(tmpDir, 'in');
  const tmpOut = path.join(tmpDir, 'out.jpg');

  try {
    await downloadToTmp(asset.objectKey, tmpIn);
    await extractFrame(tmpIn, tmpOut, { seekSeconds: 1.0, maxWidth: 1280 });
    const body = await fs.readFile(tmpOut);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: posterKey,
      Body: body,
      ContentType: 'image/jpeg',
    }));
    await updateAsset(asset.orgId, asset.id, { posterKey });
    logger.info({ assetId: asset.id, posterKey, sizeBytes: body.length }, 'poster generated');
    return { posterKey, width: 0, height: 0 }; // dimensions parsed by browser on load
  } catch (err) {
    logger.error({ err, assetId: asset.id }, 'poster generation failed');
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Fire-and-forget wrapper. */
export function enqueuePoster(asset: Asset): void {
  void generatePosterForAsset(asset).catch((err) => {
    logger.error({ err, assetId: asset.id }, 'poster job crashed');
  });
}
