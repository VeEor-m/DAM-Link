# DAM-Link API Contract (v1)

> **Audience:** backend implementer
> **Status:** v1.0 — stack locked: **Node 20 + Fastify 4 + PostgreSQL 16**
> **Frontend reference:** this contract mirrors the data model in `src/state/types.ts` and the selector semantics in `src/state/selectors.ts`. The frontend should be the source of truth for the *shape*; this doc is the source of truth for the *URL/verb/method*.

---

## 1. Conventions

### 1.1 Base
- **Base URL:** `/api/v1`
- **Content type:** `application/json; charset=utf-8` for all request/response bodies, except uploads (see §5).
- **Versioning:** major version in path (`/api/v1/...`). Backwards-incompatible changes bump to `/api/v2`.

### 1.2 Auth
- **Bearer token** in `Authorization: Bearer <token>` header.
- Token is opaque to clients; backend resolves to a user identity.
- All mutating endpoints require auth. `GET` endpoints require auth in production; the public-read flag is out of scope for v1.
- Frontend hard-codes `uploadedBy: "我"` today; once auth lands, the backend must read `uploadedBy` from the resolved identity, not the request body.

### 1.3 Timestamps & sizes
- All timestamps: ISO 8601 in UTC, e.g. `2026-06-04T08:30:00.000Z`.
- All sizes: bytes (integer).
- All IDs: UUID v4.

### 1.4 Pagination
- Query params: `?page=1&pageSize=50`.
- `page` is 1-indexed. `pageSize` defaults to 50, max 200.
- List responses include a top-level `pagination` block:
  ```json
  {
    "items": [...],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "total": 137,
      "totalPages": 3
    }
  }
  ```

### 1.5 Errors
- Non-2xx responses return a JSON body of the shape:
  ```json
  {
    "error": {
      "code": "ASSET_NOT_FOUND",
      "message": "Human-readable description.",
      "details": { "id": "..." }
    }
  }
  ```
- `code` is a stable machine-readable string (UPPER_SNAKE_CASE). `message` is for humans, may be localized later.

### 1.6 Sorting
- `?sort=<field>:<asc|desc>`. Multiple sorts via repeated param: `?sort=name:asc&sort=size:desc`.
- Default for `GET /assets` is `uploadedAt:desc`.

### 1.7 Idempotency
- `POST /uploads` and `POST /assets` accept an `Idempotency-Key` header. Same key + same body within 24h returns the original response.

---

## 2. Asset model

The single resource type is `Asset`. The frontend's TypeScript shape is:

```ts
interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document' | 'audio';
  format: string;          // uppercase extension: "PNG", "JPG", "MP4", "PDF"
  size: number;             // bytes
  uploadedAt: string;      // ISO 8601
  uploadedBy: string;       // user identifier
  tags: string[];
  favorite: boolean;
  deletedAt: string | null; // null = active; non-null = trashed at this time
  width?: number;           // image / video
  height?: number;          // image / video
  duration?: number;        // video / audio, seconds
  thumbnailUrl?: string;    // replaces frontend's previewDataUrl (base64)
}
```

**Renamed field:** the frontend's `previewDataUrl` (a base64-encoded JPEG) becomes `thumbnailUrl` (a regular HTTPS URL pointing to a thumbnail). The frontend will read `thumbnailUrl` first and fall back to a client-side canvas thumbnail only when the asset was uploaded in this session.

### 2.1 Type validation
- `type` must be one of the four enum values. `format` is normalized server-side to uppercase.
- `tags` array elements are non-empty strings, max 64 chars each, max 32 tags per asset.
- `name` is the display name; allowed characters are unrestricted but length is capped at 256.

---

## 3. Asset endpoints

### 3.1 List assets
`GET /api/v1/assets`

Returns the active (non-trashed) asset list by default. To view trashed assets, set `selection=smart&smart=trash`.

**Query parameters** (all optional):

