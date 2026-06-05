# DAM-Link Backend — Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the presigned-URL upload flow. Frontend asks the API for a presigned PUT URL, uploads the file directly to S3, then calls a `finalize` endpoint that verifies the upload landed, transitions the asset from `pending` to `ready`, and (in Plan 6) generates a thumbnail.

**Architecture:** `POST /uploads` creates a draft `Asset` row in `pending` status and returns a presigned S3 PUT URL scoped to `originals/{orgId}/{assetId}/{filename}`. The browser PUTs the file directly to S3. `POST /assets/:id/finalize` does an S3 `HEAD` to confirm the object exists with the expected size, then transitions the row to `ready`. A nightly job (deferred to v2) GC's `pending` rows older than 24h with no finalize call.

**Tech Stack:** Existing. `@aws-sdk/client-s3` (already in deps from Plan 1) provides `HeadObjectCommand` and `PutObjectCommand`.

---

## Plan 5 of 9 — Uploads

- `InitiateUploadInput` / `InitiateUploadResponse` schemas
- `POST /uploads` route (Editor+)
- `POST /assets/:id/finalize` route (Editor+) — verifies S3, transitions to ready
- Size limit (5GB hard cap)
- Mime type allow-list
- Object key generation: `originals/{orgId}/{assetId}/{filename}`
- Asset stays in `pending` if finalize not called; a 410 is returned if finalized twice

**Deferred to later plans:**
- Thumbnail generation during finalize → Plan 6
- File-type detection helpers (the frontend decides type/format in MVP)
- Multipart upload (for files >5GB) → v2
- Resume-able uploads → v2
- GC job for orphan `pending` rows → v2

---

## File structure (this plan adds/modifies)

```
packages/contracts/src/
  uploads.ts                           # NEW
  index.ts                             # MODIFY

packages/api/src/
  services/
    uploads.service.ts                 # NEW
  routes/v1/
    uploads.routes.ts                  # NEW
    assets.routes.ts                   # MODIFY: add finalize route
  server.ts                            # MODIFY

packages/api/tests/
  uploads.test.ts                      # NEW
```

---

## Task 1: Upload schemas in contracts

**Files:**
- Create: `packages/contracts/src/uploads.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1.1: Write `uploads.ts`**

```ts
import { z } from 'zod';
import { IdSchema, AssetTypeSchema } from './common.js';

/** Hard upper bound on a single file. ~5GB. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

/** Mime types we accept. */
export const ALLOWED_MIME_TYPES = [
  // images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  // video
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/x-msvideo',
  // audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/flac',
  // documents
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/plain', 'text/markdown',
] as const;

export const MimeTypeSchema = z.string().refine(
  (m) => (ALLOWED_MIME_TYPES as readonly string[]).includes(m),
  { message: 'Mime type not allowed' },
);

/** Initiate upload body. */
export const InitiateUploadInputSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: MimeTypeSchema,
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  type: AssetTypeSchema,
  format: z.string().min(1).max(16),
});
export type InitiateUploadInput = z.infer<typeof InitiateUploadInputSchema>;

/** Initiate upload response. */
export const InitiateUploadResponseSchema = z.object({
  assetId: IdSchema,
  uploadUrl: z.string().url(),
  objectKey: z.string(),
  expiresInSec: z.number().int().positive(),
});
export type InitiateUploadResponse = z.infer<typeof InitiateUploadResponseSchema>;

/** Finalize upload body. Plan 6 will add width/height/duration. */
export const FinalizeUploadInputSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
});
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadInputSchema>;
```

- [ ] **Step 1.2: Modify `packages/contracts/src/index.ts`**

Add `export * from './uploads.js';` to the existing exports.

- [ ] **Step 1.3: Typecheck**

Run: `pnpm --filter @dam-link/contracts typecheck`
Expected: PASS.

- [ ] **Step 1.4: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): upload schemas (initiate, finalize) with mime allow-list and size cap"
```

---

## Task 2: Upload service

**Files:**
- Create: `packages/api/src/services/uploads.service.ts`

- [ ] **Step 2.1: Write `uploads.service.ts`**

