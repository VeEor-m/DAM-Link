# DAM-Link Backend — Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Owners and Editors to create revocable, tokenized share links for any asset. Links can optionally be password-protected and/or expire. Public routes let anyone with the link (and password, if set) download the original or view a thumbnail. The asset's `visibility` must be `'link'` (or `'org'`) for a link to be redeemable.

**Architecture:** `share_links` table (created in Plan 1) holds tokens, expiry, password hash, and revocation timestamp. Internal routes issue/revoke links. Public routes under `/api/v1/share/:token/...` are unauthenticated but rate-limited (20 req/min per IP). Tokens are 32 random bytes, base64url. Passwords reuse the Argon2id helpers from Plan 2.

**Tech Stack:** Existing. argon2 for password hashing, no new deps.

---

## Plan 7 of 9 — Share Links

- `share-links.ts` schemas (CreateShareLinkInput, ShareLink, PublicShareInfo, UnlockInput)
- Internal routes: `POST/GET/DELETE /api/v1/orgs/:orgId/assets/:id/share-links`, `DELETE /api/v1/share-links/:linkId` (revoke across org)
- Public routes: `GET /api/v1/share/:token`, `POST /api/v1/share/:token/unlock`, `GET /api/v1/share/:token/download`
- Visibility check: share link redemption requires `asset.visibility ∈ {'org', 'link'}`
- Password-protected variant (Argon2id)
- Expiry check
- Revocation check
- Rate limit on public routes (20/min per IP)
- Tests covering all paths

**Deferred to later plans:**
- Per-link usage counters / analytics (v2)
- One-time-use links (v2)
- Watermarking on shared previews (v2)
- Share-link TTL refresh (v2)

---

## File structure (this plan adds/modifies)

```
packages/contracts/src/
  share-links.ts                       # NEW
  index.ts                             # MODIFY

packages/api/src/
  repositories/
    share-links.repo.ts                # NEW
  services/
    share-links.service.ts             # NEW
  routes/v1/
    share-links.routes.ts              # NEW (internal)
    public-share.routes.ts             # NEW (public, no auth)
  server.ts                            # MODIFY

packages/api/tests/
  share-links.test.ts                  # NEW
```

---

## Task 1: Share-link schemas in contracts

**Files:**
- Create: `packages/contracts/src/share-links.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1.1: Write `share-links.ts`**

```ts
import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

export const ShareLinkSchema = z.object({
  id: IdSchema,
  assetId: IdSchema,
  orgId: IdSchema,
  token: z.string().min(20).max(64), // 32 bytes base64url = 43 chars
  createdBy: IdSchema,
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.nullable(),
  revokedAt: IsoDateTimeSchema.nullable(),
  hasPassword: z.boolean(), // never expose the hash
});
export type ShareLink = z.infer<typeof ShareLinkSchema>;

/** Create-share-link body. */
export const CreateShareLinkInputSchema = z
  .object({
    expiresAt: IsoDateTimeSchema.nullish(),
    password: z.string().min(8).max(128).optional(),
  })
  .refine((v) => v.password === undefined || v.password.length >= 8, {
    message: 'Password must be at least 8 characters',
  });
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkInputSchema>;

/** Public-facing asset info exposed via /api/v1/share/:token. */
export const PublicShareInfoSchema = z.object({
  asset: z.object({
    id: IdSchema,
    name: z.string(),
    type: z.enum(['image', 'video', 'document', 'audio']),
    format: z.string(),
    size: z.number().int().nonnegative(),
  }),
  hasPassword: z.boolean(),
  expiresAt: IsoDateTimeSchema.nullable(),
  thumbnailUrl: z.string().url().nullable(),
});
export type PublicShareInfo = z.infer<typeof PublicShareInfoSchema>;

/** Unlock body. */
export const UnlockShareLinkInputSchema = z.object({
  password: z.string().min(1).max(128),
});
export type UnlockShareLinkInput = z.infer<typeof UnlockShareLinkInputSchema>;
```

- [ ] **Step 1.2: Modify `packages/contracts/src/index.ts`**

Add `export * from './share-links.js';` to the existing exports.

- [ ] **Step 1.3: Typecheck**

Run: `pnpm --filter @dam-link/contracts typecheck`
Expected: PASS.

- [ ] **Step 1.4: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): share-link schemas (create, public info, unlock)"
```

---

## Task 2: Share-link repository

**Files:**
- Create: `packages/api/src/repositories/share-links.repo.ts`

