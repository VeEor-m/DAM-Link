import { S3Client, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadConfig } from '../config.js';

const config = loadConfig();

export const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
});

export const BUCKET = config.S3_BUCKET;

/** Check that the configured bucket exists and is reachable. */
export async function pingS3(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return true;
  } catch {
    return false;
  }
}

/** Check that a specific object exists. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'NotFound') return false;
    throw err;
  }
}

/** Presigned PUT URL for direct browser upload. */
export const presignPut = (
  key: string,
  opts: { contentLength?: number; contentType?: string; expiresInSec?: number } = {},
): Promise<string> => {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });
  return getSignedUrl(s3, cmd, { expiresIn: opts.expiresInSec ?? 300 });
};

/** Presigned GET URL for direct browser download. */
export const presignGet = (key: string, expiresInSec = 300): Promise<string> => {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
};

export { HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
