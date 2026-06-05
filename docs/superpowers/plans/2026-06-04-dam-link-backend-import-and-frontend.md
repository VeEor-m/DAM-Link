# DAM-Link Backend — Import Endpoint + Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two big chunks. (1) A `POST /api/v1/orgs/:orgId/import` endpoint that accepts a multipart bundle (`manifest.json` + thumbnail files) and re-creates the assets in the org. (2) Move the React frontend from `D:\DAM-Link` into `packages/web` and wire it up to talk to the API, replacing localStorage with server state.

**Architecture:**

*Import:* Multipart upload, server parses the JSON manifest, creates draft `Asset` rows with `status='ready'`, uploads each thumbnail to S3 at `thumbnails/{orgId}/{assetId}.webp`, then runs the thumbnail service so widths/heights are populated. Originals are NOT included in the bundle (they never left the user's disk); the user is prompted to re-upload per asset.

*Frontend:* The existing React app is moved into `packages/web` with no structural changes. The `useReducer` keeps the same shape; actions that mutate server state go through an `apiClient` (a thin fetch wrapper). The `persistence.ts` localStorage save/load is replaced with an API call to `/auth/me` for hydration and the appropriate CRUD endpoints. The `uploadParser.ts` is replaced with a new `useUpload` hook that does the presigned-URL dance. The `Export` button writes a manifest + thumbnail files for users who want to migrate.

**Tech Stack:** `@fastify/multipart` for the import route. The frontend keeps React 19 + Vite + TypeScript and adds nothing new (uses native `fetch`).

---

## Plan 8 of 9 — Import + Frontend

- `@fastify/multipart` dep
- `POST /api/v1/orgs/:orgId/import` route (Editor+, multipart)
- `services/import.service.ts` — parses manifest, creates assets, uploads thumbnails
- Integration test for the import flow
- Move `D:\DAM-Link` into `packages/web`
- Add `@dam-link/contracts` dep to web
- Add `packages/web/src/api/client.ts` (typed fetch wrapper)
- Add `packages/web/src/api/index.ts` (one function per endpoint)
- Replace `persistence.ts` with API-driven hydration
- Replace `uploadParser.ts` with a `useUpload` hook using presigned URLs
- Add an Export button to the Toolbar (when in local-only mode)
- Wire the App to log in via the API instead of using MOCK_ASSETS

**Deferred to later plans:**
- "Re-upload originals" prompt UI polish (v2)
- Conflict resolution when local and server assets have the same id (v2 — we always generate a new server id)
- WebSocket / SSE live updates (v2)

---

## File structure (this plan adds/modifies)

```
packages/api/
  src/
    routes/v1/import.routes.ts         # NEW
    services/import.service.ts         # NEW
    plugins/cookie.ts                  # no change
    server.ts                          # MODIFY
  package.json                         # MODIFY: add @fastify/multipart
  tests/
    import.test.ts                     # NEW

packages/web/                          # MOVED from D:\DAM-Link
  package.json                         # MODIFY: add @dam-link/contracts, swap persistence
  src/
    api/
      client.ts                        # NEW
      assets.ts                        # NEW
      auth.ts                          # NEW
      orgs.ts                          # NEW
      uploads.ts                       # NEW
    state/
      persistence.ts                   # REPLACED: now hydrates from API
      store.tsx                        # MODIFY: actions that need server data
    utils/
      uploadParser.ts                  # REPLACED: now useUpload hook
    hooks/
      useUpload.ts                     # NEW
    components/
      toolbar/
        ExportButton.tsx                # NEW
```

---

## Part A — Import endpoint (Tasks 1-4)

## Task 1: Add `@fastify/multipart`

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1.1: Install the plugin**

Run: `pnpm --filter @dam-link/api add @fastify/multipart@9.0.1`

- [ ] **Step 1.2: Verify the install**

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 1.3: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @fastify/multipart for import endpoint"
```

---

## Task 2: Import schemas in contracts

**Files:**
- Create: `packages/contracts/src/import.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 2.1: Write `import.ts`**

```ts
import { z } from 'zod';
import { AssetTypeSchema, IsoDateTimeSchema } from './common.js';

/** One item in the manifest.json. */
export const ImportAssetEntrySchema = z.object({
  /** Client-side id (not used as a server id). */
  clientId: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  type: AssetTypeSchema,
  format: z.string().min(1).max(16),
  /** Original byte size, if known (often unknown for localStorage exports). */
  size: z.number().int().nonnegative().optional(),
  mimeType: z.string().min(1).max(127).optional(),
  /** Optional dimensions if known. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  uploadedAt: IsoDateTimeSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(50).default([]),
  favorite: z.boolean().default(false),
  /** Filename in the multipart form for the thumbnail, if any. */
  thumbnailFilename: z.string().optional(),
});
export type ImportAssetEntry = z.infer<typeof ImportAssetEntrySchema>;

export const ImportManifestSchema = z.object({
  /** Schema version of the manifest, e.g. 1. */
  schemaVersion: z.literal(1),
  /** Where the manifest came from. */
  source: z.enum(['dam-link-localstorage']),
  /** When the export was generated. */
  exportedAt: IsoDateTimeSchema,
  /** The user who exported, by email (informational only). */
  exportedBy: z.string().email().optional(),
  /** The assets to import. */
  assets: z.array(ImportAssetEntrySchema).min(1).max(1000),
});
export type ImportManifest = z.infer<typeof ImportManifestSchema>;

/** Response. */
export const ImportResultSchema = z.object({
  imported: z.array(z.object({
    clientId: z.string(),
    serverId: z.string().uuid(),
    name: z.string(),
  })),
  skipped: z.array(z.object({
    clientId: z.string(),
    reason: z.string(),
  })),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
```

- [ ] **Step 2.2: Modify `packages/contracts/src/index.ts`**

Add `export * from './import.js';`.

- [ ] **Step 2.3: Typecheck**

Run: `pnpm --filter @dam-link/contracts typecheck`
Expected: PASS.

- [ ] **Step 2.4: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): import manifest + result schemas"
```

---

## Task 3: Import service + route

**Files:**
- Create: `packages/api/src/services/import.service.ts`
- Create: `packages/api/src/routes/v1/import.routes.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 3.1: Write `import.service.ts`**