| Param | Type | Notes |
|-------|------|-------|
| `q` | string | Case-insensitive substring on `name`, `format`, `uploadedBy`, `tags`. |
| `type` | string | One of `image`, `video`, `document`, `audio`. Repeatable: `?type=image&type=video`. |
| `format` | string | Uppercase extension. Repeatable. |
| `tag` | string | Repeatable. An asset matches if it has **all** listed tags. |
| `uploader` | string | Repeatable. |
| `sizeBucket` | enum | `small` (<1MB), `medium` (<10MB), `large` (≥10MB). |
| `dateBucket` | enum | `7d`, `30d`, `90d`, `all` (default). |
| `favorite` | bool | `true` to filter to favorites. |
| `selection` | enum | `all` (default), `type`, `tag`, `smart`. |
| `smart` | enum | When `selection=smart`: `recent`, `favorites`, `trash`. |
| `sort` | string | See §1.6. |
| `page`, `pageSize` | int | See §1.4. |

`recent` is "uploaded in the last 7 days, ordered by `uploadedAt:desc`".

**Response 200:**
```json
{
  "items": [ /* Asset[] */ ],
  "pagination": { "page": 1, "pageSize": 50, "total": 137, "totalPages": 3 }
}
```

### 3.2 Get one asset
`GET /api/v1/assets/:id`

**Response 200:** the `Asset` object.
**Response 404:** `{ "error": { "code": "ASSET_NOT_FOUND" } }`.

### 3.3 Update asset metadata
`PATCH /api/v1/assets/:id`

Used for rename, toggle favorite, add/remove tags, edit any mutable field.

**Request body** (any subset):
```json
{
  "name": "new-name.png",
  "favorite": true,
  "tags": ["product", "2026"]
}
```

For tag edits specifically, prefer the dedicated endpoints in §6 to avoid race conditions on concurrent tag mutations.

**Response 200:** the updated `Asset`.

### 3.4 Trash an asset (soft delete)
`POST /api/v1/assets/:id/trash`

Sets `deletedAt` to the current UTC time.

**Response 200:** the updated `Asset` (with `deletedAt` populated).
**Response 409:** if the asset is already in trash. Use `POST /assets/:id/restore` first.

### 3.5 Restore from trash
`POST /api/v1/assets/:id/restore`

Sets `deletedAt` back to `null`.

**Response 200:** the updated `Asset`.
**Response 409:** if the asset is not in trash.

### 3.6 Permanent delete
`DELETE /api/v1/assets/:id/:permanent` — *or* `DELETE /api/v1/assets/:id?permanent=true` (backend may pick; the frontend will use the path variant for clarity)

Actually — for unambiguous semantics, this contract uses a dedicated **path segment** to disambiguate from the soft delete:

> **Decision:** use a different verb on the same path. See §3.7.

### 3.7 Hard delete (replace with §3.6 final form)

> **Final form:** `DELETE /api/v1/assets/:id?permanent=true` is the **only** delete verb.
> - With `permanent=true` (or absent) → hard delete.
> - To soft-delete, use `POST /assets/:id/trash` (§3.4).
> - This avoids the dual-meaning DELETE.

**`DELETE /api/v1/assets/:id?permanent=true`**
**Response 204:** no body.
**Response 404:** if not found.
**Response 409:** if `permanent=false` and the asset is referenced elsewhere (reserved for future use).

### 3.8 Empty trash
`POST /api/v1/assets/empty-trash`

Permanently deletes all assets where `deletedAt != null`.

**Response 200:**
```json
{ "deleted": 12 }
```

---

## 4. File access

### 4.1 Download original
`GET /api/v1/assets/:id/file`

Streams the original file with the correct `Content-Type` and `Content-Disposition: attachment; filename="<original-name>"`.

### 4.2 Thumbnail
`GET /api/v1/assets/:id/thumbnail`

Returns a server-generated thumbnail (target 200px on the long edge, JPEG quality 0.7, same as the current frontend canvas implementation). 404 if the asset has no thumb-worthy preview (e.g., pure audio).