```ts
import { AppError } from '../plugins/error-handler.js';
import { newId } from '../lib/ids.js';
import { presignPut, objectExists } from '../lib/s3.js';
import { insertAsset, updateAsset, findAssetById } from '../repositories/assets.repo.js';
import type {
  InitiateUploadInput,
  InitiateUploadResponse,
} from '@dam-link/contracts';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '../lib/s3.js';
import { loadConfig } from '../config.js';

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

  // Thumbnail generation runs in Plan 6 and uses a fire-and-forget
  // pattern; the asset transitions to ready first so the user can
  // see it in the browser immediately.
  return { id: updated.id, status: 'ready' };
}
```

- [ ] **Step 2.2: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 2.3: Commit**

```bash
git add packages/api/src/services/uploads.service.ts
git commit -m "feat(api): upload service (initiate presigned PUT, finalize with S3 HEAD verify)"
```

---

## Task 3: Upload + finalize routes

**Files:**
- Create: `packages/api/src/routes/v1/uploads.routes.ts`
- Modify: `packages/api/src/routes/v1/assets.routes.ts` (add finalize)
- Modify: `packages/api/src/server.ts`

- [ ] **Step 3.1: Write `uploads.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InitiateUploadInputSchema, InitiateUploadResponseSchema } from '@dam-link/contracts';
import { initiateUpload } from '../../services/uploads.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';
import { RATE_TIERS } from '../../plugins/rate-limit.js';

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/orgs/:orgId/uploads
  app.post(
    '/api/v1/orgs/:orgId/uploads',
    {
      preHandler: [requireUser, requireRole('editor')],
      config: { rateLimit: RATE_TIERS.upload },
      schema: {
        body: InitiateUploadInputSchema,
        response: { 200: z.object({ data: InitiateUploadResponseSchema }) },
        tags: ['uploads'],
        summary: 'Initiate an upload. Returns a presigned PUT URL and a draft assetId.',
      },
    },
    async (req) => {
      const result = await initiateUpload(req.orgContext!.org.id, req.user!.id, req.body);
      return { data: result };
    },
  );
}
```

- [ ] **Step 3.2: Add the finalize route to `assets.routes.ts`**

Add a new import and route registration in `assets.routes.ts`:
```ts
import { finalizeUpload } from '../../services/uploads.service.js';
import { FinalizeUploadInputSchema } from '@dam-link/contracts';
```

Then inside `registerAssetRoutes`, add this route AFTER the `POST .../soft-delete` route:
```ts
// POST /api/v1/orgs/:orgId/assets/:id/finalize — Editor+
app.post(
  '/api/v1/orgs/:orgId/assets/:id/finalize',
  {
    preHandler: [requireUser, requireRole('editor')],
    schema: {
      body: FinalizeUploadInputSchema,
      response: { 200: z.object({ data: z.object({ id: z.string().uuid(), status: z.literal('ready') }) }) },
      tags: ['uploads'],
      summary: 'Finalize an upload: verifies the S3 object exists and transitions the asset to ready.',
    },
  },
  async (req) => {
    const { id } = req.params as { id: string };
    const result = await finalizeUpload(req.orgContext!.org.id, id, req.body);
    return { data: result };
  },
);
```

- [ ] **Step 3.3: Register the upload routes in `server.ts`**

Edit `packages/api/src/server.ts`:
```ts
import { registerUploadRoutes } from './routes/v1/uploads.routes.js';
// ... inside buildApp, after registerAssetRoutes(app):
await registerUploadRoutes(app);
```

- [ ] **Step 3.4: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add packages/api/src/routes/v1/uploads.routes.ts packages/api/src/routes/v1/assets.routes.ts packages/api/src/server.ts
git commit -m "feat(api): upload routes (initiate, finalize)"
```

---

## Task 4: Upload integration tests

**Files:**
- Create: `packages/api/tests/uploads.test.ts`

- [ ] **Step 4.1: Write `uploads.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, getTestS3Client } from './helpers/s3.js';
import { seedOrgWith, seedAsset } from './helpers/seed.js';

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

/** Direct S3 PUT for tests (simulates the browser). */
async function directPut(url: string, body: Buffer, contentType: string, contentLength: number): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, 'content-length': String(contentLength) },
  });
  if (!res.ok) {
    throw new Error(`directPut failed: ${res.status} ${await res.text()}`);
  }
}