```ts
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
      const asset = await insertAsset({
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
        const refreshed = (await import('../repositories/assets.repo.js')).findAssetById(orgId, serverId);
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
          void generateThumbnailForAsset(await refreshed);
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
```

- [ ] **Step 3.2: Write `import.routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { ImportResultSchema } from '@dam-link/contracts';
import { processImport, type ImportedFile } from '../../services/import.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';
import { AppError } from '../../plugins/error-handler.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // per thumbnail
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // per import call

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1100 },
  });

  app.post(
    '/api/v1/orgs/:orgId/import',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        response: { 200: z.object({ data: ImportResultSchema }) },
        tags: ['import'],
        summary: 'Import assets from a localStorage export bundle (manifest.json + thumbnail files).',
        // Multipart routes cannot have a JSON body schema.
        consumes: ['multipart/form-data'],
      },
    },
    async (req) => {
      const manifestField = await req.file();
      if (!manifestField || manifestField.fieldname !== 'manifest') {
        throw new AppError(400, 'MANIFEST_MISSING', 'multipart field "manifest" (JSON) is required');
      }
      const manifestBuf = await manifestField.toBuffer();
      let manifest: unknown;
      try {
        manifest = JSON.parse(manifestBuf.toString('utf8'));
      } catch {
        throw new AppError(400, 'MANIFEST_INVALID_JSON', 'manifest field is not valid JSON');
      }

      const files: ImportedFile[] = [];
      let totalBytes = manifestBuf.length;
      for await (const part of req.parts()) {
        if (part.type === 'file' && part.fieldname.startsWith('thumb_')) {
          const buf = await part.toBuffer();
          totalBytes += buf.length;
          if (totalBytes > MAX_TOTAL_BYTES) {
            throw new AppError(413, 'IMPORT_TOO_LARGE', 'Total import size exceeds 50MB');
          }
          files.push({
            fieldName: part.fieldname,
            filename: part.filename,
            mimeType: part.mimetype,
            buffer: buf,
          });
        }
      }

      const result = await processImport(req.orgContext!.org.id, req.user!.id, manifest, files);
      return { data: result };
    },
  );
}
```