The frontend's `parseFile` today generates thumbnails **synchronously** during upload for images only. The backend should:
1. Accept the upload synchronously and return the `Asset` with `thumbnailUrl: null`.
2. Asynchronously generate the thumbnail and patch the asset when ready.
3. Frontend polls or uses a `?wait=thumbnail` query param on `GET /assets/:id` to wait for thumbnail readiness (cap at 5s, then return without).

> Open question: do we want WebSocket push for thumbnail-ready events, or poll? Poll is simpler for v1.

---

## 5. Uploads

### 5.1 Simple upload (multipart)
`POST /api/v1/uploads`

`Content-Type: multipart/form-data`. Form fields:
- `file` (binary, required)
- `tags` (optional, repeatable)
- `name` (optional, defaults to the original filename)

The server reads the file, infers `type`/`format`/`size`/`width`/`height`/`duration`, and returns the new `Asset` (with `thumbnailUrl: null` for images — see §4.2).

**Response 201:** the new `Asset`.
**Response 413:** file too large (cap at 100MB for v1, configurable).
**Response 415:** unsupported MIME type.

### 5.2 Presigned upload (recommended for production)
For large files or object storage backends, two-step:
1. `POST /api/v1/uploads/sign` — request a presigned URL.
   **Request body:**
   ```json
   { "name": "video.mp4", "size": 12345678, "contentType": "video/mp4" }
   ```
   **Response 200:**
   ```json
   {
     "uploadUrl": "https://s3.example.com/...",
     "method": "PUT",
     "headers": { "Content-Type": "video/mp4" },
     "assetDraftId": "uuid"
   }
   ```
2. Client `PUT`s the file to `uploadUrl`.
3. Client `POST /api/v1/assets` with `{ "assetDraftId": "..." }` to finalize and trigger thumbnail generation.

**Response 201** on the finalize POST: the new `Asset`.

---

## 6. Tags

### 6.1 Add a tag
`POST /api/v1/assets/:id/tags`
**Request body:** `{ "tag": "product" }`
**Response 200:** the updated `Asset`.
**Response 409:** tag already present (idempotent — backend may also choose 200).

### 6.2 Remove a tag
`DELETE /api/v1/assets/:id/tags/:tag`
**Response 200:** the updated `Asset`.
**Response 404:** if the asset doesn't have that tag (idempotent — backend may also choose 200).

### 6.3 List all tags
`GET /api/v1/tags`

Returns all distinct tags with usage counts, for the sidebar.

**Response 200:**
```json
{
  "items": [
    { "tag": "product", "count": 12 },
    { "tag": "2026",    "count": 8 }
  ]
}
```

`?q=` filter applies a case-insensitive substring match on `tag`.

---

## 7. Facets (optional, v1+)

`GET /api/v1/facets`

Returns counts grouped by `type`, `format`, `uploader`, `sizeBucket`, `dateBucket`, `tag`. Used by the filter panel to show "X assets match" badges.

**Response 200:**
```json
{
  "type":      { "image": 47, "video": 3, "document": 8, "audio": 1 },
  "format":    { "PNG": 30, "JPG": 17, "PDF": 8 },
  "uploader":  { "alice": 20, "bob": 14 },
  "sizeBucket":{ "small": 30, "medium": 20, "large": 9 },
  "dateBucket":{ "7d": 5, "30d": 12, "90d": 20, "all": 22 },
  "tag":       { "product": 12, "2026": 8 }
}
```

These are the **unfiltered** counts — the frontend computes its own "X active filters" badge by diffing. If the response becomes too large, paginate by facet dimension.

---

