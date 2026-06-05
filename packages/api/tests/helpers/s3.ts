import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { loadConfig } from '../../src/config.js';
import { BUCKET } from '../../src/lib/s3.js';
import { applyTestEnv } from './env.js';

let s3: S3Client | null = null;

function getClient(): S3Client {
  if (s3) return s3;
  applyTestEnv();
  const config = loadConfig();
  s3 = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    },
  });
  return s3;
}

/** Remove every object in the test bucket. */
export async function flushTestBucket(): Promise<void> {
  applyTestEnv();
  const client = getClient();
  let continuation: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: continuation }),
    );
    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length > 0) {
      await client.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys } }));
    }
    continuation = listed.NextContinuationToken;
  } while (continuation);
}

export async function closeS3(): Promise<void> {
  s3?.destroy();
  s3 = null;
}

export function getTestS3Client(): S3Client {
  return getClient();
}