- [ ] **Step 3.3: Register in `server.ts`**

Edit `packages/api/src/server.ts`:
```ts
import { registerImportRoutes } from './routes/v1/import.routes.js';
// ... inside buildApp, after registerPublicShareRoutes(app):
await registerImportRoutes(app);
```

- [ ] **Step 3.4: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add packages/api/src/services/import.service.ts packages/api/src/routes/v1/import.routes.ts packages/api/src/server.ts
git commit -m "feat(api): import endpoint (multipart manifest + thumbnails, creates ready assets)"
```

---

## Task 4: Import integration test

**Files:**
- Create: `packages/api/tests/import.test.ts`

- [ ] **Step 4.1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import FormData from 'form-data';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';
import { seedOrgWith } from './helpers/seed.js';

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

async function makeThumbPng(): Promise<Buffer> {
  return sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
  }).png().toBuffer();
}

describe('import endpoint', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('imports a manifest with two assets and their thumbnails', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;

    const thumbA = await makeThumbPng();
    const thumbB = await makeThumbPng();

    const manifest = {
      schemaVersion: 1 as const,
      source: 'dam-link-localstorage' as const,
      exportedAt: new Date().toISOString(),
      assets: [
        { clientId: 'local-1', name: 'a.png', type: 'image', format: 'PNG', tags: ['design'], favorite: true, thumbnailFilename: 'thumb-a.png' },
        { clientId: 'local-2', name: 'b.png', type: 'image', format: 'PNG', tags: [], favorite: false, thumbnailFilename: 'thumb-b.png' },
      ],
    };

    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest), { contentType: 'application/json' });
    form.append('thumb_thumb-a.png', thumbA, { filename: 'thumb-a.png', contentType: 'image/png' });
    form.append('thumb_thumb-b.png', thumbB, { filename: 'thumb-b.png', contentType: 'image/png' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${org.orgId}/import`,
      headers: { ...form.getHeaders(), cookie: `${COOKIE}=${session}` },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.imported).toHaveLength(2);
    expect(body.skipped).toHaveLength(0);

    // Both assets are now listable
    const list = await app.inject({
      method: 'GET', url: `/api/v1/orgs/${org.orgId}/assets`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(list.json().data.items).toHaveLength(2);
    const first = list.json().data.items[0];
    expect(first.thumbnailUrl).toBeTruthy();
  });

  it('skips assets whose thumbnail file is missing', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;

    const manifest = {
      schemaVersion: 1 as const,
      source: 'dam-link-localstorage' as const,
      exportedAt: new Date().toISOString(),
      assets: [
        { clientId: 'local-1', name: 'a.png', type: 'image', format: 'PNG', tags: [], favorite: false, thumbnailFilename: 'thumb-a.png' },
      ],
    };
    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest), { contentType: 'application/json' });
    // no thumbnail file

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${org.orgId}/import`,
      headers: { ...form.getHeaders(), cookie: `${COOKIE}=${session}` },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.imported).toHaveLength(0);
    expect(res.json().data.skipped).toHaveLength(1);
  });

  it('Viewer cannot import (403)', async () => {
    const owner = await login(app, 'o@e.com');
    const viewer = await login(app, 'v@e.com');
    const org = await seedOrgWith('o@e.com', 'Org', [{ email: 'v@e.com', role: 'viewer' }]);
    void owner; void viewer;

    const manifest = { schemaVersion: 1, source: 'dam-link-localstorage', exportedAt: new Date().toISOString(), assets: [] };
    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest), { contentType: 'application/json' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${org.orgId}/import`,
      headers: { ...form.getHeaders(), cookie: `${COOKIE}=${viewer}` },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 4.2: Add form-data dev dep**