## 8. Standard error codes

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `BAD_REQUEST` | Malformed body or invalid query. |
| 401 | `UNAUTHENTICATED` | Missing or invalid token. |
| 403 | `FORBIDDEN` | Authenticated but lacks permission. |
| 404 | `ASSET_NOT_FOUND` / `TAG_NOT_FOUND` | Resource not found. |
| 409 | `ALREADY_TRASHED` / `NOT_TRASHED` / `TAG_EXISTS` | State conflict. |
| 413 | `PAYLOAD_TOO_LARGE` | Upload exceeds size cap. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | MIME not in the allow-list. |
| 422 | `VALIDATION_FAILED` | Field-level validation errors; `details.fields` lists them. |
| 429 | `RATE_LIMITED` | `Retry-After` header included. |
| 5xx | `INTERNAL_ERROR` | Catch-all; never leak stack traces. |

---

## 9. Mapping to frontend actions

This table is the bridge for the frontend migration. Every entry is the action in `src/state/actions.ts` and the endpoint it should hit.

| Frontend action | Endpoint |
|-----------------|----------|
| `SET_SELECTION` + filters + search | `GET /api/v1/assets` |
| `SELECT_ASSET` | `GET /api/v1/assets/:id` |
| `ADD_ASSET` (upload) | `POST /api/v1/uploads` (or sign+PUT) |
| `UPDATE_ASSET` (rename) | `PATCH /api/v1/assets/:id` `{ "name" }` |
| `TOGGLE_FAVORITE` | `PATCH /api/v1/assets/:id` `{ "favorite" }` |
| `ADD_TAG` | `POST /api/v1/assets/:id/tags` |
| `REMOVE_TAG` | `DELETE /api/v1/assets/:id/tags/:tag` |
| `DELETE_ASSET` (trash) | `POST /api/v1/assets/:id/trash` |
| `RESTORE_ASSET` | `POST /api/v1/assets/:id/restore` |
| `PERMANENT_DELETE` | `DELETE /api/v1/assets/:id?permanent=true` |
| `EMPTY_TRASH` | `POST /api/v1/assets/empty-trash` |
| `downloadAsset` | `GET /api/v1/assets/:id/file` |
| Sidebar tag counts | `GET /api/v1/tags` |

---

## 10. Out of scope for v1

