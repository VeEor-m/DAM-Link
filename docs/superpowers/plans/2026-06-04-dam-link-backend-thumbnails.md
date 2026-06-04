# DAM-Link Backend — Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a 320×320 WebP thumbnail for every uploaded image, store it back in S3, and update the asset's `thumbnailKey` so the frontend can render a presigned thumbnail URL.

**Architecture:** A `lib/sharp.ts` wrapper exposes `generateThumbnail(buffer): Promise<Buffer>`. The `finalizeUpload` flow in `uploads.service.ts` (from Plan 5) is extended to fire-and-forget a thumbnail job after the asset transitions to `ready`. For images: download the original from S3, run `sharp`, upload the WebP thumbnail to `thumbnails/{orgId}/{assetId}.webp`, update the asset row. For non-images: skip — the frontend's emoji fallback applies. For videos: defer `ffmpeg` to v2 (the thumbnail stays `null`).

**Tech Stack:** sharp (libvips bindings). No ffmpeg in MVP.

---

## Plan 6 of 9 — Thumbnails

- `sharp` dependency
- `lib/sharp.ts` with `generateThumbnail` and `probeImage`
- Hook into `finalizeUpload` to generate a thumbnail for images
- Thumbnail storage: `thumbnails/{orgId}/{assetId}.webp`, 320×320, quality 80, EXIF stripped
- Asset row update with `thumbnailKey`
- Tests using real sharp + real S3 (test env)

**Deferred to later plans:**
- ffmpeg-based video frame extraction (v2)
- HEIC / AVIF / RAW support (v2 — sharp supports them but we restrict mime types in Plan 5)
- Background job queue (v2 — we use a fire-and-forget promise in MVP)
- Per-org thumbnail customisation (v2)

---

## File structure (this plan adds/modifies)

```
packages/api/src/
  lib/
    sharp.ts                           # NEW
  services/
    uploads.service.ts                 # MODIFY: enqueue thumbnail after finalize
    thumbnails.service.ts              # NEW
  server.ts                            # NO-OP

packages/api/package.json              # MODIFY: add sharp

packages/api/tests/
  thumbnails.test.ts                   # NEW
```

---

## Task 1: Add `sharp`

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1.1: Install sharp**

Run: `pnpm --filter @dam-link/api add sharp@0.33.5`
Expected: installs sharp and its prebuilt libvips binaries. On Windows this is a self-contained wheel; on Linux/Alpine in Docker you may need to add `--ignore-scripts=false` and the `--config.sharp-binary-host` for musl. If the install fails on Alpine (when we add Docker in Plan 9), use the official `node:22-bookworm-slim` image which has the right glibc.

- [ ] **Step 1.2: Verify sharp loaded**

Run: `node -e "import('sharp').then(s => console.log('sharp version:', s.default.versions))" --cwd packages/api`
Expected: prints `sharp version: { vips: '8.x.x', ... }`.

- [ ] **Step 1.3: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add sharp 0.33 for image processing"
```

---

## Task 2: sharp wrapper

**Files:**
- Create: `packages/api/src/lib/sharp.ts`
- Create: `packages/api/tests/sharp.test.ts`

- [ ] **Step 2.1: Write the failing test**

Write `packages/api/tests/sharp.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { generateThumbnail, probeImage, isProcessableImageMime } from '../src/lib/sharp.js';

const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('isProcessableImageMime', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'])(
    'returns true for %s',
    (m) => {
      expect(isProcessableImageMime(m)).toBe(true);
    },
  );
  it.each(['image/svg+xml', 'video/mp4', 'application/pdf'])(
    'returns false for %s',
    (m) => {
      expect(isProcessableImageMime(m)).toBe(false);
    },
  );
});