Run: `pnpm --filter @dam-link/api add -D form-data@4.0.1 @types/form-data@4.0.0`

- [ ] **Step 4.3: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/import.test.ts`
Expected: 3 tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add packages/api/tests/import.test.ts packages/api/package.json
git commit -m "test(api): import endpoint (manifest + thumbnails, missing thumbs, RBAC)"
```

---

## Part B — Frontend integration (Tasks 5-12)

> **Prerequisite for these tasks:** The user must run the actual file move from `D:\DAM-Link` into `D:\DAM-Link-Backend\.worktrees\foundation\packages\web` outside this skill (or in a single shell command). Git will track the move; the existing `D:\DAM-Link` repo remains a separate history until merged.

## Task 5: Move the React app into the monorepo

**Files:**
- Move: `D:\DAM-Link\*` → `D:\DAM-Link-Backend\.worktrees\foundation\packages\web\*`
- Modify: `packages/web/package.json` (add `@dam-link/contracts` dep)
- Modify: `packages/web/tsconfig.json` (path mapping)

- [ ] **Step 5.1: Move the files**

Run (Bash, in the worktree):
```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
mkdir -p packages
# Move everything from the existing frontend (read-only, just relocating)
mv /d/DAM-Link/* packages/web/ 2>/dev/null || true
mv /d/DAM-Link/.[!.]* packages/web/ 2>/dev/null || true
# Remove the old node_modules + dist to keep the move clean
rm -rf packages/web/node_modules packages/web/dist packages/web/.tsbuildinfo
ls packages/web
```

Expected: `src`, `tests`, `public`, `package.json`, etc. all present in `packages/web/`.

- [ ] **Step 5.2: Add the workspace package.json metadata**

In `packages/web/package.json`, add a `name` field (the existing package.json has no name). Set it to:
```json
{
  "name": "@dam-link/web",
  ...
}
```

- [ ] **Step 5.3: Add `@dam-link/contracts` as a dependency**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm --filter @dam-link/web add '@dam-link/contracts@workspace:*'
```

- [ ] **Step 5.4: Add path mapping to tsconfig.app.json (optional but recommended)**

Edit `packages/web/tsconfig.app.json`, add:
```json
{
  "compilerOptions": {
    "paths": {
      "@dam-link/contracts": ["../contracts/src/index.ts"]
    }
  }
}
```

- [ ] **Step 5.5: Install**

Run: `pnpm install`
Expected: workspace dep resolves.

- [ ] **Step 5.6: Commit**

```bash
git add packages/web
git commit -m "feat(web): move React app into packages/web and add @dam-link/contracts"
```

---

## Task 6: API client

**Files:**
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/api/auth.ts`
- Create: `packages/web/src/api/orgs.ts`
- Create: `packages/web/src/api/assets.ts`
- Create: `packages/web/src/api/uploads.ts`

- [ ] **Step 6.1: Write `client.ts`**

```ts
// Thin fetch wrapper. Same-origin in dev (Vite proxy), CORS in prod.
const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  // Override Content-Type for multipart
  contentType?: string;
}

export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include', // send session cookie
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(opts.contentType ? { 'content-type': opts.contentType } : {}),
    },
    body:
      opts.body == null
        ? undefined
        : opts.body instanceof FormData
        ? opts.body
        : JSON.stringify(opts.body),
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? `Request failed: ${res.status}`,
      json?.error?.details,
    );
  }
  return (json?.data ?? json) as T;
}
```

- [ ] **Step 6.2: Write `auth.ts`**