- Real authentication flow (the backend assumes a valid bearer; the frontend's `uploadedBy="我"` stays until auth lands).
- Versioning of assets (a new upload creates a new asset; no "v2 of this file" concept).
- Sharing / permissions per asset.
- Bulk operations beyond `empty-trash`.
- WebSocket push for thumbnail-ready (polling only in v1).
- Soft-delete auto-purge (no automatic hard-delete of trashed assets older than N days).

---

## 11. Stack decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Runtime | **Node 20 LTS** | Long-term support, native `fetch`, stable ESM. |
| HTTP framework | **Fastify 4** | Schema-first validation fits the contract's strict shapes; fastest perf in the Node ecosystem. |
| Database | **PostgreSQL 16** | GIN index on `TEXT[]` for tag filters; `tsvector` for full-text search on `q`; mature. |
| Query layer | **Drizzle ORM** | TypeScript-native, no codegen step, plays well with Fastify's JSON-schema approach (or use `@sinclair/typebox` for schemas — Drizzle covers the SQL side). |
| Validation | **`@sinclair/typebox`** + `ajv` (via `@fastify/type-provider-typebox`) | Type and runtime schema are the same source; types flow into the frontend later. |
| File storage | **Local FS** at `var/uploads/{yyyy}/{mm}/{uuid}.{ext}` for v1. S3 swap-in via the `StorageDriver` interface in §12.4. | Avoids AWS setup during dev; one-line swap for prod. |
| Thumbnail generation | **In-process** with `sharp` (image) + `fluent-ffmpeg` (video) + `music-metadata` (audio duration). Run in a Fastify `onResponse` hook with a `setImmediate` handoff so the upload response isn't blocked. | Simpler than a separate worker; scales fine to ~100 req/s on a single box. Move to BullMQ if it becomes a bottleneck. |
| Auth | **`@fastify/jwt`** with HS256. Stub `POST /auth/login` accepts `{ username }` (no password) and returns a JWT; production swaps in a real verifier. | Frontend hard-codes `uploadedBy: "我"` today, so a real IdP isn't blocking v1. |
| Rate limit | **`@fastify/rate-limit`** — 100 req/min per user on reads, 10 req/min on writes. 429 with `Retry-After`. | See §8. |
| Migrations | **`drizzle-kit`** + plain SQL files in `db/migrations/`. | Same tool generates types and migrations. |
| Logging | **Pino** (Fastify default) → JSON to stdout. | Fast; Fastify-native. |
| Tests | **Vitest** + **`@fastify/supertype`**'s `inject()` for HTTP. **testcontainers** for Postgres. | Matches frontend's existing test stack. |

### 11.1 Remaining open questions

1. **Soft-delete retention** — keep trashed assets forever, or auto-purge after 30/90 days? Default v1: keep forever; add a cron in v1.1.
2. **Search ranking** — for the `q` param, do we want relevance ordering (`ts_rank`) or just a filter? v1 ships with relevance ordering; the frontend currently sorts by `uploadedAt:desc` by default and the user can re-sort.
3. **Auth realm** — should the v1 stub login accept *any* username, or only allowlisted ones for the dev team? Default: any username, prefixed with `dev:` to make it obvious in logs.

---

## 12. Backend skeleton

### 12.1 Directory layout

```
backend/
  src/
    server.ts                    # Fastify bootstrap, plugin registration
    config.ts                    # env loader (DATABASE_URL, JWT_SECRET, UPLOAD_DIR, ...)
    db/
      client.ts                  # Drizzle client + pool
      schema.ts                  # Drizzle table defs (assets, users, ...)
      migrations/                # drizzle-kit output
    routes/
      assets.ts                  # /api/v1/assets/*
      uploads.ts                 # /api/v1/uploads/*
      tags.ts                    # /api/v1/tags + asset tag endpoints
      facets.ts                  # /api/v1/facets
      auth.ts                    # /api/v1/auth/login (stub)
    schemas/
      asset.ts                   # TypeBox schemas: Asset, AssetPatch, ...
      query.ts                   # TypeBox for list query params
    services/
      assets.ts                  # pure functions: listAssets(filters), getAsset, ...
      storage.ts                 # StorageDriver interface + LocalFsDriver
      thumbnails.ts              # generateThumbnail(asset) → string|null
      auth.ts                    # JWT sign/verify
    plugins/
      auth.ts                    # @fastify/jwt setup + `request.user` decorator
      rateLimit.ts               # @fastify/rate-limit config
      errorHandler.ts            # uniform error response shape (§1.5)
  db/
    migrations/                  # raw SQL migrations (drizzle-kit output)
    seed.ts                      # dev seed: 1 user + 8 mock assets
  test/
    helpers.ts                   # test app factory + DB reset
    assets.test.ts               # endpoint tests
    upload.test.ts               # multipart upload + thumbnail gen
  package.json
  tsconfig.json
  drizzle.config.ts
  .env.example
```

### 12.2 `package.json` (key deps)

```json
{
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -b",
    "start": "node dist/server.js",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "fastify": "^4.27",
    "@fastify/jwt": "^8.0",
    "@fastify/multipart": "^8.3",
    "@fastify/rate-limit": "^9.1",
    "@fastify/static": "^7.0",
    "@sinclair/typebox": "^0.32",
    "@fastify/type-provider-typebox": "^4.1",
    "drizzle-orm": "^0.31",
    "pg": "^8.11",
    "sharp": "^0.33",
    "fluent-ffmpeg": "^2.1",
    "music-metadata": "^7.14",
    "pino-pretty": "^11.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.22",
    "tsx": "^4.7",
    "vitest": "^1.6",
    "@types/node": "^20",
    "@types/pg": "^8.11",
    "testcontainers": "^10.4"
  }
}
```

### 12.3 `drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### 12.4 Storage interface

The backend talks to file storage through one interface so we can swap local FS for S3 without touching the routes.

```ts
// src/services/storage.ts
export interface StorageDriver {
  put(key: string, body: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;   // for thumbnailUrl: returns /api/v1/files/... or https://...
}

export class LocalFsDriver implements StorageDriver { /* ... */ }
// export class S3Driver implements StorageDriver { /* later */ }
```

The key is the relative path under the storage root, e.g. `2026/06/abc-123.png`.

### 12.5 Route stub — `GET /api/v1/assets`

This is the only non-trivial route; the others are short. Showing it as the canonical example:

```ts
// src/routes/assets.ts
import { Type } from '@sinclair/typebox';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { listAssets } from '../services/assets.js';

const ListQuery = Type.Object({
  q:            Type.Optional(Type.String()),
  type:         Type.Optional(Type.Union([Type.Literal('image'), Type.Literal('video'), Type.Literal('document'), Type.Literal('audio')])),
  format:       Type.Optional(Type.String()),
  tag:          Type.Optional(Type.String()),
  uploader:     Type.Optional(Type.String()),
  sizeBucket:   Type.Optional(Type.Union([Type.Literal('small'), Type.Literal('medium'), Type.Literal('large')])),
  dateBucket:   Type.Optional(Type.Union([Type.Literal('7d'), Type.Literal('30d'), Type.Literal('90d'), Type.Literal('all')])),
  favorite:     Type.Optional(Type.Boolean()),
  selection:    Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('type'), Type.Literal('tag'), Type.Literal('smart')])),
  smart:        Type.Optional(Type.Union([Type.Literal('recent'), Type.Literal('favorites'), Type.Literal('trash')])),
  sort:         Type.Optional(Type.String()),
  page:         Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize:     Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
});

const Asset = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  type: Type.Union([Type.Literal('image'), Type.Literal('video'), Type.Literal('document'), Type.Literal('audio')]),
  format: Type.String(),
  size: Type.Integer(),
  uploadedAt: Type.String({ format: 'date-time' }),
  uploadedBy: Type.String(),
  tags: Type.Array(Type.String()),
  favorite: Type.Boolean(),
  deletedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  width: Type.Optional(Type.Integer()),
  height: Type.Optional(Type.Integer()),
  duration: Type.Optional(Type.Number()),
  thumbnailUrl: Type.Optional(Type.String()),
});

const ListResponse = Type.Object({
  items: Type.Array(Asset),
  pagination: Type.Object({
    page: Type.Integer(),
    pageSize: Type.Integer(),
    total: Type.Integer(),
    totalPages: Type.Integer(),
  }),
});

export const assetsRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get('/assets', {
    schema: { querystring: ListQuery, response: { 200: ListResponse } },
    // preHandler: app.authenticate,  // JWT required
  }, async (req) => {
    return listAssets(req.query);
  });

  // ... GET /:id, PATCH /:id, POST /:id/trash, POST /:id/restore, ...
};
```

The shape of `Asset` here is the **API contract** — duplicated intentionally on the backend because OpenAPI/TypeBox can't `import` from the frontend's TS types. The contract doc (this file) is the authoritative reference; the TS types on both sides must conform to it.

---

## 13. Database schema

This is the first migration. Generated by `drizzle-kit generate`, hand-edited for readability.

```sql
-- db/migrations/0000_init.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TYPE asset_type AS ENUM ('image', 'video', 'document', 'audio');

CREATE TABLE assets (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(256) NOT NULL,
  type          asset_type   NOT NULL,
  format        VARCHAR(8)   NOT NULL,                 -- uppercase ext
  size          BIGINT       NOT NULL CHECK (size >= 0),
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  uploaded_by   VARCHAR(64)  NOT NULL,                 -- FK to users.id (added in next migration)
  tags          TEXT[]       NOT NULL DEFAULT '{}',
  favorite      BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ  NULL,
  width         INT          NULL,
  height        INT          NULL,
  duration      REAL         NULL,
  thumbnail_url TEXT         NULL,
  storage_key   TEXT         NOT NULL,                 -- e.g. '2026/06/abc.png'
  storage_driver TEXT        NOT NULL DEFAULT 'local' -- for future S3 swap
);

-- Default sort: most recent first
CREATE INDEX assets_uploaded_at_desc
  ON assets (uploaded_at DESC);

-- "Active" predicate (deleted_at IS NULL) is hit on every list query
CREATE INDEX assets_active_uploaded_at_desc
  ON assets (uploaded_at DESC)
  WHERE deleted_at IS NULL;

-- Tag filter (?tag=product&tag=2026 → has all)
CREATE INDEX assets_tags_gin
  ON assets USING GIN (tags);

-- Uploader filter
CREATE INDEX assets_uploaded_by
  ON assets (uploaded_by)
  WHERE deleted_at IS NULL;

-- Favorites
CREATE INDEX assets_favorite
  ON assets (uploaded_by, uploaded_at DESC)
  WHERE favorite = TRUE AND deleted_at IS NULL;

-- Full-text search for ?q=
ALTER TABLE assets ADD COLUMN search_tsv TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(tags, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(format, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(uploaded_by, '')), 'C')
  ) STORED;

CREATE INDEX assets_search_gin
  ON assets USING GIN (search_tsv);

-- Users table (stub for v1; real auth comes later)
CREATE TABLE users (
  id            VARCHAR(64) PRIMARY KEY,               -- e.g. 'dev:alice'
  display_name  VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 13.1 Filter → SQL mapping

For the implementer's reference. Each combination in `GET /api/v1/assets` translates to a `WHERE` clause:

| Query | SQL |
|-------|-----|
| `?q=hero` | `search_tsv @@ plainto_tsquery('simple', $1)` (and `ORDER BY ts_rank(search_tsv, ...) DESC` if `sort` not set) |
| `?type=image` | `type = $1` |
| `?format=PNG,JPG` | `format = ANY($1)` (Drizzle `inArray`) |
| `?tag=product&tag=2026` | `tags @> ARRAY['product','2026']` |
| `?uploader=alice` | `uploaded_by = $1` |
| `?sizeBucket=small` | `size < 1024*1024` / `size < 10*1024*1024` / `size >= 10*1024*1024` |
| `?dateBucket=7d` | `uploaded_at > NOW() - INTERVAL '7 days'` |
| `?favorite=true` | `favorite = TRUE` |
| `?selection=smart&smart=trash` | `deleted_at IS NOT NULL` (overrides default active filter) |
| `?selection=smart&smart=recent` | `uploaded_at > NOW() - INTERVAL '7 days' AND deleted_at IS NULL` |
| (default) | `deleted_at IS NULL` |

Default sort is `uploaded_at DESC`; the `?q=` path overrides this with `ts_rank DESC` then `uploaded_at DESC` as a tiebreaker.

---

## 14. Frontend integration checklist (for when both sides exist)

1. Generate API types: `npx openapi-typescript http://localhost:3000/api/v1/openapi.json -o src/api/types.ts`.
2. Replace `src/utils/uploadParser.ts` (currently does client-side thumbnail gen for images) with a server-side-only flow. The frontend stops reading `File` as image metadata and just hands the blob to the upload endpoint.
3. Replace `loadState()` in `src/state/persistence.ts` (currently reads from localStorage) with a hydration call: `GET /api/v1/assets?pageSize=200` on app start, cached in memory, with an in-flight refresh after every mutation.
4. Add a thin `src/api/client.ts` wrapping `fetch` with the bearer token, the error unwrap (§1.5), and the `Idempotency-Key` header for uploads.
5. Add polling for `?wait=thumbnail` on freshly uploaded images, with a 5s cap; fall back to the client-side canvas thumbnail if the server hasn't produced one yet (preserves the current behavior for slow thumbnails).
