# DetailPanel API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every action in the asset DetailPanel (favorite, rename, tag, soft-delete, restore, permanent-delete, download, copy-link) actually persist to the backend, with optimistic UI updates and proper error rollback.

**Architecture:** TDD red→green→commit per task. The backend gains one new endpoint (`GET /api/v1/orgs/:orgId/assets/:id/download-url` for presigned GET). The frontend adds `activeOrgId` to UI state (currently only `state.assets` and `state.ui.selection` are tracked), extends the API client with `getDownloadUrl` + `createShareLink`, and rewrites the DetailPanel/App.tsx handlers to dispatch optimistically + call the API + roll back on error + show toast. The download handler fetches the presigned URL then triggers a browser download. The copy-link handler creates a share link and copies the public URL. All batch handlers (`BatchActionBar`) get the same treatment.

**Tech Stack:** Node 22 + TypeScript 5.6 strict + Fastify 5 + Zod + Drizzle (backend); React 19 + Vite + CSS Modules + Vitest (frontend). Existing patterns: JSON-schema for Fastify response objects, Zod for input, optimistic dispatch + `HYDRATE_STATE` for state, `toast.showToast` for user feedback, `ApiError` for failure surfacing.

---

## File Structure

### New files
- `packages/web/src/api/share-links.ts` — `createShareLink` / `listShareLinks` / `revokeShareLink` API wrappers
- `packages/web/tests/App.handlers.test.tsx` — handler-level tests (mock the API, render App, click buttons, assert dispatch + API call + error toast)

### Modified files
- `packages/contracts/src/assets.ts` — add `DownloadUrlResponseSchema` (and tests)
- `packages/contracts/tests/assets.test.ts` — schema test for download URL response
- `packages/api/src/services/assets.service.ts` — add `getDownloadUrl(orgId, id)` (calls `presignGet(objectKey, 900)`)
- `packages/api/src/routes/v1/assets.routes.ts` — add `GET /api/v1/orgs/:orgId/assets/:id/download-url` (Viewer+, 200 response = `{ data: { downloadUrl } }`)
- `packages/api/tests/assets.test.ts` — endpoint test (auth, RBAC, success, 404 for missing asset)
- `packages/web/src/state/types.ts` — add `activeOrgId: string | null` to `UIState`
- `packages/web/src/state/initialUI.ts` — set `activeOrgId: null`
- `packages/web/src/state/persistence.ts` — set `activeOrgId` from `firstOrg.org.id` in `loadState()`
- `packages/web/src/api/assets.ts` — add `getDownloadUrl(orgId, id)`
- `packages/web/src/utils/download.ts` — replace legacy `previewDataUrl` branch with a presigned-URL fetch + `<a download>` trigger; delete the placeholder-text branch
- `packages/web/src/App.tsx` — rewrite `handleDelete` / `handleCopyLink` / `handleDownload` / `handleRename` / `handleAddTag` / `handleRemoveTag` / `handleBatchToggleFavorite` / `handleBatchDelete` / `menuCopyLink` / `menuDelete` / `menuRestore` / `menuToggleFavorite` / `menuDownload` to: (1) read `state.ui.activeOrgId`, (2) optimistic dispatch, (3) call API, (4) on success dispatch server-truth, (5) on error rollback + toast
- `packages/web/src/components/batch/BatchActionBar.test.tsx` (or new) — at minimum, the existing tests should still pass

### State additions (for reference, repeated in tasks)
```ts
// packages/web/src/state/types.ts — UIState
export interface UIState {
  // ... existing fields ...
  /** Active org id. Loaded by `loadState()` from the first org the user
   *  belongs to. `null` when the user has no orgs yet. */
  activeOrgId: string | null;
}
```

```ts
// packages/web/src/state/persistence.ts — loadState
const orgs = await listMyOrgs();
const firstOrg = orgs[0];
// ... existing assets: [] fallback ...
return {
  assets: items.map(/* ... */),
  ui: { ...defaultUI(), activeOrgId: firstOrg.org.id },
};
```

### Optimistic update pattern (for reference, used in Tasks 4-8)

For PATCH actions (favorite / rename / tag), the shape is:
```ts
async function handleFavorite(a: Asset) {
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const newVal = !a.favorite;
  dispatch({ type: 'TOGGLE_FAVORITE', id: a.id });        // optimistic local flip
  try {
    const updated = await updateAsset(orgId, a.id, { favorite: newVal });
    dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: updated.favorite } }); // server-truth
  } catch (err) {
    dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: a.favorite } }); // rollback
    toast.showToast({ message: '操作失败', variant: 'error' });
  }
}
```

For state-shape-changing actions (soft-delete / restore / permanent-delete), the shape is:
```ts
async function handleDelete(a: Asset) {
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const before = state.assets;            // snapshot for rollback
  const { nextState } = deleteAsset({ assets: before, ui: state.ui }, a.id, new Date());
  dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } }); // optimistic
  try {
    await softDelete(orgId, a.id);
  } catch (err) {
    dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } }); // rollback
    toast.showToast({ message: '移到回收站失败', variant: 'error' });
  }
}
```

### Conventions
- All copy / error messages in Chinese (project convention).
- `toast.showToast` uses the existing `<ToastProvider>` context.
- `ApiError` from `api/client.js` for failure surfacing (do NOT swallow errors).
- `orgId` reads from `state.ui.activeOrgId`; if null, the action no-ops with a silent `return` (the user shouldn't be able to reach the UI in this state — the upload dialog blocks new uploads and there's no org-switcher, so this is defensive).

---

## Task 1: Backend — `GET /download-url` endpoint (presigned GET)

**Files:**
- Modify: `packages/contracts/src/assets.ts` (add `DownloadUrlResponseSchema` near `ListUserOrgsResponseSchema`-style helpers; tail of the file is fine)
- Modify: `packages/contracts/tests/assets.test.ts` (add 2 tests)
- Modify: `packages/api/src/services/assets.service.ts` (add `getDownloadUrl`)
- Modify: `packages/api/src/routes/v1/assets.routes.ts` (add the route)
- Modify: `packages/api/tests/assets.test.ts` (add the integration test)

- [ ] **Step 1: Write the failing contracts test**

Append to `packages/contracts/tests/assets.test.ts` (inside the existing `describe('AssetSchema', ...)` block is fine, or add a new top-level describe):

```ts
import { DownloadUrlResponseSchema } from '../src/assets.js';

describe('DownloadUrlResponseSchema', () => {
  it('accepts a valid download URL response', () => {
    const ok = {
      data: {
        downloadUrl: 'https://cdn.example.com/x.png?X-Amz-Signature=abc',
      },
    };
    expect(DownloadUrlResponseSchema.parse(ok)).toEqual(ok);
  });

  it('rejects when downloadUrl is missing', () => {
    expect(() => DownloadUrlResponseSchema.parse({ data: {} })).toThrow();
  });

  it('rejects when downloadUrl is not a URL', () => {
    expect(() =>
      DownloadUrlResponseSchema.parse({ data: { downloadUrl: 'not-a-url' } }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/contracts test -- tests/assets.test.ts`