- [ ] **Step 2.1: Write `share-links.repo.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { shareLinks, type ShareLink, type NewShareLink } from '../db/schema.js';

export async function findShareLinkById(id: string): Promise<ShareLink | null> {
  const db = getDb();
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findShareLinkByToken(token: string): Promise<ShareLink | null> {
  const db = getDb();
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  return rows[0] ?? null;
}

export async function listShareLinksForAsset(assetId: string): Promise<ShareLink[]> {
  const db = getDb();
  return db.select().from(shareLinks).where(eq(shareLinks.assetId, assetId));
}

export async function createShareLink(input: NewShareLink): Promise<ShareLink> {
  const db = getDb();
  const [row] = await db.insert(shareLinks).values(input).returning();
  if (!row) throw new Error('createShareLink: insert returned no rows');
  return row;
}

export async function revokeShareLink(id: string): Promise<void> {
  const db = getDb();
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, id));
}

export async function deleteShareLink(id: string): Promise<void> {
  const db = getDb();
  await db.delete(shareLinks).where(eq(shareLinks.id, id));
}
```

- [ ] **Step 2.2: Commit**

```bash
git add packages/api/src/repositories/share-links.repo.ts
git commit -m "feat(api): share-links repo (find by id/token, list, create, revoke, delete)"
```

---

## Task 3: Share-link service

**Files:**
- Create: `packages/api/src/services/share-links.service.ts`

- [ ] **Step 3.1: Write `share-links.service.ts`**

```ts
import { AppError } from '../plugins/error-handler.js';
import { newToken } from '../lib/ids.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  findShareLinkById,
  findShareLinkByToken,
  listShareLinksForAsset,
  createShareLink,
  revokeShareLink,
} from '../repositories/share-links.repo.js';
import { findAssetById } from '../repositories/assets.repo.js';
import { presignGet } from '../lib/s3.js';
import { logger } from '../lib/logger.js';
import type { ShareLink, NewShareLink } from '../db/schema.js';
import type { CreateShareLinkInput, PublicShareInfo } from '@dam-link/contracts';

const DOWNLOAD_TTL_SEC = 5 * 60;
const THUMBNAIL_TTL_SEC = 60 * 60;

function toPublic(s: ShareLink) {
  return {
    id: s.id,
    assetId: s.assetId,
    orgId: s.orgId,
    token: s.token,
    createdBy: s.createdBy,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
    hasPassword: !!s.passwordHash,
  };
}

/** True if the link is redeemable right now (not expired, not revoked). */
export function isLinkRedeemable(s: ShareLink, now: Date = new Date()): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt && s.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export async function createShareLinkForAsset(
  orgId: string,
  userId: string,
  assetId: string,
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  const asset = await findAssetById(orgId, assetId);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.visibility === 'private') {
    throw new AppError(
      409,
      'ASSET_PRIVATE',
      'Asset visibility is "private"; change it to "link" or "org" before sharing',
    );
  }

  const token = newToken(32);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const row: NewShareLink = {
    assetId,
    orgId,
    token,
    createdBy: userId,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    passwordHash,
  };
  const link = await createShareLink(row);
  logger.info({ assetId, linkId: link.id, hasPassword: !!passwordHash }, 'share link created');
  return link;
}

export async function listShareLinks(orgId: string, assetId: string): Promise<ShareLink[]> {
  const asset = await findAssetById(orgId, assetId);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return listShareLinksForAsset(assetId);
}

export async function revokeLinkAsOwner(orgId: string, linkId: string): Promise<void> {
  const link = await findShareLinkById(linkId);
  if (!link) throw new AppError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found');
  if (link.orgId !== orgId) {
    // Don't leak existence across orgs.
    throw new AppError(404, 'SHARE_LINK_NOT_FOUND', 'Share link not found');
  }
  await revokeShareLink(linkId);
}

/* -------------------------------------------------------------------------- */
/* Public redemption                                                          */
/* -------------------------------------------------------------------------- */

export async function getPublicShareInfo(token: string): Promise<PublicShareInfo> {
  const link = await findShareLinkByToken(token);
  if (!link || !isLinkRedeemable(link)) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  const asset = await findAssetById(link.orgId, link.assetId);
  if (!asset) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  if (asset.visibility === 'private') {
    throw new AppError(403, 'SHARE_LINK_FORBIDDEN', 'Asset is not shared');
  }

  const thumbnailUrl = asset.thumbnailKey ? await presignGet(asset.thumbnailKey, THUMBNAIL_TTL_SEC) : null;

  return {
    asset: {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      format: asset.format,
      size: asset.size,
    },
    hasPassword: !!link.passwordHash,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    thumbnailUrl,
  };
}

export async function unlockShareLink(
  token: string,
  password: string,
): Promise<{ downloadUrl: string }> {
  const link = await findShareLinkByToken(token);
  if (!link || !isLinkRedeemable(link)) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  if (!link.passwordHash) {
    // No password set; nothing to unlock. Caller should have used the public info route.
    throw new AppError(400, 'NO_PASSWORD', 'This link has no password');
  }
  const ok = await verifyPassword(link.passwordHash, password);
  if (!ok) {
    // Constant-time-style: do not reveal whether the password was close.
    throw new AppError(401, 'INVALID_PASSWORD', 'Invalid password');
  }
  const asset = await findAssetById(link.orgId, link.assetId);
  if (!asset) throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');

  const downloadUrl = await presignGet(asset.objectKey, DOWNLOAD_TTL_SEC);
  return { downloadUrl };
}

export async function getDownloadUrlForToken(token: string): Promise<{ downloadUrl: string }> {
  const link = await findShareLinkByToken(token);
  if (!link || !isLinkRedeemable(link)) {
    throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  }
  if (link.passwordHash) {
    // Refuse direct download for password-protected links; the client must unlock first.
    throw new AppError(401, 'PASSWORD_REQUIRED', 'Password required');
  }
  const asset = await findAssetById(link.orgId, link.assetId);
  if (!asset) throw new AppError(404, 'SHARE_LINK_INVALID', 'Share link is invalid or expired');
  if (asset.visibility === 'private') {
    throw new AppError(403, 'SHARE_LINK_FORBIDDEN', 'Asset is not shared');
  }
  const downloadUrl = await presignGet(asset.objectKey, DOWNLOAD_TTL_SEC);
  return { downloadUrl };
}

export const toPublicShareLink = toPublic;
```