describe('upload flow', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => { await truncateAllTables(); });

  it('initiates an upload, the browser PUTs to S3, finalize transitions to ready', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;

    // 1. Initiate
    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        filename: 'cat.png',
        mimeType: 'image/png',
        size: 12,
        type: 'image',
        format: 'PNG',
      },
    });
    expect(init.statusCode).toBe(200);
    const { assetId, uploadUrl, objectKey } = init.json().data;
    expect(assetId).toBeTruthy();
    expect(uploadUrl).toMatch(/^http/);
    expect(objectKey).toMatch(new RegExp(`^originals/${org.orgId}/${assetId}/cat\\.png$`));

    // 2. PUT to S3
    const body = Buffer.from('hello world');
    await directPut(uploadUrl, body, 'image/png', body.length);

    // 3. Finalize
    const fin = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${assetId}/finalize`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(fin.statusCode).toBe(200);
    expect(fin.json().data.status).toBe('ready');

    // 4. The asset is fetchable and in 'ready'
    const get = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets/${assetId}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(get.json().data.status).toBe('ready');
  });

  it('finalize without an S3 object returns 409 UPLOAD_NOT_FOUND', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    // Use the existing seed helper to create a pending asset (simulate an aborted upload)
    const id = await seedAsset(org.orgId, org.ownerId, { name: 'no-upload.png', status: 'pending' as never });

    const fin = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${id}/finalize`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(fin.statusCode).toBe(409);
    expect(fin.json().error.code).toBe('UPLOAD_NOT_FOUND');
  });

  it('refuses mime types outside the allow-list with 422', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;

    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        filename: 'evil.exe',
        mimeType: 'application/x-msdownload',
        size: 100,
        type: 'document',
        format: 'EXE',
      },
    });
    expect(init.statusCode).toBe(422);
  });

  it('refuses files larger than the 5GB cap with 422', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;

    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {
        filename: 'big.bin',
        mimeType: 'application/zip',
        size: 6 * 1024 * 1024 * 1024,
        type: 'document',
        format: 'ZIP',
      },
    });
    expect(init.statusCode).toBe(422);
  });

  it('Viewer cannot initiate uploads (403)', async () => {
    const owner = await login(app, 'o@e.com');
    const viewer = await login(app, 'v@e.com');
    const org = await seedOrgWith('o@e.com', 'Org', [{ email: 'v@e.com', role: 'viewer' }]);
    void owner; void viewer;

    const init = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/uploads`,
      headers: { cookie: `${COOKIE}=${viewer}` },
      payload: { filename: 'a.png', mimeType: 'image/png', size: 1, type: 'image', format: 'PNG' },
    });
    expect(init.statusCode).toBe(403);
    expect(init.json().error.code).toBe('INSUFFICIENT_ROLE');
  });
});
```

- [ ] **Step 4.2: Add a helper to get a test S3 client**

Edit `packages/api/tests/helpers/s3.ts` — add `getTestS3Client`:
```ts
// Add to the existing file
export function getTestS3Client(): S3Client {
  return getClient();
}
```

- [ ] **Step 4.3: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/uploads.test.ts`
Expected: 5 tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add packages/api/tests/uploads.test.ts packages/api/tests/helpers/s3.ts
git commit -m "test(api): upload flow (initiate, direct S3 PUT, finalize, mime/size guards, RBAC)"
```

---

## Task 5: Final verification + tag

- [ ] **Step 5.1: Full check**

```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

- [ ] **Step 5.2: Boot and exercise by hand**

```bash
pnpm --filter @dam-link/api dev
# in another shell: register, create org, POST /uploads, then PUT to the returned URL
```

- [ ] **Step 5.3: Tag**

```bash
git tag -a uploads-v0.5.0 -m "Uploads complete: presigned PUT, finalize, mime allow-list, size cap"
```

---

## Self-review

**Spec coverage:**
- POST /uploads → Task 3
- POST /assets/:id/finalize → Task 3
- S3 HEAD verification → Task 2
- Status pending → ready → Task 2
- Size cap → Task 1
- Mime allow-list → Task 1
- RBAC (Editor+) → Task 3
- Tests covering all of the above → Task 4

**Type consistency:** `InitiateUploadInput` / `InitiateUploadResponse` shapes match between contracts and the route schema. `FinalizeUploadInput` is the input to `/finalize`; `Asset.status` transitions in the DB.

**Edge cases:**
- Idempotent finalize: calling twice is a no-op (returns ready).
- Failed assets: if Plan 6 marks an asset as failed, finalize refuses to retry.
- Size mismatch: if the browser PUT a different size than declared, finalize refuses (catches buggy clients).
- S3 outage: HeadObject throws → propagate as 500 (handled by the error envelope).

---

## Execution handoff

Plan complete. Continue with Plan 6.
