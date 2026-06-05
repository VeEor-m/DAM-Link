import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';
import { seedOrgWith } from './helpers/seed.js';
import { findAssetById, insertAsset } from '../src/repositories/assets.repo.js';
import { generateThumbnailForAsset, enqueueThumbnail, retryThumbnail } from '../src/services/thumbnails.service.js';
import { s3 as prodS3, BUCKET } from '../src/lib/s3.js';

/** A real 100x80 red PNG. */
async function makePng(): Promise<Buffer> {
  return sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
}

describe('thumbnail generation', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('generateThumbnailForAsset reads the original, writes a WebP, and updates the row', async () => {
    const org = await seedOrgWith('o@e.com', 'Org');
    const png = await makePng();
    const objectKey = `originals/${org.orgId}/asset1.png`;
    await prodS3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: png, ContentType: 'image/png' }));

    const inserted = await insertAsset({
      orgId: org.orgId,
      uploadedBy: org.ownerId,
      name: 'red.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: png.length,
      objectKey,
      status: 'ready',
      tags: [],
      favorite: false,
    });

    const result = await generateThumbnailForAsset(inserted);
    expect(result).not.toBeNull();
    expect(result!.thumbnailKey).toBe(`thumbnails/${org.orgId}/${inserted.id}.webp`);

    // The thumbnail object exists in S3
    const head = await prodS3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: result!.thumbnailKey }));
    expect(head.ContentLength).toBeGreaterThan(0);
    expect(head.ContentType).toBe('image/webp');

    // The asset row was updated
    const reloaded = await findAssetById(org.orgId, inserted.id);
    expect(reloaded?.thumbnailKey).toBe(result!.thumbnailKey);
    expect(reloaded?.width).toBe(100);
    expect(reloaded?.height).toBe(80);
  });

  it('skips non-image mime types', async () => {
    const org = await seedOrgWith('o@e.com', 'Org');
    const asset = await insertAsset({
      orgId: org.orgId,
      uploadedBy: org.ownerId,
      name: 'doc.pdf',
      type: 'document',
      format: 'PDF',
      mimeType: 'application/pdf',
      size: 100,
      objectKey: 'originals/x/doc.pdf',
      status: 'ready',
      tags: [],
      favorite: false,
    });
    const result = await generateThumbnailForAsset(asset);
    expect(result).toBeNull();
  });

  it('marks the asset as failed if the original is missing', async () => {
    const org = await seedOrgWith('o@e.com', 'Org');
    const asset = await insertAsset({
      orgId: org.orgId,
      uploadedBy: org.ownerId,
      name: 'missing.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: 100,
      objectKey: 'originals/does/not/exist.png',
      status: 'ready',
      tags: [],
      favorite: false,
    });
    await expect(generateThumbnailForAsset(asset)).rejects.toThrow();
    const reloaded = await findAssetById(org.orgId, asset.id);
    expect(reloaded?.status).toBe('failed');
  });

  it('enqueueThumbnail is fire-and-forget (no throw on missing object)', async () => {
    const org = await seedOrgWith('o@e.com', 'Org');
    const asset = await insertAsset({
      orgId: org.orgId,
      uploadedBy: org.ownerId,
      name: 'x.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: 1,
      objectKey: 'originals/x/missing.png',
      status: 'ready',
      tags: [],
      favorite: false,
    });
    expect(() => enqueueThumbnail(asset)).not.toThrow();
    // Give the fire-and-forget a moment to settle.
    await new Promise((r) => setTimeout(r, 200));
  });

  it('retryThumbnail regenerates and updates the row', async () => {
    const org = await seedOrgWith('o@e.com', 'Org');
    const png = await makePng();
    const objectKey = `originals/${org.orgId}/retry.png`;
    await prodS3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: png, ContentType: 'image/png' }));
    const asset = await insertAsset({
      orgId: org.orgId,
      uploadedBy: org.ownerId,
      name: 'retry.png',
      type: 'image',
      format: 'PNG',
      mimeType: 'image/png',
      size: png.length,
      objectKey,
      status: 'failed',
      tags: [],
      favorite: false,
    });
    const result = await retryThumbnail(org.orgId, asset.id);
    expect(result).not.toBeNull();
    const reloaded = await findAssetById(org.orgId, asset.id);
    expect(reloaded?.status).toBe('ready');
    expect(reloaded?.thumbnailKey).toMatch(new RegExp(`^thumbnails/${org.orgId}/.+\\.webp$`));
  });
});