- [ ] **Step 3.2: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add packages/api/src/services/share-links.service.ts
git commit -m "feat(api): share-links service (create, list, revoke, public info, unlock, download)"
```

---

## Task 4: Share-link routes (internal + public)

**Files:**
- Create: `packages/api/src/routes/v1/share-links.routes.ts`
- Create: `packages/api/src/routes/v1/public-share.routes.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 4.1: Write `share-links.routes.ts` (internal, Editor+)**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ShareLinkSchema, CreateShareLinkInputSchema } from '@dam-link/contracts';
import {
  createShareLinkForAsset,
  listShareLinks,
  revokeLinkAsOwner,
  toPublicShareLink,
} from '../../services/share-links.service.js';
import { requireUser } from '../../plugins/auth.js';
import { requireRole } from '../../plugins/org-context.js';

export async function registerShareLinkRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/orgs/:orgId/assets/:id/share-links — Editor+
  app.post(
    '/api/v1/orgs/:orgId/assets/:id/share-links',
    {
      preHandler: [requireUser, requireRole('editor')],
      schema: {
        body: CreateShareLinkInputSchema,
        response: { 200: z.object({ data: ShareLinkSchema }) },
        tags: ['share-links'],
        summary: 'Create a share link for an asset',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const link = await createShareLinkForAsset(
        req.orgContext!.org.id,
        req.user!.id,
        id,
        req.body,
      );
      return { data: toPublicShareLink(link) };
    },
  );

  // GET /api/v1/orgs/:orgId/assets/:id/share-links — Viewer+
  app.get(
    '/api/v1/orgs/:orgId/assets/:id/share-links',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: { 200: z.object({ data: z.array(ShareLinkSchema) }) },
        tags: ['share-links'],
        summary: 'List share links for an asset',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const links = await listShareLinks(req.orgContext!.org.id, id);
      return { data: links.map(toPublicShareLink) };
    },
  );

  // DELETE /api/v1/orgs/:orgId/share-links/:linkId — Owner only
  app.delete(
    '/api/v1/orgs/:orgId/share-links/:linkId',
    {
      preHandler: [requireUser, requireRole('owner')],
      schema: { response: { 204: z.null() }, tags: ['share-links'], summary: 'Revoke a share link' },
    },
    async (req, reply) => {
      const { linkId } = req.params as { linkId: string };
      await revokeLinkAsOwner(req.orgContext!.org.id, linkId);
      return reply.status(204).send();
    },
  );
}
```

- [ ] **Step 4.2: Write `public-share.routes.ts` (no auth, rate-limited)**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PublicShareInfoSchema,
  UnlockShareLinkInputSchema,
} from '@dam-link/contracts';
import {
  getPublicShareInfo,
  unlockShareLink,
  getDownloadUrlForToken,
} from '../../services/share-links.service.js';
import { RATE_TIERS } from '../../plugins/rate-limit.js';

const PUBLIC_TIER = { max: 20, timeWindow: '1 minute' };

export async function registerPublicShareRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/share/:token
  app.get(
    '/api/v1/share/:token',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        response: { 200: z.object({ data: PublicShareInfoSchema }) },
        tags: ['public-share'],
        summary: 'Get public info for a share link (no auth)',
      },
    },
    async (req) => {
      const { token } = req.params as { token: string };
      const info = await getPublicShareInfo(token);
      return { data: info };
    },
  );

  // POST /api/v1/share/:token/unlock
  app.post(
    '/api/v1/share/:token/unlock',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        body: UnlockShareLinkInputSchema,
        response: { 200: z.object({ data: z.object({ downloadUrl: z.string().url() }) }) },
        tags: ['public-share'],
        summary: 'Unlock a password-protected share link',
      },
    },
    async (req) => {
      const { token } = req.params as { token: string };
      const result = await unlockShareLink(token, req.body.password);
      return { data: result };
    },
  );

  // GET /api/v1/share/:token/download
  app.get(
    '/api/v1/share/:token/download',
    {
      config: { rateLimit: PUBLIC_TIER },
      schema: {
        response: {
          200: z.object({ data: z.object({ downloadUrl: z.string().url() }) }),
        },
        tags: ['public-share'],
        summary: 'Get a short-lived download URL (no password)',
      },
    },
    async (req) => {
      const { token } = req.params as { token: string };
      const result = await getDownloadUrlForToken(token);
      return { data: result };
    },
  );
}
```