```ts
import { api } from './client.js';
import type { MeResponse, PublicUser } from '@dam-link/contracts';

export async function register(input: { email: string; password: string; displayName: string }): Promise<{ user: PublicUser }> {
  return api<{ user: PublicUser }>('/auth/register', { method: 'POST', body: input });
}

export async function login(input: { email: string; password: string }): Promise<{ user: PublicUser }> {
  return api<{ user: PublicUser }>('/auth/login', { method: 'POST', body: input });
}

export async function logout(): Promise<void> {
  await api<void>('/auth/logout', { method: 'POST' });
}

export async function me(): Promise<MeResponse> {
  return api<MeResponse>('/auth/me');
}
```

- [ ] **Step 6.3: Write `orgs.ts`**

```ts
import { api } from './client.js';
import type { Org, Role } from '@dam-link/contracts';

export async function listMyOrgs(): Promise<Array<{ org: Org; role: Role }>> {
  return api('/orgs');
}

export async function createOrg(input: { name: string }): Promise<{ org: Org; role: Role }> {
  return api('/orgs', { method: 'POST', body: input });
}

export async function getOrg(orgId: string): Promise<{ org: Org; role: Role; memberCount: number; assetCount: number }> {
  return api(`/orgs/${orgId}`);
}
```

- [ ] **Step 6.4: Write `assets.ts`**

```ts
import { api } from './client.js';
import type { Asset, AssetListQuery, SidebarCounts } from '@dam-link/contracts';

export async function listAssets(orgId: string, q: AssetListQuery): Promise<{ items: Asset[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    if (Array.isArray(v)) params.set(k, v.join(','));
    else params.set(k, String(v));
  }
  return api(`/orgs/${orgId}/assets?${params.toString()}`);
}

export async function getAsset(orgId: string, id: string): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}`);
}

export async function updateAsset(orgId: string, id: string, patch: { name?: string; tags?: string[]; favorite?: boolean; visibility?: 'private' | 'org' | 'link' }): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}`, { method: 'PATCH', body: patch });
}

export async function softDelete(orgId: string, id: string): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}/soft-delete`, { method: 'POST' });
}

export async function restore(orgId: string, id: string): Promise<Asset> {
  return api(`/orgs/${orgId}/assets/${id}/restore`, { method: 'POST' });
}

export async function permanentDelete(orgId: string, id: string): Promise<void> {
  await api(`/orgs/${orgId}/assets/${id}`, { method: 'DELETE' });
}

export async function emptyTrash(orgId: string): Promise<{ deletedCount: number }> {
  return api(`/orgs/${orgId}/assets/empty-trash`, { method: 'POST' });
}

export async function sidebarCounts(orgId: string): Promise<SidebarCounts> {
  return api(`/orgs/${orgId}/assets/sidebar-counts`);
}
```

- [ ] **Step 6.5: Write `uploads.ts`**

```ts
import { api } from './client.js';
import type { InitiateUploadResponse } from '@dam-link/contracts';

export async function initiateUpload(
  orgId: string,
  input: { filename: string; mimeType: string; size: number; type: 'image' | 'video' | 'document' | 'audio'; format: string },
): Promise<InitiateUploadResponse> {
  return api(`/orgs/${orgId}/uploads`, { method: 'POST', body: input });
}

export async function finalizeUpload(
  orgId: string,
  assetId: string,
  meta: { width?: number; height?: number; duration?: number } = {},
): Promise<{ id: string; status: 'ready' }> {
  return api(`/orgs/${orgId}/assets/${assetId}/finalize`, { method: 'POST', body: meta });
}