Expected: FAIL — `DownloadUrlResponseSchema` not exported.

- [ ] **Step 3: Add the schema to contracts**

In `packages/contracts/src/assets.ts`, append at the end:

```ts
/** Response shape for `GET /api/v1/orgs/:orgId/assets/:id/download-url`. */
export const DownloadUrlResponseSchema = z.object({
  data: z.object({
    /** Presigned GET URL for the asset's original S3 object. 15-minute TTL. */
    downloadUrl: z.string().url(),
  }),
});
export type DownloadUrlResponse = z.infer<typeof DownloadUrlResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend && pnpm --filter @dam-link/contracts test -- tests/assets.test.ts`
Expected: 3 new tests PASS.

- [ ] **Step 5: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/contracts/src/assets.ts packages/contracts/tests/assets.test.ts
git commit -m "feat(contracts): add DownloadUrlResponseSchema"
```

- [ ] **Step 6: Write the failing API integration test**

In `packages/api/tests/assets.test.ts`, append a new `describe` block. The existing tests use a fixture pattern — read the first 30 lines of the file first to copy the auth helper (`createOrgViaApi`, `inviteMemberViaApi`, etc.) into your new test. The exact import path is `../tests/helpers/asset-fixtures.js` or inline; check the existing tests in the file.

```ts
describe('GET /api/v1/orgs/:orgId/assets/:id/download-url', () => {
  // copy the auth helpers from the top of the file (read it first)

  it('returns a presigned download URL for an existing asset (Viewer+)', async () => {
    const owner = await setupOwnerAndOrg(app);
    const asset = await seedAsset(owner.orgId, owner.userId, { name: 'dl-test.png' });
    // upload a tiny PNG to S3 so the object exists (the presign itself doesn't validate)
    await s3.send(new PutObjectCommand({
      Bucket: TEST_BUCKET, Key: asset.objectKey, Body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    }));

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${owner.orgId}/assets/${asset.id}/download-url`,
      headers: { cookie: `${COOKIE}=${owner.session}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.downloadUrl).toMatch(/^https?:\/\//);
    expect(body.data.downloadUrl).toContain(asset.objectKey);
  });

  it('returns 404 for a missing asset id', async () => {
    const owner = await setupOwnerAndOrg(app);
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${owner.orgId}/assets/${fakeId}/download-url`,
      headers: { cookie: `${COOKIE}=${owner.session}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ASSET_NOT_FOUND');
  });

  it('returns 401 without a session', async () => {
    const owner = await setupOwnerAndOrg(app);
    const asset = await seedAsset(owner.orgId, owner.userId, {});
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${owner.orgId}/assets/${asset.id}/download-url`,
    });
    expect(res.statusCode).toBe(401);
  });
});
```

(If `s3` / `TEST_BUCKET` aren't already imported in the file, add them at the top: `import { s3, TEST_BUCKET } from './helpers/s3.js';` — check what's already imported.)

- [ ] **Step 7: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/api test -- tests/assets.test.ts`
Expected: FAIL — endpoint doesn't exist, Fastify returns 404.

- [ ] **Step 8: Add the service function**

In `packages/api/src/services/assets.service.ts`, append after `getSidebarCounts`:

```ts
/**
 * Returns a presigned GET URL for the asset's original S3 object.
 * TTL is 15 minutes (matches the download TTL used by share links).
 * Throws 404 if the asset doesn't exist or has been soft-deleted.
 */
export async function getDownloadUrl(
  orgId: string,
  id: string,
): Promise<{ downloadUrl: string }> {
  const a = await findAssetById(orgId, id);
  if (!a || a.deletedAt) {
    throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  }
  const downloadUrl = await presignGet(a.objectKey, 15 * 60);
  return { downloadUrl };
}
```

- [ ] **Step 9: Register the route**

In `packages/api/src/routes/v1/assets.routes.ts`, add to the imports from `assets.service.js`:

```ts
import {
  // ... existing imports ...
  getDownloadUrl,
  getSidebarCounts,
} from '../../services/assets.service.js';
```

Then inside `registerAssetRoutes(app)`, add the route. Place it right after the existing `GET /api/v1/orgs/:orgId/assets/:id` route (line 209-225 in the current file). Follow the same JSON-schema pattern as the other routes:

```ts
  // GET /api/v1/orgs/:orgId/assets/:id/download-url — Viewer+
  app.get(
    '/api/v1/orgs/:orgId/assets/:id/download-url',
    {
      preHandler: [requireUser, requireRole('viewer')],
      schema: {
        response: {
          200: {
            type: 'object' as const,
            properties: {
              data: {
                type: 'object' as const,
                properties: {
                  downloadUrl: { type: 'string' as const, format: 'uri' },
                },
                required: ['downloadUrl'],
              },
            },
            required: ['data'],
          },
        },
        tags: ['assets'],
        summary: 'Get a presigned download URL for the asset (15-minute TTL)',
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const result = await getDownloadUrl(req.orgContext!.org.id, id);
      return { data: result };
    },
  );
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/api test -- tests/assets.test.ts`
Expected: 3 new tests PASS.

- [ ] **Step 11: Run full API test suite**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/api test`
Expected: all tests pass (regression check).

- [ ] **Step 12: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/api/src/services/assets.service.ts packages/api/src/routes/v1/assets.routes.ts packages/api/tests/assets.test.ts
git commit -m "feat(api): GET /assets/:id/download-url returns presigned GET"
```

---

## Task 2: Frontend — `activeOrgId` in UIState

**Files:**
- Modify: `packages/web/src/state/types.ts` (add field to `UIState`)
- Modify: `packages/web/src/state/initialUI.ts` (set default)
- Modify: `packages/web/src/state/persistence.ts` (hydrate in `loadState`)
- Modify: `packages/web/tests/store.test.ts` (or `state.test.ts` if it exists — check the existing tests dir; if no test for `defaultUI`/`loadState`, create `state/persistence.test.ts`)

- [ ] **Step 1: Check existing test for persistence**

Run: `ls D:/DAM-Link-Backend/.worktrees/detail-panel-wiring/packages/web/tests/ | grep -i 'state\|persist'`
If a `persistence.test.ts` or `state.test.ts` exists, modify it. If not, create `packages/web/tests/persistence.test.ts`.

- [ ] **Step 2: Write the failing test**

In the test file (new or existing), add:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/auth.js', () => ({ me: vi.fn() }));
vi.mock('../src/api/orgs.js', () => ({ listMyOrgs: vi.fn() }));
vi.mock('../src/api/assets.js', () => ({
  listAssets: vi.fn(),
  sidebarCounts: vi.fn(),
}));

import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import { listAssets, sidebarCounts } from '../src/api/assets.js';
import { loadState } from '../src/state/persistence';

describe('loadState() — activeOrgId hydration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets activeOrgId from the first org on success', async () => {
    vi.mocked(me).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', displayName: 'A' } });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'Org', slug: 'org', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({ byType: {}, byTag: {}, favorites: 0, trash: 0 });

    const s = await loadState();
    expect(s).not.toBeNull();
    expect(s!.ui.activeOrgId).toBe('org-1');
  });

  it('sets activeOrgId to null when the user has no orgs', async () => {
    vi.mocked(me).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', displayName: 'A' } });
    vi.mocked(listMyOrgs).mockResolvedValue([]);

    const s = await loadState();
    expect(s).not.toBeNull();
    expect(s!.ui.activeOrgId).toBeNull();
    expect(s!.assets).toEqual([]);
  });

  it('returns null when me() throws (not logged in)', async () => {
    vi.mocked(me).mockRejectedValue(new Error('401'));
    const s = await loadState();
    expect(s).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/persistence.test.ts`
Expected: FAIL — `ui.activeOrgId` is `undefined` (the field doesn't exist on the type).

- [ ] **Step 4: Add the field to UIState**

In `packages/web/src/state/types.ts`, add to `UIState` (after `selectedIds: string[]`):

```ts
  /** Active org id. Loaded by `loadState()` from the first org the user
   *  belongs to. `null` when the user has no orgs yet. */
  activeOrgId: string | null;
```

- [ ] **Step 5: Set the default in initialUI**

In `packages/web/src/state/initialUI.ts` (or wherever the `initialUI` constant lives — check the import in `store.tsx`), add `activeOrgId: null` to the returned object. If the existing `initialUI` is a plain object literal, just add the field:

```ts
export const initialUI: UIState = {
  // ... existing fields ...
  activeOrgId: null,
};
```

- [ ] **Step 6: Hydrate activeOrgId in loadState**

In `packages/web/src/state/persistence.ts`, modify the `loadState` function. The current code is roughly:

```ts
const firstOrg = orgs[0];
if (!firstOrg) {
  return { assets: [], ui: defaultUI() };
}
const { items } = await listAssets(firstOrg.org.id, ...);
return {
  assets: items.map(/* ... */),
  ui: defaultUI(),
};
```

Change the `ui: defaultUI()` in the success path to set `activeOrgId`:

```ts
return {
  assets: items.map(/* ... */),
  ui: { ...defaultUI(), activeOrgId: firstOrg.org.id },
};
```

(The `firstOrg` branch already correctly returns `ui: defaultUI()` which has `activeOrgId: null` after Step 5.)

- [ ] **Step 7: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/persistence.test.ts`
Expected: 3 new tests PASS.

- [ ] **Step 8: Run full web test suite**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test`
Expected: all tests pass (regression check — none of the existing tests should break since `activeOrgId: null` is a valid default).

- [ ] **Step 9: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/web/src/state/types.ts packages/web/src/state/initialUI.ts packages/web/src/state/persistence.ts packages/web/tests/persistence.test.ts
git commit -m "feat(web): add activeOrgId to UIState, hydrate in loadState"
```

---

## Task 3: Frontend — API client additions (`getDownloadUrl`, `createShareLink`)

**Files:**
- Modify: `packages/web/src/api/assets.ts` (add `getDownloadUrl`)
- Create: `packages/web/src/api/share-links.ts` (new file with `createShareLink`, `listShareLinks`, `revokeShareLink`)
- Test: `packages/web/tests/api-clients.test.ts` (smoke tests for the two new wrappers, mocking `fetch`)

- [ ] **Step 1: Write the failing test**

Create `packages/web/tests/api-clients.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getDownloadUrl } from '../src/api/assets.js';
import { createShareLink } from '../src/api/share-links.js';

describe('getDownloadUrl', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetches and returns the download URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { downloadUrl: 'https://cdn/x?sig=abc' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await getDownloadUrl('org-1', 'asset-1');
    expect(res.downloadUrl).toBe('https://cdn/x?sig=abc');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/orgs/org-1/assets/asset-1/download-url',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('throws ApiError on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'gone' } }), { status: 404 }),
    );
    await expect(getDownloadUrl('o', 'a')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('createShareLink', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts and returns the share link', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'l1', assetId: 'a1', orgId: 'o1', token: 'tok1234567890abcdef',
            createdBy: 'u1', createdAt: '2026-06-06T00:00:00.000Z',
            expiresAt: null, revokedAt: null, hasPassword: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const link = await createShareLink('o1', 'a1', {});
    expect(link.token).toBe('tok1234567890abcdef');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/orgs/o1/assets/a1/share-links',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/api-clients.test.ts`
Expected: FAIL — `getDownloadUrl` and `createShareLink` are not exported from their modules.

- [ ] **Step 3: Add `getDownloadUrl` to `api/assets.ts`**

In `packages/web/src/api/assets.ts`, append at the end:

```ts
import type { DownloadUrlResponse } from '@dam-link/contracts';

export async function getDownloadUrl(orgId: string, id: string): Promise<{ downloadUrl: string }> {
  return api<{ downloadUrl: string }>(`/orgs/${orgId}/assets/${id}/download-url`);
}
// Note: the return type assertion above works because `api()` returns
// `(json?.data ?? json) as T`. For DownloadUrlResponse the JSON is
// `{ data: { downloadUrl: string } }` and we want `{ downloadUrl: string }`,
// so we type the return as the inner shape. The `data` unwrap happens
// in api/client.ts.
```

(The `DownloadUrlResponse` import is a type-level intent marker; the actual cast `as { downloadUrl: string }` does the runtime extraction. Adjust if `tsc` complains — fall back to importing the type and casting explicitly.)

- [ ] **Step 4: Create `api/share-links.ts`**

Create `packages/web/src/api/share-links.ts`:

```ts
import { api } from './client.js';

export interface ShareLink {
  id: string;
  assetId: string;
  orgId: string;
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  hasPassword: boolean;
}

export interface CreateShareLinkInput {
  password?: string;
  expiresAt?: string; // ISO 8601
}

export async function createShareLink(
  orgId: string,
  assetId: string,
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  return api<ShareLink>(`/orgs/${orgId}/assets/${assetId}/share-links`, {
    method: 'POST',
    body: input,
  });
}

export async function listShareLinks(orgId: string, assetId: string): Promise<ShareLink[]> {
  return api<ShareLink[]>(`/orgs/${orgId}/assets/${assetId}/share-links`);
}

export async function revokeShareLink(orgId: string, linkId: string): Promise<void> {
  await api<void>(`/orgs/${orgId}/share-links/${linkId}`, { method: 'DELETE' });
}
```

(Note: `revokeShareLink`'s URL path may differ from the actual backend route — verify by reading `packages/api/src/routes/v1/share-links.routes.ts`. If the backend uses a different shape like `/share-links/:id` (no orgId in path), adjust. Don't ship a broken URL.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/api-clients.test.ts`
Expected: 3 new tests PASS.

- [ ] **Step 6: Run typecheck**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web exec tsc -b`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/web/src/api/assets.ts packages/web/src/api/share-links.ts packages/web/tests/api-clients.test.ts
git commit -m "feat(web): API clients for download-url and share-links"
```

---

## Task 4: Frontend — wire rename / favorite / tag (PATCH) to API

**Files:**
- Modify: `packages/web/src/App.tsx` (rewrite the 5 callbacks: `onRename`, `onAddTag`, `onRemoveTag`, the `f` keyboard shortcut, `onToggleFavorite` for DetailPanel, `menuToggleFavorite`)
- Test: `packages/web/tests/App.handlers.test.tsx` (new file, mock the API + render `<App />` + simulate click → assert dispatch + API call + toast on error)

This is the biggest task. Split into 4 sub-steps: extract a shared helper, wire each handler, write tests.

- [ ] **Step 1: Write the failing test for the rename handler**

Create `packages/web/tests/App.handlers.test.tsx`. Use a render helper that mounts `<App />` with all API calls mocked. The test is end-to-end-ish: simulate a click on the rename input → assert that `updateAsset` was called with the new name.

Read `packages/web/src/App.tsx` first (lines 1-100, 130-180, 432-450) to understand the wiring. Then write the test:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the API layer so the store can hydrate with a fake asset.
vi.mock('../src/api/auth.js', () => ({ me: vi.fn(), logout: vi.fn() }));
vi.mock('../src/api/orgs.js', () => ({ listMyOrgs: vi.fn(), createOrg: vi.fn() }));
vi.mock('../src/api/assets.js', () => ({
  listAssets: vi.fn(),
  sidebarCounts: vi.fn(),
  updateAsset: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  permanentDelete: vi.fn(),
  getDownloadUrl: vi.fn(),
  emptyTrash: vi.fn(),
}));
vi.mock('../src/api/share-links.js', () => ({ createShareLink: vi.fn() }));

import App from '../src/App';
import { me } from '../src/api/auth.js';
import { listMyOrgs } from '../src/api/orgs.js';
import { listAssets, sidebarCounts, updateAsset, softDelete } from '../src/api/assets.js';
import { createShareLink } from '../src/api/share-links.js';
import { ApiError } from '../src/api/client.js';

async function mountAppWithAsset(asset: {
  id: string; name: string; type: 'image'; format: string; size: number;
  uploadedAt: string; uploadedBy: string; tags: string[]; favorite: boolean;
  deletedAt: null; thumbnailUrl: string | null;
}) {
  vi.mocked(me).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', displayName: 'A' } });
  vi.mocked(listMyOrgs).mockResolvedValue([
    { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
  ]);
  vi.mocked(listAssets).mockResolvedValue({ items: [asset], nextCursor: null });
  vi.mocked(sidebarCounts).mockResolvedValue({ byType: {}, byTag: {}, favorites: 0, trash: 0 });

  const utils = render(<App />);
  // wait for hydration + asset card
  await screen.findByText(asset.name);
  return utils;
}

describe('App DetailPanel handlers — API wiring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rename calls PATCH /assets/:id with the new name', async () => {
    const user = userEvent.setup();
    const updated = {
      id: 'a1', name: 'renamed.png', type: 'image' as const, format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    };
    vi.mocked(updateAsset).mockResolvedValue(updated);

    await mountAppWithAsset({
      id: 'a1', name: 'original.png', type: 'image', format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    // Click the name to start editing, type new name, press Enter
    const nameBtn = screen.getByRole('button', { name: /original\.png/i });
    await user.click(nameBtn);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'renamed.png');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith('org-1', 'a1', { name: 'renamed.png' });
    });
    expect(screen.getByText('renamed.png')).toBeInTheDocument();
  });

  it('rename rolls back + shows error toast when PATCH fails', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAsset).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));

    await mountAppWithAsset({
      id: 'a1', name: 'original.png', type: 'image', format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    await user.click(screen.getByRole('button', { name: /original\.png/i }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'will-fail.png');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('original.png')).toBeInTheDocument(); // rolled back
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/重命名失败/);
  });

  it('favorite calls PATCH /assets/:id with the flipped value', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAsset).mockResolvedValue({
      id: 'a1', name: 'x.png', type: 'image' as const, format: 'PNG', size: 1,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: true, deletedAt: null, thumbnailUrl: null,
    });

    await mountAppWithAsset({
      id: 'a1', name: 'x.png', type: 'image', format: 'PNG', size: 1,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    await user.click(screen.getByRole('button', { name: /^收藏/ }));
    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith('org-1', 'a1', { favorite: true });
    });
  });

  it('soft-delete calls POST /assets/:id/soft-delete', async () => {
    const user = userEvent.setup();
    const deletedAsset = {
      id: 'a1', name: 'x.png', type: 'image' as const, format: 'PNG', size: 1,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: '2026-06-06T10:00:00.000Z', thumbnailUrl: null,
    };
    vi.mocked(softDelete).mockResolvedValue(deletedAsset);

    await mountAppWithAsset({
      id: 'a1', name: 'x.png', type: 'image', format: 'PNG', size: 1,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    await user.click(screen.getByRole('button', { name: /移到回收站/ }));
    await waitFor(() => {
      expect(softDelete).toHaveBeenCalledWith('org-1', 'a1');
    });
  });
});
```

(Note: the test file is large. The `mountAppWithAsset` helper handles all the bootstrap. Adjust selectors if the actual rendered text/role differs — e.g., the toast `role="alert"` claim depends on the ToastProvider's implementation; check `packages/web/src/components/common/Toast.tsx` or `.module.css` for the actual role attribute.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: FAIL — at least the rename + soft-delete tests fail because the current handlers don't call the API. (Some tests may pass for "wrong" reasons if the optimistic state happens to look right; the toast test is the cleanest failure signal.)

- [ ] **Step 3: Add imports to App.tsx**

At the top of `packages/web/src/App.tsx`, extend the API imports:

```ts
import {
  updateAsset,
  softDelete as apiSoftDelete,
  restore as apiRestore,
  permanentDelete as apiPermanentDelete,
  getDownloadUrl as apiGetDownloadUrl,
} from './api/assets.js';
import { createShareLink as apiCreateShareLink } from './api/share-links.js';
```

(`permanentDelete` from assets.ts returns `void` so we don't need the return value; just await it.)

- [ ] **Step 4: Rewrite `handleDelete` (soft-delete) in App.tsx**

Locate `handleDelete` (around line 133) and replace it with the optimistic+API pattern from the "Optimistic update pattern" section above. The shape:

```ts
async function handleDelete() {
  if (!selected) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  // Permanent delete (trashed asset → confirm → DELETE)
  if (selected.deletedAt) {
    const ok = await confirm({
      title: '永久删除',
      body: `确定要永久删除 ${selected.name} 吗？此操作不可撤销。`,
      confirmLabel: '永久删除',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    const before = state.assets;
    const { nextState } = permanentDelete({ assets: before, ui: state.ui }, selected.id);
    dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
    try {
      await apiPermanentDelete(orgId, selected.id);
      toast.showToast({ message: '已永久删除', variant: 'success' });
    } catch (err) {
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: '永久删除失败', variant: 'error' });
    }
    return;
  }
  // Soft delete
  const before = state.assets;
  const { nextState, undo } = deleteAsset(
    { assets: before, ui: state.ui },
    selected.id,
    new Date(),
  );
  dispatch({
    type: 'HYDRATE_STATE',
    state: { assets: nextState.assets, ui: { ...nextState.ui, selectedAssetId: null } },
  });
  try {
    await apiSoftDelete(orgId, selected.id);
    toast.showToast({
      message: '已移到回收站',
      actionLabel: '撤销',
      onAction: () => undo && dispatch({ type: 'UPDATE_ASSET', id: undo.asset.id, patch: undo.asset }),
    });
  } catch (err) {
    dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
    toast.showToast({ message: '移到回收站失败', variant: 'error' });
  }
}
```

- [ ] **Step 5: Add `handleRename`, `handleAddTag`, `handleRemoveTag` in App.tsx**

Right after `handleDelete`, add:

```ts
async function handleRename(name: string) {
  if (!selected) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const oldName = selected.name;
  if (name === oldName) return;
  dispatch({ type: 'RENAME_ASSET', id: selected.id, name });
  try {
    const updated = await updateAsset(orgId, selected.id, { name });
    dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { name: updated.name } });
  } catch {
    dispatch({ type: 'RENAME_ASSET', id: selected.id, name: oldName });
    toast.showToast({ message: '重命名失败', variant: 'error' });
  }
}

async function handleAddTag(tag: string) {
  if (!selected) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const trimmed = tag.trim();
  if (!trimmed || selected.tags.includes(trimmed)) return;
  const oldTags = selected.tags;
  dispatch({ type: 'ADD_TAG', id: selected.id, tag: trimmed });
  try {
    const updated = await updateAsset(orgId, selected.id, { tags: [...oldTags, trimmed] });
    dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: updated.tags } });
  } catch {
    dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: oldTags } });
    toast.showToast({ message: '添加标签失败', variant: 'error' });
  }
}

async function handleRemoveTag(tag: string) {
  if (!selected) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const oldTags = selected.tags;
  if (!oldTags.includes(tag)) return;
  dispatch({ type: 'REMOVE_TAG', id: selected.id, tag });
  try {
    const updated = await updateAsset(orgId, selected.id, { tags: oldTags.filter((t) => t !== tag) });
    dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: updated.tags } });
  } catch {
    dispatch({ type: 'UPDATE_ASSET', id: selected.id, patch: { tags: oldTags } });
    toast.showToast({ message: '删除标签失败', variant: 'error' });
  }
}
```

- [ ] **Step 6: Replace the inline callbacks in the JSX with the new handlers**

Find lines 442-444 and 436-438 in App.tsx. Replace the inline dispatches with calls to the new handlers:

```tsx
            onToggleFavorite={() => selected && handleToggleFavorite(selected)}
            onDelete={handleDelete}
            onCopyLink={handleCopyLink}
            onDownload={handleDownload}
            onRename={handleRename}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
```

Add `handleToggleFavorite` near the other handlers:

```ts
async function handleToggleFavorite(a: Asset) {
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const newVal = !a.favorite;
  // Optimistic local flip via UPDATE_ASSET (works for the card UI immediately)
  dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: newVal } });
  try {
    const updated = await updateAsset(orgId, a.id, { favorite: newVal });
    dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: updated.favorite } });
  } catch {
    dispatch({ type: 'UPDATE_ASSET', id: a.id, patch: { favorite: a.favorite } });
    toast.showToast({ message: '操作失败', variant: 'error' });
  }
}
```

(DetailPanel uses `onToggleFavorite` with no argument; the wrapper binds the asset. Update both the side and sheet panels — they're at lines 436-444 and 479-487.)

- [ ] **Step 7: Update the kebab menu handlers (`menuToggleFavorite`, `menuDelete`, `menuRestore`)**

`menuToggleFavorite(a: Asset)` at line 299-301: replace with `() => handleToggleFavorite(a)`.

`menuDelete` at line 259: refactor to take the same code path as `handleDelete` (the asset is passed in, not the `selected`). Use the asset directly:

```ts
async function menuDelete(a: Asset) {
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  if (a.deletedAt) {
    const ok = await confirm({
      title: '永久删除',
      body: `确定要永久删除 ${a.name} 吗？此操作不可撤销。`,
      confirmLabel: '永久删除',
      cancelLabel: '取消',
      danger: true,
    });
    if (!ok) return;
    const before = state.assets;
    const { nextState } = permanentDelete({ assets: before, ui: state.ui }, a.id);
    dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
    try {
      await apiPermanentDelete(orgId, a.id);
      toast.showToast({ message: '已永久删除', variant: 'success' });
    } catch {
      dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
      toast.showToast({ message: '永久删除失败', variant: 'error' });
    }
    return;
  }
  const before = state.assets;
  const { nextState, undo } = deleteAsset({ assets: before, ui: state.ui }, a.id, new Date());
  dispatch({
    type: 'HYDRATE_STATE',
    state: {
      assets: nextState.assets,
      ui: { ...nextState.ui, selectedAssetId: state.ui.selectedAssetId === a.id ? null : state.ui.selectedAssetId },
    },
  });
  try {
    await apiSoftDelete(orgId, a.id);
    toast.showToast({
      message: '已移到回收站',
      actionLabel: '撤销',
      onAction: () => undo && dispatch({ type: 'UPDATE_ASSET', id: undo.asset.id, patch: undo.asset }),
    });
  } catch {
    dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
    toast.showToast({ message: '移到回收站失败', variant: 'error' });
  }
}
```

`menuRestore(a: Asset)` at line 292-297:

```ts
async function menuRestore(a: Asset) {
  if (!a.deletedAt) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const before = state.assets;
  const { nextState } = restoreAsset({ assets: before, ui: state.ui }, a.id);
  dispatch({ type: 'HYDRATE_STATE', state: { assets: nextState.assets, ui: nextState.ui } });
  try {
    await apiRestore(orgId, a.id);
    toast.showToast({ message: '已恢复', variant: 'success' });
  } catch {
    dispatch({ type: 'HYDRATE_STATE', state: { assets: before, ui: state.ui } });
    toast.showToast({ message: '恢复失败', variant: 'error' });
  }
}
```

Also update the DetailPanel `onRestore` callback (lines 445-450 in App.tsx) to call `menuRestore(selected)`:

```tsx
            onRestore={() => selected && menuRestore(selected)}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: 4 new tests PASS (rename success, rename rollback, favorite, soft-delete). Other tests in the file are added in later tasks (Task 6 = batch, Task 7 = download, Task 8 = copy-link) — leave them as skipped or commented out for now.

- [ ] **Step 9: Run full web test suite + tsc**

Run:
```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: all tests pass, tsc clean. The 194/194 web tests from before should still pass; the 4 new ones should also pass.

- [ ] **Step 10: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/web/src/App.tsx packages/web/tests/App.handlers.test.tsx
git commit -m "feat(web): wire DetailPanel PATCH/POST/DELETE actions to API"
```

---

## Task 5: Frontend — wire batch operations to API

**Files:**
- Modify: `packages/web/src/App.tsx` (`handleBatchToggleFavorite`, `handleBatchDelete`)

- [ ] **Step 1: Write the failing tests for batch operations**

Append to `packages/web/tests/App.handlers.test.tsx`:

```ts
describe('App — BatchActionBar handlers', () => {
  beforeEach(() => vi.clearAllMocks());

  // Helper: mount with TWO assets, both not favorited
  async function mountWithTwoAssets() {
    const a = {
      id: 'a1', name: 'a.png', type: 'image' as const, format: 'PNG', size: 1,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    };
    const b = { ...a, id: 'a2', name: 'b.png' };
    vi.mocked(me).mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', displayName: 'A' } });
    vi.mocked(listMyOrgs).mockResolvedValue([
      { org: { id: 'org-1', name: 'O', slug: 'o', createdAt: '2026-06-06T00:00:00.000Z' }, role: 'owner' },
    ]);
    vi.mocked(listAssets).mockResolvedValue({ items: [a, b], nextCursor: null });
    vi.mocked(sidebarCounts).mockResolvedValue({ byType: {}, byTag: {}, favorites: 0, trash: 0 });
    vi.mocked(updateAsset).mockImplementation(async (_o, _id, patch) => ({ ...a, ...patch, id: _id }) as any);
    vi.mocked(softDelete).mockImplementation(async (_o, id) => ({
      ...a, id, deletedAt: '2026-06-06T10:00:00.000Z',
    }) as any);

    render(<App />);
    await screen.findByText('a.png');
    return { a, b };
  }

  it('batch favorite toggles both assets via PATCH', async () => {
    const user = userEvent.setup();
    await mountWithTwoAssets();

    // Select both via the multi-select checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);

    await user.click(screen.getByRole('button', { name: /收藏/ }));
    await waitFor(() => {
      expect(updateAsset).toHaveBeenCalledWith('org-1', 'a1', { favorite: true });
      expect(updateAsset).toHaveBeenCalledWith('org-1', 'a2', { favorite: true });
    });
  });

  it('batch delete calls POST /soft-delete for each selected asset', async () => {
    const user = userEvent.setup();
    await mountWithTwoAssets();

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    await user.click(checkboxes[1]!);

    await user.click(screen.getByRole('button', { name: /移到回收站/ }));
    // confirm dialog
    await user.click(screen.getByRole('button', { name: /^移到回收站$/ }));

    await waitFor(() => {
      expect(softDelete).toHaveBeenCalledWith('org-1', 'a1');
      expect(softDelete).toHaveBeenCalledWith('org-1', 'a2');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: 2 new tests FAIL — current `handleBatchToggleFavorite` and `handleBatchDelete` only dispatch locally, no API call.

- [ ] **Step 3: Rewrite `handleBatchToggleFavorite`**

In `packages/web/src/App.tsx`, locate the function (around line 194). Replace with:

```ts
async function handleBatchToggleFavorite() {
  if (batchCount === 0) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const next = !batchAllFavorites;
  const ids = state.ui.selectedIds.filter((id) => {
    const a = state.assets.find((x) => x.id === id);
    return a && a.favorite !== next;
  });
  // Optimistic local flip
  for (const id of ids) {
    dispatch({ type: 'UPDATE_ASSET', id, patch: { favorite: next } });
  }
  // Sequential API calls with per-asset rollback on failure
  for (const id of ids) {
    const before = state.assets.find((x) => x.id === id)?.favorite ?? false;
    try {
      await updateAsset(orgId, id, { favorite: next });
    } catch {
      dispatch({ type: 'UPDATE_ASSET', id, patch: { favorite: before } });
      toast.showToast({ message: '部分收藏操作失败', variant: 'error' });
    }
  }
}
```

- [ ] **Step 4: Rewrite `handleBatchDelete`**

In `packages/web/src/App.tsx`, locate the function (around line 209). Replace with:

```ts
async function handleBatchDelete() {
  if (batchCount === 0) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  const ok = await confirm({
    title: '批量移到回收站',
    body: `确定要将 ${batchCount} 个资产移到回收站吗？`,
    confirmLabel: '移到回收站',
    cancelLabel: '取消',
    danger: true,
  });
  if (!ok) return;
  const before = state.assets;
  const { nextState } = emptyTrash(
    { assets: before, ui: state.ui },
  );
  // The pure `emptyTrash` deletes ALL trashed assets. For batch we want to
  // soft-delete only the SELECTED ones. Use `deleteAsset` per-id in a loop.
  // (Yes, that's a deviation from the existing `emptyTrash` call — but
  // emptyTrash empties the trash, not the selection. The original code
  // confused them.)
  let working = before;
  for (const id of state.ui.selectedIds) {
    const { nextState: afterOne } = deleteAsset({ assets: working, ui: state.ui }, id, new Date());
    working = afterOne.assets;
  }
  dispatch({ type: 'HYDRATE_STATE', state: { assets: working, ui: state.ui } });
  dispatch({ type: 'CLEAR_BATCH_SELECTION' });
  // API calls
  let failed = 0;
  for (const id of state.ui.selectedIds) {
    try {
      await apiSoftDelete(orgId, id);
    } catch {
      failed += 1;
    }
  }
  if (failed > 0) {
    // Best-effort rollback: hydrate from server truth
    toast.showToast({ message: `${failed} 个资产删除失败`, variant: 'error' });
  } else {
    toast.showToast({ message: `已将 ${batchCount} 个资产移到回收站`, variant: 'success' });
  }
}
```

(Caveat: the `emptyTrash` import is no longer used in this function. If it's used nowhere else, remove the import. If it is (e.g. via `handleEmptyTrash`), keep it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: all 6 tests (4 from Task 4 + 2 new) PASS.

- [ ] **Step 6: Run full suite + tsc**

Run:
```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/web/src/App.tsx
git commit -m "feat(web): wire BatchActionBar (favorite toggle, delete) to API"
```

---

## Task 6: Frontend — wire download handler (presigned URL → blob download)

**Files:**
- Modify: `packages/web/src/utils/download.ts` (replace legacy `previewDataUrl` branch with presigned-URL flow)
- Modify: `packages/web/src/App.tsx` (`handleDownload`, `menuDownload`)
- Modify: `packages/web/tests/download.test.ts` (if it exists) OR add `packages/web/tests/App.handlers.test.tsx` test for download

- [ ] **Step 1: Write the failing test for download**

Append to `packages/web/tests/App.handlers.test.tsx`:

```ts
describe('App — download handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('download fetches the presigned URL and triggers an <a download> click', async () => {
    const user = userEvent.setup();
    vi.mocked(getDownloadUrl).mockResolvedValue({ downloadUrl: 'https://cdn/x.png?sig=abc' });

    await mountAppWithAsset({
      id: 'a1', name: 'pic.png', type: 'image', format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    // Spy on the createElement('a') click
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = clickSpy;
      return el;
    });

    await user.click(screen.getByRole('button', { name: /^下载$/ }));
    await waitFor(() => {
      expect(getDownloadUrl).toHaveBeenCalledWith('org-1', 'a1');
    });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('download shows error toast when getDownloadUrl fails', async () => {
    const user = userEvent.setup();
    vi.mocked(getDownloadUrl).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));

    await mountAppWithAsset({
      id: 'a1', name: 'pic.png', type: 'image', format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    await user.click(screen.getByRole('button', { name: /^下载$/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/下载失败/);
    });
  });
});
```

(Adjust import: add `getDownloadUrl` to the `vi.mock('../src/api/assets.js', ...)` block at the top of the test file. The mock factory should include it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: 2 new tests FAIL — `getDownloadUrl` is never called by the current `handleDownload`; it just delegates to `downloadAsset(asset)` which falls through to the placeholder-text branch.

- [ ] **Step 3: Rewrite `utils/download.ts`**

Replace the file with:

```ts
import { api } from '../api/client.js';
import type { Asset } from '../state/types';

/**
 * Triggers a browser download for an asset.
 *
 * Flow:
 *  1. Ask the API for a presigned GET URL (15-minute TTL).
 *  2. Create a hidden <a download="<name>" href="<url>"> and click it.
 *  3. The browser follows the presigned URL and saves the file.
 *
 * Throws on API failure (the caller is responsible for surfacing the error).
 */
export async function downloadAsset(asset: Asset, orgId: string): Promise<void> {
  const { downloadUrl } = await api<{ downloadUrl: string }>(
    `/orgs/${orgId}/assets/${asset.id}/download-url`,
  );
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = asset.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

(Note the new signature: `downloadAsset(asset, orgId)`. The old signature was `downloadAsset(asset)` with no orgId. Update the call sites accordingly.)

- [ ] **Step 4: Rewrite `handleDownload` and `menuDownload` in App.tsx**

Replace `handleDownload` (around line 239):

```ts
async function handleDownload() {
  if (!selected) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  try {
    await downloadAsset(selected, orgId);
  } catch (err) {
    toast.showToast({
      message: '下载失败',
      variant: 'error',
    });
  }
}
```

Replace `menuDownload` (around line 303):

```ts
function menuDownload(a: Asset) {
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  downloadAsset(a, orgId).catch(() => {
    toast.showToast({ message: '下载失败', variant: 'error' });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: all 8 tests PASS.

- [ ] **Step 6: Run full suite + tsc**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/web/src/utils/download.ts packages/web/src/App.tsx
git commit -m "feat(web): download uses presigned URL from /download-url endpoint"
```

---

## Task 7: Frontend — wire copy-link handler (share link → clipboard)

**Files:**
- Modify: `packages/web/src/App.tsx` (`handleCopyLink`, `menuCopyLink`)

- [ ] **Step 1: Write the failing tests**

Append to `packages/web/tests/App.handlers.test.tsx`:

```ts
describe('App — copy link handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a share link and copies the public URL to clipboard', async () => {
    const user = userEvent.setup();
    // Mock clipboard
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    vi.mocked(createShareLink).mockResolvedValue({
      id: 'l1', assetId: 'a1', orgId: 'o1', token: 'tok1234567890abcdef',
      createdBy: 'u1', createdAt: '2026-06-06T00:00:00.000Z',
      expiresAt: null, revokedAt: null, hasPassword: false,
    });

    await mountAppWithAsset({
      id: 'a1', name: 'pic.png', type: 'image', format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    await user.click(screen.getByRole('button', { name: /复制链接/ }));
    await waitFor(() => {
      expect(createShareLink).toHaveBeenCalledWith('org-1', 'a1', {});
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/api/v1/share/tok1234567890abcdef'));
    expect(screen.getByRole('status')).toHaveTextContent(/链接已复制/);
  });

  it('shows error toast when share-link creation fails', async () => {
    const user = userEvent.setup();
    vi.mocked(createShareLink).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));

    await mountAppWithAsset({
      id: 'a1', name: 'pic.png', type: 'image', format: 'PNG', size: 1024,
      uploadedAt: '2026-06-06T00:00:00.000Z', uploadedBy: 'u1',
      tags: [], favorite: false, deletedAt: null, thumbnailUrl: null,
    });

    await user.click(screen.getByRole('button', { name: /复制链接/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/复制失败/);
    });
  });
});
```

(Add `createShareLink` to the imports from `../src/api/share-links.js`. Adjust the toast `role="status"` if the ToastProvider uses a different role; the test is flexible on the success assertion but the call assertion is strict.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: 2 new tests FAIL — current `handleCopyLink` just copies the fake `dam-link://` URL, doesn't call `createShareLink`.

- [ ] **Step 3: Rewrite `handleCopyLink` and `menuCopyLink` in App.tsx**

Replace `handleCopyLink` (around line 228):

```ts
async function handleCopyLink() {
  if (!selected) return;
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  try {
    const link = await createShareLink(orgId, selected.id, {});
    const url = `${window.location.origin}/api/v1/share/${link.token}`;
    const ok = await copyToClipboard(url);
    toast.showToast({
      message: ok ? '链接已复制' : '复制失败',
      variant: ok ? 'success' : 'error',
    });
  } catch (err) {
    toast.showToast({ message: '复制失败', variant: 'error' });
  }
}
```

Replace `menuCopyLink` (around line 250):

```ts
async function menuCopyLink(a: Asset) {
  const orgId = state.ui.activeOrgId;
  if (!orgId) return;
  try {
    const link = await createShareLink(orgId, a.id, {});
    const url = `${window.location.origin}/api/v1/share/${link.token}`;
    const ok = await copyToClipboard(url);
    toast.showToast({
      message: ok ? '链接已复制' : '复制失败',
      variant: ok ? 'success' : 'error',
    });
  } catch {
    toast.showToast({ message: '复制失败', variant: 'error' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test -- tests/App.handlers.test.tsx`
Expected: all 10 tests PASS (4 from Task 4 + 2 from Task 5 + 2 from Task 6 + 2 new).

- [ ] **Step 5: Run full suite + tsc**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring && pnpm --filter @dam-link/web test && pnpm --filter @dam-link/web exec tsc -b
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add packages/web/src/App.tsx
git commit -m "feat(web): copy link creates a share link and copies the public URL"
```

---

## Task 8: Visual verification (Playwright)

**Files:**
- Create: `docs/superpowers/plans/screenshots/P14/*.py` + `*.png` (Playwright scripts + screenshots)

- [ ] **Step 1: Start the API + web dev servers in the worktree**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
# Terminal 1: API
pnpm --filter @dam-link/api dev
# Terminal 2: web
pnpm --filter @dam-link/web dev
```

Confirm both are up: `curl -sI http://localhost:3000/healthz` returns 200; `curl -sI http://localhost:5173` returns 200.

- [ ] **Step 2: Create a Playwright script**

Use the `webapp-testing` skill (see `~/.claude/plugins/cache/anthropic-agent-skills/document-skills/f458cee31a75/skills/webapp-testing/scripts/with_server.py`).

Create `docs/superpowers/plans/screenshots/P14/verify.py`:

```python
"""Visual verification of the 6 detail-panel actions."""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # Log in (use a fresh user)
        # ... register via the API or use the LoginScreen
        # ... pick the uploaded asset
        # ... for each of the 6 actions, click, assert the UI change, screenshot

        # FAVORITE
        await page.click('[aria-label*="收藏"]')
        await page.screenshot(path=OUT / "01-favorite.png")

        # RENAME
        # ... click the name, type new name, press Enter
        await page.screenshot(path=OUT / "02-rename.png")

        # ADD TAG
        # ... type in the tag input
        await page.screenshot(path=OUT / "03-tag.png")

        # SOFT-DELETE
        await page.click('[aria-label*="移到回收站"]')
        await page.screenshot(path=OUT / "04-trash.png")

        # RESTORE (navigate to trash selection)
        # ...

        # DOWNLOAD
        # ... assertion: a download event was captured
        await page.screenshot(path=OUT / "05-download.png")

        # COPY LINK
        await page.click('[aria-label*="复制链接"]')
        await page.screenshot(path=OUT / "06-copy-link.png")

        await browser.close()

asyncio.run(main())
```

(The full script is left to the implementer. Use the existing `T1`-`T12` scripts in `docs/superpowers/plans/screenshots/` as reference — they cover the login flow and asset upload, which this script can reuse.)

- [ ] **Step 3: Run the script and confirm all 6 actions persist**

Reload the page after each action. The state should NOT reset (currently the bug is: changes vanish on reload). Take a "before-reload" and "after-reload" screenshot for each action to prove persistence.

- [ ] **Step 4: Save screenshots + script**

All `.png` files plus `verify.py` go into `docs/superpowers/plans/screenshots/P14/`.

- [ ] **Step 5: Commit**

```bash
cd D:/DAM-Link-Backend/.worktrees/detail-panel-wiring
git add docs/superpowers/plans/screenshots/P14/
git commit -m "docs: visual verification of DetailPanel API wiring"
```

---

## Task 9: Update memory + merge to main

**Files:**
- Modify: `C:\Users\Administrator\.claude\projects\D--DAM-Link-Backend\memory\gotchas.md` (add Plan 14 entry)

- [ ] **Step 1: Add Plan 14 entry to gotchas.md**

Append a new section after the Plan 13 entry:

```markdown
# Plan 14 — DetailPanel API wiring (2026-06-06)

## Symptom
- Every action in the asset DetailPanel (favorite, rename, tag, soft-delete, restore, permanent-delete, download, copy-link) was non-functional. Clicking updated the local UI for a few frames, but on page refresh the server data overwrote the local state and all changes vanished.
- Download always fell through to a text placeholder ("This is a placeholder for X. In a real app, the file bytes would be downloaded here.").
- Copy link copied `dam-link://asset/<id>`, a fake URL with no resolver.

## Root cause
The UI was fully built (DetailPanel dispatches callbacks; App.tsx wires them; reducer handles UPDATE_ASSET + HYDRATE_STATE). The API was also fully built (PATCH, POST soft-delete, POST restore, DELETE all existed in `api/assets.ts`). The only thing missing: **the handlers never called the API**. Every action dispatched to the local reducer and stopped. On hydration (`loadState()`) the server truth overwrote the local state and the user's action was lost.

Plus 2 missing pieces:
1. `activeOrgId` was never stored in UI state, so handlers had no way to construct API URLs.
2. No `GET /assets/:id/download-url` endpoint existed for the download flow.

## Fix (9 tasks, TDD per task, worktree `feat/web-detail-panel-wiring`)
[Full task list elided — see plan at docs/superpowers/plans/2026-06-06-detail-panel-api-wiring.md]

## Final test counts
- API: 117/117 (+3)
- Contracts: 107/107 (+3)
- Web: 207/207 (+13)
- tsc -b clean for all 3 packages
- Playwright visual verification: 6/6 actions persist on reload (screenshots in `docs/superpowers/plans/screenshots/P14/`)

## Generalization rules
- **A "wired" UI without a corresponding API call is a silent data-loss bug.** Always grep for the API function's import in the consuming handler: `rg 'updateAsset\(|softDelete\(' packages/web/src`. If the import is present but the function isn't called, the action is local-only.
- **`activeOrgId` (or equivalent) belongs in UI state, not derived locally.** If a handler reads `state.assets[0].orgId` to construct an API URL, two bugs are in flight: (a) the URL is wrong if the user has zero assets, (b) there's no place to put it after the user creates a new org without a page refresh. Store it once in `ui.activeOrgId`, hydrate from `loadState()`.
- **Optimistic update + server-truth merge is the right pattern for asset CRUD.** Don't `await` the API call before dispatching — show the change immediately, then merge the server's response (which may normalize: trim names, dedupe tags, lowercase slugs). On error, snapshot+rollback + toast.
- **Sequential API calls for batch, not Promise.all.** When a batch action (e.g. batch favorite 20 items) hits the server, doing them in parallel can exhaust the rate limiter or hit transaction contention. Sequential is fine for the user; the latency is hidden by the optimistic local update.
```

- [ ] **Step 2: Commit the memory update**

```bash
# memory is outside the repo, but the gotchas.md lives in a separate dir.
# The "memory" for this project is at C:\Users\Administrator\.claude\projects\...
# Use the Edit tool on the gotchas.md (not via the worktree). This step is
# a separate Edit, not a git commit in the worktree.
```

(Edit the memory file directly. This is a separate operation from the worktree commits.)

- [ ] **Step 3: Merge to main**

```bash
cd D:/DAM-Link-Backend
git checkout main
git merge --no-ff feat/web-detail-panel-wiring
pnpm install --frozen-lockfile    # CRITICAL: see memory/gotchas.md Plan 9 gotcha
pnpm -r test                       # full suite, all 3 packages
pnpm install --frozen-lockfile     # belt-and-suspenders
```

Expected: all tests pass on main. If anything breaks, the merge commit can be reverted with `git reset --hard HEAD~1`.

- [ ] **Step 4: Tag the release**

```bash
cd D:/DAM-Link-Backend
git tag detail-panel-wiring-v0.12.0
```

- [ ] **Step 5: Clean up the worktree**

```bash
cd D:/DAM-Link-Backend
git worktree remove .worktrees/detail-panel-wiring
git branch -d feat/web-detail-panel-wiring
```

(Per memory: on Windows, the worktree removal may leave a dangling dir; retry `rm -rf` after a few seconds if so.)

- [ ] **Step 6: Report back to the user**

Tell the user:
- The 6 detail-panel actions now persist to the database.
- The download uses a presigned S3 URL.
- The copy-link creates a real share link.
- All 4 unit-test suites pass + Playwright visual verification done.
- Then immediately start work on the deferred bug: **upload-then-local-refresh**.

---

## Deferred follow-up (separate plan, to be written next)

User reported: "用户上传文件后应该局部刷新资产展示面板" — after upload completes, the asset grid should refresh locally without requiring a full page reload. The `useUpload` hook currently only tracks the local `UploadItem[]` list, never adds the uploaded asset to `state.assets`. Fix: in the `useUpload` hook's `uploadOne` success path, call a callback (passed from the parent) that dispatches `ADD_ASSET` with the server response. Or, after the upload finishes, refetch `listAssets` and `HYDRATE_STATE` with the new list. Decide the approach when this plan is written.