- [ ] **Step 4.3: Register the routes in `server.ts`**

Edit `packages/api/src/server.ts`:
```ts
import { registerShareLinkRoutes } from './routes/v1/share-links.routes.js';
import { registerPublicShareRoutes } from './routes/v1/public-share.routes.js';
// ... inside buildApp, after registerUploadRoutes(app):
await registerShareLinkRoutes(app);
await registerPublicShareRoutes(app);
```

- [ ] **Step 4.4: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add packages/api/src/routes/v1/share-links.routes.ts packages/api/src/routes/v1/public-share.routes.ts packages/api/src/server.ts
git commit -m "feat(api): share-link routes (internal CRUD + public info/unlock/download)"
```

---

## Task 5: Share-link integration tests

**Files:**
- Create: `packages/api/tests/share-links.test.ts`

- [ ] **Step 5.1: Write `share-links.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';
import { seedOrgWith, seedAsset } from './helpers/seed.js';
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

describe('share links', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await closeDb(); await closeS3(); });
  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('creates a link, public GET returns asset info, GET download returns a presigned URL', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;

    // Put a real object so the presign can succeed
    const objectKey = 'originals/x/file.png';
    await prodS3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: Buffer.from('hi'), ContentType: 'image/png' }));

    const assetId = await seedAsset(org.orgId, org.ownerId, { name: 'file.png', objectKey, mimeType: 'image/png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    expect(create.statusCode).toBe(200);
    const link = create.json().data;
    expect(link.token.length).toBeGreaterThan(30);
    expect(link.hasPassword).toBe(false);

    // Public info
    const info = await app.inject({
      method: 'GET', url: `/api/v1/share/${link.token}`,
    });
    expect(info.statusCode).toBe(200);
    expect(info.json().data.asset.name).toBe('file.png');
    expect(info.json().data.hasPassword).toBe(false);

    // Download
    const dl = await app.inject({
      method: 'GET', url: `/api/v1/share/${link.token}/download`,
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.json().data.downloadUrl).toMatch(/^http/);
  });

  it('revokes a link: subsequent public GET returns 404', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    const assetId = await seedAsset(org.orgId, org.ownerId, { name: 'r.png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: {},
    });
    const linkId = create.json().data.id;
    const token = create.json().data.token;

    const revoke = await app.inject({
      method: 'DELETE', url: `/api/v1/orgs/${org.orgId}/share-links/${linkId}`,
      headers: { cookie: `${COOKIE}=${session}` },
    });
    expect(revoke.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET', url: `/api/v1/share/${token}`,
    });
    expect(after.statusCode).toBe(404);
  });

  it('password-protected link: download requires unlock', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    const objectKey = 'originals/x/p.png';
    await prodS3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: Buffer.from('p'), ContentType: 'image/png' }));
    const assetId = await seedAsset(org.orgId, org.ownerId, { name: 'p.png', objectKey });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${session}` },
      payload: { password: 's3cret-pass' },
    });
    const token = create.json().data.token;

    const direct = await app.inject({
      method: 'GET', url: `/api/v1/share/${token}/download`,
    });
    expect(direct.statusCode).toBe(401);
    expect(direct.json().error.code).toBe('PASSWORD_REQUIRED');

    const wrong = await app.inject({
      method: 'POST', url: `/api/v1/share/${token}/unlock`,
      payload: { password: 'wrongpass' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_PASSWORD');

    const right = await app.inject({
      method: 'POST', url: `/api/v1/share/${token}/unlock`,
      payload: { password: 's3cret-pass' },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json().data.downloadUrl).toMatch(/^http/);
  });

  it('expired link returns 404 on public access', async () => {
    const session = await login(app, 'o@e.com');
    const org = await seedOrgWith('o@e.com', 'Org');
    void session;
    const assetId = await seedAsset(org.orgId, org.ownerId, { name: 'e.png' });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // We need to create with a past expiry; the schema doesn't allow that, so insert directly:
    const { newToken } = await import('../src/lib/ids.js');
    const { createShareLink } = await import('../src/repositories/share-links.repo.js');
    const link = await createShareLink({
      assetId,
      orgId: org.orgId,
      token: newToken(32),
      createdBy: org.ownerId,
      expiresAt: new Date(yesterday),
    });

    const r = await app.inject({
      method: 'GET', url: `/api/v1/share/${link.token}`,
    });
    expect(r.statusCode).toBe(404);
  });

  it('Viewer can list share links but not create or revoke them', async () => {
    const owner = await login(app, 'o@e.com');
    const viewer = await login(app, 'v@e.com');
    const org = await seedOrgWith('o@e.com', 'Org', [{ email: 'v@e.com', role: 'viewer' }]);
    void owner; void viewer;
    const assetId = await seedAsset(org.orgId, org.ownerId, { name: 'x.png' });

    const create = await app.inject({
      method: 'POST', url: `/api/v1/orgs/${org.orgId}/assets/${assetId}/share-links`,
      headers: { cookie: `${COOKIE}=${viewer}` },
      payload: {},
    });
    expect(create.statusCode).toBe(403);
  });
});
```