/** Direct PUT to the presigned S3 URL. */
export async function directPut(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type },
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}
```

- [ ] **Step 6.6: Typecheck**

Run: `pnpm --filter @dam-link/web typecheck`
Expected: PASS.

- [ ] **Step 6.7: Commit**

```bash
git add packages/web/src/api
git commit -m "feat(web): API client + typed wrappers for auth, orgs, assets, uploads"
```

---

## Task 7: `useUpload` hook

**Files:**
- Create: `packages/web/src/hooks/useUpload.ts`
- Modify: `packages/web/src/utils/uploadParser.ts` (replace with a re-export for back-compat, or delete)

- [ ] **Step 7.1: Write `useUpload.ts`**

```ts
import { useCallback, useState } from 'react';
import { initiateUpload, finalizeUpload, directPut } from '../api/uploads.js';
import { ApiError } from '../api/client.js';

export interface UploadItem {
  id: string; // local temp id
  file: File;
  status: 'queued' | 'uploading' | 'finalizing' | 'done' | 'error';
  serverId?: string;
  error?: string;
  /** Optional metadata to attach (e.g. width/height for images). */
  meta?: { width?: number; height?: number; duration?: number };
}

export function useUpload(orgId: string) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const uploadOne = useCallback(
    async (item: UploadItem) => {
      try {
        const init = await initiateUpload(orgId, {
          filename: item.file.name,
          mimeType: item.file.type || 'application/octet-stream',
          size: item.file.size,
          type: item.meta?.duration ? 'video' : (item.file.type.startsWith('image/') ? 'image' : (item.file.type.startsWith('video/') ? 'video' : (item.file.type.startsWith('audio/') ? 'audio' : 'document'))),
          format: (item.file.name.split('.').pop() ?? 'bin').toUpperCase(),
        });
        updateItem(item.id, { status: 'uploading', serverId: init.assetId });
        await directPut(init.uploadUrl, item.file);
        updateItem(item.id, { status: 'finalizing' });
        await finalizeUpload(orgId, init.assetId, item.meta ?? {});
        updateItem(item.id, { status: 'done' });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Unknown error';
        updateItem(item.id, { status: 'error', error: message });
      }
    },
    [orgId],
  );

  const uploadMany = useCallback(
    async (files: File[]) => {
      const newItems: UploadItem[] = files.map((f, idx) => ({
        id: `local-${Date.now()}-${idx}`,
        file: f,
        status: 'queued',
      }));
      setItems((cur) => [...cur, ...newItems]);
      // Sequential for now; parallel is fine too but uses more bandwidth.
      for (const item of newItems) {
        await uploadOne(item);
      }
    },
    [uploadOne],
  );

  return { items, uploadMany };
}
```

- [ ] **Step 7.2: Delete the old `uploadParser.ts`**

Run: `rm packages/web/src/utils/uploadParser.ts`
(The new hook replaces it; the components that used it are updated in the next task.)

- [ ] **Step 7.3: Commit**

```bash
git add packages/web/src/hooks/useUpload.ts
git commit -m "feat(web): useUpload hook (presigned URL flow, sequential upload, status tracking)"
git rm packages/web/src/utils/uploadParser.ts
git commit -m "refactor(web): remove old uploadParser in favor of useUpload hook"
```

---

## Task 8: Wire the store to the API

**Files:**
- Modify: `packages/web/src/state/store.tsx` (the boot logic; the reducer shape stays)
- Modify: `packages/web/src/state/persistence.ts` (now hydrates from API)

- [ ] **Step 8.1: Rewrite `persistence.ts`**

```ts
import { me } from '../api/auth.js';
import { listMyOrgs } from '../api/orgs.js';
import { listAssets, sidebarCounts } from '../api/assets.js';
import type { AppState } from './types.js';

/**
 * Hydrate AppState from the API. Returns null if the user is not logged in.
 * The returned AppState has the user's first org as the active selection;
 * the UI can offer an org-picker.
 */