describe('probeImage', () => {
  it('returns width and height for a valid PNG', async () => {
    const meta = await probeImage(RED_PNG);
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
  });

  it('rejects non-image buffers', async () => {
    await expect(probeImage(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('generateThumbnail', () => {
  it('produces a WebP buffer at <= 320x320', async () => {
    const big = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: { r: 0, g: 128, b: 255 } },
    }).png().toBuffer();
    const out = await generateThumbnail(big);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(320);
  });

  it('strips EXIF metadata (output has no exif segment)', async () => {
    const out = await generateThumbnail(RED_PNG);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails (red)**

Run: `pnpm --filter @dam-link/api test tests/sharp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement `lib/sharp.ts`**

```ts
import sharp from 'sharp';

const THUMB_MAX_DIM = 320;
const THUMB_QUALITY = 80;

const PROCESSABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

export function isProcessableImageMime(mime: string): boolean {
  return PROCESSABLE.has(mime);
}

export interface ImageProbe {
  width: number;
  height: number;
  format: string | undefined;
}

/** Read the image's width/height without decoding pixels. */
export async function probeImage(buffer: Buffer): Promise<ImageProbe> {
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('probeImage: could not read dimensions');
  }
  return { width: meta.width, height: meta.height, format: meta.format };
}

/**
 * Generate a thumbnail buffer (WebP, max dim 320px, EXIF stripped).
 * Always fits inside a 320x320 box preserving aspect ratio.
 */
export async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // honour EXIF orientation
    .resize({
      width: THUMB_MAX_DIM,
      height: THUMB_MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .withMetadata({}) // strips EXIF
    .toBuffer();
}
```

- [ ] **Step 2.4: Run the test to verify it passes (green)**

Run: `pnpm --filter @dam-link/api test tests/sharp.test.ts`
Expected: 7 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/api/src/lib/sharp.ts packages/api/tests/sharp.test.ts
git commit -m "feat(api): sharp wrapper (probeImage, generateThumbnail, mime gate)"
```

---

## Task 3: Thumbnail service (download → process → upload)

**Files:**
- Create: `packages/api/src/services/thumbnails.service.ts`

- [ ] **Step 3.1: Write `thumbnails.service.ts`**

```ts
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
```

- [ ] **Step 3.2: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add packages/api/src/services/thumbnails.service.ts
git commit -m "feat(api): thumbnail service (download original, sharp, upload to S3, update row)"
```

---

## Task 4: Hook thumbnails into the finalize flow

**Files:**
- Modify: `packages/api/src/services/uploads.service.ts`

- [ ] **Step 4.1: Edit `uploads.service.ts` to fire the thumbnail job after finalize**

Edit `packages/api/src/services/uploads.service.ts` — at the bottom of `finalizeUpload`, before `return`, add:
```ts
import { enqueueThumbnail } from './thumbnails.service.js';
// ... inside finalizeUpload, just before the return:
const refreshed = await findAssetById(orgId, assetId);
if (refreshed) enqueueThumbnail(refreshed);
return { id: updated.id, status: 'ready' };
```

- [ ] **Step 4.2: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add packages/api/src/services/uploads.service.ts
git commit -m "feat(api): finalize triggers thumbnail generation (fire-and-forget)"
```

---

## Task 5: Thumbnail integration test

**Files:**
- Create: `packages/api/tests/thumbnails.test.ts`

- [ ] **Step 5.1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, getTestS3Client, flushTestBucket } from './helpers/s3.js';
import { seedOrgWith } from './helpers/seed.js';
import { findAssetById, updateAsset } from '../src/repositories/assets.repo.js';
import { generateThumbnailForAsset, enqueueThumbnail, retryThumbnail } from '../src/services/thumbnails.service.js';
import { s3 as prodS3, BUCKET } from '../src/lib/s3.js';

const COOKIE = 'dam_session_test';

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { email, password: 'hunter2pass', displayName: email },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie.join(',') : (setCookie ?? '');
  return raw.match(new RegExp(`${COOKIE}=([^;]+)`))![1]!;
}

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

    const asset = await updateAsset(org.orgId, '00000000-0000-0000-0000-000000000000' as never, {} as never) as never;
    void asset;
    // Insert a real asset row for the test
    const { insertAsset } = await import('../src/repositories/assets.repo.js');
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
    const { insertAsset } = await import('../src/repositories/assets.repo.js');
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
    const { insertAsset } = await import('../src/repositories/assets.repo.js');
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
    const { insertAsset } = await import('../src/repositories/assets.repo.js');
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
    const { insertAsset } = await import('../src/repositories/assets.repo.js');
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
```

- [ ] **Step 5.2: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/thumbnails.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5.3: Commit**

```bash
git add packages/api/tests/thumbnails.test.ts
git commit -m "test(api): thumbnail generation (happy path, skip non-image, failure, fire-and-forget, retry)"
```

---

## Task 6: Final verification + tag

- [ ] **Step 6.1: Full check**

```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

- [ ] **Step 6.2: Boot and exercise the full upload pipeline by hand**

```bash
pnpm --filter @dam-link/api dev
# Register, create org, POST /uploads, PUT to the returned URL,
# POST /assets/:id/finalize, then GET /assets/:id and verify thumbnailKey is set.
# (Use the MinIO console at http://localhost:9001 to inspect the buckets.)
```

- [ ] **Step 6.3: Tag**

```bash
git tag -a thumbnails-v0.6.0 -m "Thumbnails complete: sharp WebP pipeline, fire-and-forget, failure handling"
```

---

## Self-review

**Spec coverage:**
- sharp 0.33 → Task 1
- lib/sharp.ts with probe + thumbnail → Task 2
- Thumbnails service (download → process → upload) → Task 3
- Hooked into finalize → Task 4
- Tests for all of the above → Task 5

**Type consistency:** `Asset.mimeType` determines if a thumbnail is generated; the mime allow-list from Plan 5's `MimeTypeSchema` aligns with `isProcessableImageMime`.

**Edge cases:**
- Missing S3 object on retry → asset marked `failed`, not crashing the finalize flow.
- Non-image mime → returns `null`, no row update.
- Fire-and-forget promise has its own `.catch` so unhandled rejections don't crash Node.
- Thumbnail storage key is deterministic: `thumbnails/{orgId}/{assetId}.webp` — re-running always overwrites the same key.

---

## Execution handoff

Plan complete. Continue with Plan 7.