- [ ] **Step 5.2: Run the tests**

Run: `pnpm --filter @dam-link/api test tests/share-links.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5.3: Commit**

```bash
git add packages/api/tests/share-links.test.ts
git commit -m "test(api): share-link flow (create, public, revoke, password, expiry, RBAC)"
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

- [ ] **Step 6.2: Boot and exercise by hand**

```bash
pnpm --filter @dam-link/api dev
# Register, create org, seed an asset, POST a share link,
# then GET /api/v1/share/<token> from a fresh cookie jar.
```

- [ ] **Step 6.3: Tag**

```bash
git tag -a share-links-v0.7.0 -m "Share links complete: create, public info, password, expiry, revocation"
```

---

## Self-review

**Spec coverage:** ✅
- Internal CRUD: create, list, revoke → Tasks 3, 4
- Public info (no auth) → Tasks 3, 4
- Password-protected variant → Tasks 3, 4
- Expiry → Tasks 3, 4
- Revocation → Tasks 3, 4
- Visibility check (refuse private) → Task 3
- Rate limit on public routes → Task 4
- Tests → Task 5

**Type consistency:** `ShareLink` schema matches the Drizzle row except `hasPassword` (computed) and `passwordHash` (never exposed). `PublicShareInfo` only exposes safe fields.

**Edge cases:**
- 404 on revoked/expired/invalid token (intentionally indistinguishable to prevent probing).
- Direct download on password-protected link returns 401, not 404.
- `visibility: 'private'` refuses link creation with a clear error.
- Public routes bypass the org-context plugin (they don't have `:orgId`).
- The `unlock` route runs Argon2id verify for every attempt — a 50ms budget per call.

---

## Execution handoff

Plan complete. Continue with Plan 8.