export async function loadState(): Promise<AppState | null> {
  try {
    const meRes = await me();
    if (!meRes.user) return null;
    const orgs = await listMyOrgs();
    const firstOrg = orgs[0];
    if (!firstOrg) {
      return { assets: [], ui: defaultUI() };
    }
    const { items } = await listAssets(firstOrg.org.id, { limit: 200 });
    void (await sidebarCounts(firstOrg.org.id)); // warm the cache; the UI re-fetches on demand
    return {
      assets: items.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        format: a.format,
        size: a.size,
        uploadedAt: a.uploadedAt,
        uploadedBy: a.uploadedBy,
        tags: a.tags,
        favorite: a.favorite,
        deletedAt: a.deletedAt,
        width: a.width ?? undefined,
        height: a.height ?? undefined,
        duration: a.duration ?? undefined,
        previewDataUrl: a.thumbnailKey ? null : undefined,
        // Thumbnail URL is dynamic and lives on the API response. The UI reads it
        // from the asset list response (which includes presigned URLs).
        _thumbnailUrl: (a as { thumbnailUrl?: string | null }).thumbnailUrl ?? null,
      })) as AppState['assets'],
      ui: defaultUI(),
    };
  } catch {
    return null;
  }
}

function defaultUI(): AppState['ui'] {
  return {
    searchQuery: '',
    selection: { kind: 'all' },
    viewMode: 'grid',
    selectedAssetId: null,
    filterPanelOpen: false,
    uploadDialogOpen: false,
    filter: { typeFilter: [], formatFilter: [], sizeBucket: null, dateBucket: 'all', uploaderFilter: [], tagFilter: [] },
  };
}

/** No-op for the API-backed store; the server persists. */
export function saveState(_state: AppState): void {
  // intentional no-op
}
```

- [ ] **Step 8.2: Modify the store boot to call `loadState` from the API**

Edit `packages/web/src/state/store.tsx`:
- Replace the `MOCK_ASSETS` import + fallback with a `loadState()` call.
- Show a loading state until the API responds.
- If `loadState` returns null, render a login screen (this lives in `App.tsx`).

```ts
import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { reducer } from './reducer.js'; // (you may need to extract this)
import { loadState, saveState } from './persistence.js';
import type { AppState } from './types.js';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState()
      .then((s) => {
        if (!s) {
          // not logged in — the App component renders the LoginScreen
          setState({ assets: [], ui: defaultUI() });
        } else {
          setState(s);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  if (error) return <div style={{ padding: 32 }}>Error: {error}</div>;
  if (!state) return <div style={{ padding: 32 }}>Loading…</div>;

  return <StoreContext.Provider value={{ state, dispatch: setState as never }}>{children}</StoreContext.Provider>;
}
```

(Implementation note: the existing store uses a `useReducer`; switching to `useState`+ reducer is a small refactor. The full refactor is out of scope for this plan — keep the existing reducer and just swap the initializer.)

- [ ] **Step 8.3: Commit**

```bash
git add packages/web/src/state
git commit -m "feat(web): hydrate state from API (auth/me + list assets)"
```

---

## Task 9: Export button

**Files:**
- Create: `packages/web/src/components/toolbar/ExportButton.tsx`

- [ ] **Step 9.1: Write `ExportButton.tsx`**

```tsx
import { useState } from 'react';
import type { Asset } from '../../state/types.js';

/**
 * Export the current asset list as a JSON manifest + thumbnail files.
 * The user downloads a zip-style folder layout (we use a simple download
 * of the manifest as JSON; thumbnails can be added in v2).
 */
export function ExportButton({ assets }: { assets: Asset[] }) {
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    setBusy(true);
    try {
      const manifest = {
        schemaVersion: 1,
        source: 'dam-link-localstorage',
        exportedAt: new Date().toISOString(),
        assets: assets
          .filter((a) => !a.deletedAt)
          .map((a) => ({
            clientId: a.id,
            name: a.name,
            type: a.type,
            format: a.format,
            size: a.size,
            tags: a.tags,
            favorite: a.favorite,
            uploadedAt: a.uploadedAt,
            uploadedBy: a.uploadedBy,
            width: a.width,
            height: a.height,
            duration: a.duration,
          })),
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dam-link-export-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={onClick} disabled={busy} aria-label="Export library as JSON">
      {busy ? 'Exporting…' : 'Export JSON'}
    </button>
  );
}
```

- [ ] **Step 9.2: Add to the Toolbar**

Edit `packages/web/src/components/toolbar/Toolbar.tsx` to render `<ExportButton assets={assets} />` next to the upload button. (The exact placement is up to the existing Toolbar design.)

- [ ] **Step 9.3: Commit**

```bash
git add packages/web/src/components/toolbar
git commit -m "feat(web): ExportButton for localStorage migration"
```

---

## Task 10: Login screen

**Files:**
- Create: `packages/web/src/components/auth/LoginScreen.tsx`
- Modify: `packages/web/src/App.tsx` (render LoginScreen when not authed)

- [ ] **Step 10.1: Write `LoginScreen.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { register as apiRegister, login as apiLogin } from '../api/auth.js';
import { ApiError } from '../api/client.js';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await apiRegister({ email, password, displayName });
      } else {
        await apiLogin({ email, password });
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <form onSubmit={onSubmit}>
        {mode === 'register' && (
          <label>
            Name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account?' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
```

- [ ] **Step 10.2: Modify `App.tsx`**

Replace the App's render logic to show `LoginScreen` when `/auth/me` returns 401, and the full UI otherwise. (Implementation: store a `bootstrapped: boolean` state; on mount, call `me()`; if it 401s, show LoginScreen; else show the app.)

- [ ] **Step 10.3: Commit**

```bash
git add packages/web/src/components/auth packages/web/src/App.tsx
git commit -m "feat(web): LoginScreen + App gate on auth state"
```

---

## Task 11: Vite dev proxy

**Files:**
- Modify: `packages/web/vite.config.ts`

- [ ] **Step 11.1: Add a proxy for `/api` to the Fastify dev server**

Edit `packages/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        // Cookies are same-origin in dev so no special config needed.
      },
    },
  },
});
```

- [ ] **Step 11.2: Boot the web and api together**

Run (in the worktree):
```bash
pnpm dev
```

Expected: API on :3000, web on :5173. The web app's fetch calls go through the Vite proxy.

- [ ] **Step 11.3: Commit**

```bash
git add packages/web/vite.config.ts
git commit -m "feat(web): Vite proxy for /api -> http://localhost:3000"
```

---

## Task 12: Final verification + tag

- [ ] **Step 12.1: Run all tests**

```bash
cd /d/DAM-Link-Backend/.worktrees/foundation
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

- [ ] **Step 12.2: Boot both apps, exercise the full flow**

```bash
pnpm dev
# Open http://localhost:5173
# Register a new account
# Create an org
# Upload a file
# Verify the file appears in the grid
# Search/filter
# Soft-delete and empty trash
# Create a share link and open in a private window
```

- [ ] **Step 12.3: Tag**

```bash
git tag -a frontend-v0.8.0 -m "Frontend wired to API: login, upload, list, share, export"
```

---

## Self-review

**Spec coverage:**
- Import endpoint (multipart manifest + thumbnails) → Tasks 1-4
- Move web into monorepo → Task 5
- API client (typed wrappers) → Task 6
- useUpload hook → Task 7
- Store wired to API → Task 8
- Export button → Task 9
- Login screen → Task 10
- Vite proxy → Task 11

**Type consistency:** `Asset` in the web app has the same shape as the API returns (the import maps `width ?? undefined` etc. to keep the existing UI happy). `MeResponse.orgs` is the source of truth for the org list.

**Edge cases:**
- API unavailable on boot → store sets an error, the App shows it.
- Logged-in cookie expires → the next `me()` 401s, the App re-renders LoginScreen.
- Upload fails mid-flight → the `useUpload` hook marks the item `error` and shows a retry button (a follow-up).

---

## Execution handoff

Plan complete. The final plan (Plan 9) covers deployment, CI, rate limiting, and Sentry.
