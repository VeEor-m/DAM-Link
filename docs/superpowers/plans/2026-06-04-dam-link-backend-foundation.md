# DAM-Link Backend — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty-but-runnable backend skeleton: pnpm monorepo, `contracts` package, `api` package with Fastify + `/healthz`, full Drizzle schema for all tables, initial migration, docker-compose for dev and test, Vitest wired to real Postgres + MinIO.

**Architecture:** Three-package pnpm workspace at `D:\DAM-Link-Backend\`. `contracts` holds the Zod schemas that drive validation, the OpenAPI spec, and the shared types. `api` is a single Fastify process that serves `/api/v1/*` plus `/healthz`, `/version`, and `/docs`. `web` is created as a stub in this plan (it will hold the existing React app, moved in Plan 8). Postgres runs in Docker for dev and test; MinIO (S3-compatible) runs alongside it. Drizzle ORM is SQL-first, schema lives in `packages/api/src/db/schema.ts`.

**Tech Stack:** Node 22, pnpm 9, TypeScript 5.6 (strict), Fastify 5, Zod 3, Drizzle ORM 0.36 + drizzle-kit, postgres-js, Vitest 2, Docker + docker compose.

---

## Plan 1 of 9 — Foundation

This plan covers everything up to "I can run the API, it says /healthz is OK, the database has all the tables, and I can write integration tests." Subsequent plans add routes and features on top.

**In this plan:**
- Monorepo layout (pnpm workspace, three packages)
- `packages/contracts` with `common.ts` (Pagination, Error, Id, Role, AssetType, Visibility, AssetStatus)
- `packages/api` skeleton: Fastify boot, config (Zod-validated env), Pino logger, CORS, Helmet, error handler, Sentry stub, Swagger UI
- `docker-compose.yml` (dev: postgres + minio + mailhog) and `docker-compose.test.yml` (test: postgres + minio on different ports)
- Drizzle schema for **all** tables in one migration: `users`, `sessions`, `orgs`, `memberships`, `assets`, `share_links`
- Initial migration generated and applied
- `pg_trgm` extension enabled (needed by Plan 4 search)
- Vitest 2 with `globalSetup` that brings up `docker-compose.test.yml`, applies migrations, returns handles
- Test helpers: `buildApp()`, `truncateAllTables()`, `flushMinio()`
- One passing integration test: `GET /healthz` returns 200 with `{ status: 'ok', db: 'ok', s3: 'ok' }`
- `.env.example`, `README.md` with quickstart

**Deferred to later plans:**
- Auth routes (Plan 2)
- Orgs + memberships routes (Plan 3)
- Asset CRUD + smart collections + search/filter (Plan 4)
- Upload flow + presigned URLs (Plan 5)
- Thumbnail generation (Plan 6)
- Share links (Plan 7)
- Import endpoint (Plan 8)
- Frontend integration (Plan 8)
- Deployment, CI/CD, rate limiting, Turnstile (Plan 9)

---

## File structure (this plan)

```
D:\DAM-Link-Backend\
├── .gitignore
├── .env.example
├── .nvmrc
├── README.md
├── package.json                        # workspace root
├── pnpm-workspace.yaml
├── docker-compose.yml                  # dev services
├── docker-compose.test.yml             # test services (different ports)
├── vitest.workspace.ts                 # shared vitest config
├── docs/
│   └── superpowers/
│       └── plans/
│           └── 2026-06-04-dam-link-backend-foundation.md
└── packages/
    ├── contracts/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                # re-exports
    │       └── common.ts               # Pagination, Error, Id, enums
    └── api/
        ├── package.json
        ├── tsconfig.json
        ├── drizzle.config.ts
        ├── Dockerfile                  # created in Plan 9, stub here
        ├── .env.example
        ├── src/
        │   ├── server.ts               # Fastify boot
        │   ├── config.ts               # Zod-validated env
        │   ├── plugins/
        │   │   ├── cors.ts
        │   │   ├── helmet.ts
        │   │   ├── error-handler.ts
        │   │   ├── request-id.ts
        │   │   ├── sentry.ts           # no-op in dev, real in prod
        │   │   ├── swagger.ts          # OpenAPI 3.1 + Swagger UI
        │   │   └── health.ts           # /healthz + /version
        │   ├── db/
        │   │   ├── client.ts           # postgres-js + drizzle
        │   │   ├── schema.ts           # all tables
        │   │   └── repositories/
        │   │       └── health.repo.ts  # pings DB
        │   ├── lib/
        │   │   ├── s3.ts               # S3Client + presign helpers
        │   │   ├── logger.ts           # Pino
        │   │   └── ids.ts              # crypto.randomUUID
        │   └── types.ts                # Fastify type augmentation
        ├── drizzle/
        │   └── 0000_initial.sql        # generated, committed
        ├── tests/
        │   ├── setup.ts                # globalSetup, beforeEach helpers
        │   ├── helpers/
        │   │   ├── build-app.ts
        │   │   ├── db.ts               # truncateAllTables
        │   │   ├── s3.ts               # flushMinio
        │   │   └── env.ts              # test env vars
        │   └── health.test.ts
        └── vitest.config.ts
```

---

## Task 1: Monorepo bootstrap

**Files:**
- Create: `D:\DAM-Link-Backend\package.json`
- Create: `D:\DAM-Link-Backend\pnpm-workspace.yaml`
- Create: `D:\DAM-Link-Backend\.nvmrc`
- Create: `D:\DAM-Link-Backend\.gitignore`
- Create: `D:\DAM-Link-Backend\.env.example`
- Create: `D:\DAM-Link-Backend\README.md`

- [ ] **Step 1.1: Verify pnpm is installed**

Run: `pnpm --version`
Expected: `9.x.x` or higher. If not, install with `npm i -g pnpm`.

- [ ] **Step 1.2: Initialize the monorepo root `package.json`**

Write `D:\DAM-Link-Backend\package.json`:
```json
{
  "name": "dam-link-backend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "pnpm --filter @dam-link/api dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "db:generate": "pnpm --filter @dam-link/api db:generate",
    "db:migrate": "pnpm --filter @dam-link/api db:migrate",
    "db:studio": "pnpm --filter @dam-link/api db:studio",
    "services:up": "docker compose -f docker-compose.yml up -d",
    "services:down": "docker compose -f docker-compose.yml down",
    "services:logs": "docker compose -f docker-compose.yml logs -f",
    "test:services:up": "docker compose -f docker-compose.test.yml up -d",
    "test:services:down": "docker compose -f docker-compose.test.yml down -v"
  },
  "devDependencies": {
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 1.3: Write `pnpm-workspace.yaml`**

Write `D:\DAM-Link-Backend\pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 1.4: Write `.nvmrc` pinning Node 22**

Write `D:\DAM-Link-Backend\.nvmrc`:
```
22
```

- [ ] **Step 1.5: Write `.gitignore`**

Write `D:\DAM-Link-Backend\.gitignore`:
```
node_modules/
dist/
.turbo/
*.log
.env
.env.local
.env.*.local
coverage/
.vitest-cache/
.DS_Store
Thumbs.db
.idea/
.vscode/
!.vscode/settings.json

# build artifacts
packages/*/dist/
packages/*/.tsbuildinfo

# drizzle
packages/api/drizzle/meta/_journal.json.bak

# local data
.docker-data/
```

- [ ] **Step 1.6: Write the root `.env.example`**

Write `D:\DAM-Link-Backend\.env.example`:
```bash
# Copy to .env for local dev. Never commit .env.

# Runtime
NODE_ENV=development
LOG_LEVEL=debug
WEB_ORIGIN=http://localhost:5173

# API
API_HOST=0.0.0.0
API_PORT=3000
API_PUBLIC_URL=http://localhost:3000

# Database
DATABASE_URL=postgres://dam:dam@localhost:5432/dam_link

# S3 (MinIO in dev)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=dam
S3_SECRET_KEY=dams3cret
S3_BUCKET=dam-link-dev
S3_FORCE_PATH_STYLE=true

# Sessions
SESSION_COOKIE_NAME=dam_session
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECRET=change-me-32-bytes-of-random-data

# Sentry (optional in dev)
SENTRY_DSN=

# Turnstile (Plan 9)
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

- [ ] **Step 1.7: Write the root `README.md`**

Write `D:\DAM-Link-Backend\README.md`:
```markdown
# DAM-Link Backend

Multi-tenant Digital Asset Management backend. Fastify + PostgreSQL + S3-compatible storage.

## Quickstart

Requires Node 22+, pnpm 9+, Docker.

```bash
# 1. Install
pnpm install

# 2. Copy env files
cp .env.example .env
cp packages/api/.env.example packages/api/.env

# 3. Start dev services (Postgres, MinIO, Mailhog)
pnpm services:up

# 4. Run database migrations
pnpm db:migrate

# 5. Start the API in dev mode
pnpm dev
# → http://localhost:3000
# → http://localhost:3000/docs (Swagger UI)
# → http://localhost:3000/healthz

# 6. Run tests
pnpm test:services:up
pnpm test
```

## Layout

- `packages/contracts/` — Zod schemas + generated types (shared)
- `packages/api/` — Fastify server, Drizzle schema, services
- `packages/web/` — React frontend (added in Plan 8)

## Documentation

- API surface: `http://localhost:3000/docs`
- OpenAPI spec: `http://localhost:3000/openapi.json`
- Implementation plans: `docs/superpowers/plans/`
```

- [ ] **Step 1.8: Install root dependencies and commit**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm install
git init
git add .
git commit -m "chore: bootstrap pnpm monorepo"
```

Expected: `pnpm install` succeeds, no `node_modules` errors, lockfile created.

- [ ] **Step 1.9: Verify workspace commands work**

Run: `pnpm -r typecheck`
Expected: exits 0 (no packages to typecheck yet, should report nothing to do).

---

## Task 2: Contracts package with common schemas

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/common.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/common.test.ts`
- Create: `packages/contracts/vitest.config.ts`

- [ ] **Step 2.1: Write `packages/contracts/package.json`**

```json
{
  "name": "@dam-link/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "vitest": "2.1.4",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2.2: Write `packages/contracts/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 2.3: Write `packages/contracts/src/common.ts`**

```ts
import { z } from 'zod';

/** UUID v4 string. */
export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;

/** ISO 8601 datetime string. */
export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Coarse asset classification. */
export const AssetTypeSchema = z.enum(['image', 'video', 'document', 'audio']);
export type AssetType = z.infer<typeof AssetTypeSchema>;

/** RBAC role within an org. */
export const RoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type Role = z.infer<typeof RoleSchema>;

/** Asset visibility scope. */
export const VisibilitySchema = z.enum(['private', 'org', 'link']);
export type Visibility = z.infer<typeof VisibilitySchema>;

/** Upload lifecycle state. */
export const AssetStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatusSchema>;

/** Cursor-based pagination input. */
export const PaginationInputSchema = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type PaginationInput = z.infer<typeof PaginationInputSchema>;

/** Cursor-based pagination output. */
export const PageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

/** Standard error envelope returned by every error response. */
export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** Standard success wrapper for single-item responses. */
export const OkSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: item });

/** Size bucket filter (matches frontend). */
export const SizeBucketSchema = z.enum(['small', 'medium', 'large']);
export type SizeBucket = z.infer<typeof SizeBucketSchema>;

/** Date bucket filter. */
export const DateBucketSchema = z.enum(['7d', '30d', '90d', 'all']);
export type DateBucket = z.infer<typeof DateBucketSchema>;

/** View mode for the browser pane. */
export const ViewModeSchema = z.enum(['grid', 'list']);
export type ViewMode = z.infer<typeof ViewModeSchema>;

/** Smart sidebar collections. */
export const SmartCollectionSchema = z.enum(['recent', 'favorites', 'trash']);
export type SmartCollection = z.infer<typeof SmartCollectionSchema>;

/** Sidebar selection tagged union (mirrors frontend). */
export const SidebarSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('type'), type: AssetTypeSchema }),
  z.object({ kind: z.literal('tag'), tag: z.string().min(1) }),
  z.object({ kind: z.literal('smart'), smart: SmartCollectionSchema }),
]);
export type SidebarSelection = z.infer<typeof SidebarSelectionSchema>;
```

- [ ] **Step 2.4: Write `packages/contracts/src/index.ts`**

```ts
export * from './common.js';
```

- [ ] **Step 2.5: Write `packages/contracts/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 2.6: Write the first contracts test**

Write `packages/contracts/tests/common.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  IdSchema,
  RoleSchema,
  AssetTypeSchema,
  VisibilitySchema,
  PageSchema,
  ErrorBodySchema,
  SidebarSelectionSchema,
  PaginationInputSchema,
} from '../src/common.js';

describe('IdSchema', () => {
  it('accepts a uuid', () => {
    expect(IdSchema.parse('11111111-1111-4111-8111-111111111111')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('rejects non-uuid', () => {
    expect(() => IdSchema.parse('not-a-uuid')).toThrow();
  });
});

describe('RoleSchema', () => {
  it('accepts the three roles', () => {
    expect(RoleSchema.parse('owner')).toBe('owner');
    expect(RoleSchema.parse('editor')).toBe('editor');
    expect(RoleSchema.parse('viewer')).toBe('viewer');
  });

  it('rejects unknown roles', () => {
    expect(() => RoleSchema.parse('admin')).toThrow();
  });
});

describe('AssetTypeSchema', () => {
  it.each(['image', 'video', 'document', 'audio'] as const)('accepts %s', (v) => {
    expect(AssetTypeSchema.parse(v)).toBe(v);
  });
});

describe('VisibilitySchema', () => {
  it('accepts the three visibilities', () => {
    expect(VisibilitySchema.parse('private')).toBe('private');
    expect(VisibilitySchema.parse('org')).toBe('org');
    expect(VisibilitySchema.parse('link')).toBe('link');
  });
});

describe('PageSchema', () => {
  const StringPage = PageSchema(IdSchema);
  it('parses an empty page', () => {
    const parsed = StringPage.parse({ items: [], nextCursor: null });
    expect(parsed.items).toEqual([]);
    expect(parsed.nextCursor).toBeNull();
  });

  it('parses a page with items', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const parsed = StringPage.parse({ items: [id], nextCursor: 'abc' });
    expect(parsed.items).toEqual([id]);
    expect(parsed.nextCursor).toBe('abc');
  });
});

describe('ErrorBodySchema', () => {
  it('parses a standard error body', () => {
    const body = {
      error: { code: 'NOT_FOUND', message: 'Asset not found' },
    };
    expect(ErrorBodySchema.parse(body)).toEqual(body);
  });

  it('accepts details', () => {
    const body = {
      error: { code: 'VALIDATION', message: 'bad', details: { field: 'name' } },
    };
    expect(ErrorBodySchema.parse(body).error.details).toEqual({ field: 'name' });
  });
});

describe('SidebarSelectionSchema', () => {
  it('parses kind=all', () => {
    expect(SidebarSelectionSchema.parse({ kind: 'all' })).toEqual({
      kind: 'all',
    });
  });

  it('parses kind=type', () => {
    expect(SidebarSelectionSchema.parse({ kind: 'type', type: 'image' })).toEqual({
      kind: 'type',
      type: 'image',
    });
  });

  it('rejects kind=type with invalid type', () => {
    expect(() =>
      SidebarSelectionSchema.parse({ kind: 'type', type: 'spreadsheet' }),
    ).toThrow();
  });

  it('parses kind=smart', () => {
    expect(
      SidebarSelectionSchema.parse({ kind: 'smart', smart: 'favorites' }),
    ).toEqual({ kind: 'smart', smart: 'favorites' });
  });
});

describe('PaginationInputSchema', () => {
  it('defaults limit to 50', () => {
    const parsed = PaginationInputSchema.parse({});
    expect(parsed.limit).toBe(50);
  });

  it('clamps limit to 200', () => {
    expect(() => PaginationInputSchema.parse({ limit: 1000 })).toThrow();
  });
});
```

- [ ] **Step 2.7: Install and run the test**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm install
pnpm --filter @dam-link/contracts test
```

Expected: 8+ tests pass.

- [ ] **Step 2.8: Typecheck**

Run: `pnpm --filter @dam-link/contracts typecheck`
Expected: exits 0.

- [ ] **Step 2.9: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add common schemas (id, role, asset, pagination, error, sidebar)"
```

---

## Task 3: Docker Compose for dev (Postgres + MinIO + Mailhog)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 3.1: Write `docker-compose.yml`**

```yaml
name: dam-link-dev

services:
  postgres:
    image: postgres:16-alpine
    container_name: dam-link-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: dam
      POSTGRES_PASSWORD: dam
      POSTGRES_DB: dam_link
    ports:
      - "5432:5432"
    volumes:
      - dam-postgres-data:/var/lib/postgresql/data
      - ./packages/api/drizzle/init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dam -d dam_link"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    container_name: dam-link-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: dam
      MINIO_ROOT_PASSWORD: dams3cret
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # web console
    volumes:
      - dam-minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio-bucket:
    image: minio/mc:latest
    container_name: dam-link-minio-bucket
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 dam dams3cret &&
      mc mb --ignore-existing local/dam-link-dev &&
      mc anonymous set download local/dam-link-dev &&
      echo 'Bucket dam-link-dev ready.'
      "

  mailhog:
    image: mailhog/mailhog:latest
    container_name: dam-link-mailhog
    restart: unless-stopped
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # web UI

volumes:
  dam-postgres-data:
  dam-minio-data:
```

- [ ] **Step 3.2: Create the Postgres init SQL (creates extension)**

Write `packages/api/drizzle/init.sql`:
```sql
-- Runs once on first container start. Creates extensions and roles.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 3.3: Bring the dev services up**

Run: `pnpm services:up`
Expected: 3 services running. Postgres on :5432, MinIO on :9000/:9001, Mailhog on :8025.

- [ ] **Step 3.4: Verify Postgres is up**

Run:
```bash
docker exec dam-link-postgres psql -U dam -d dam_link -c "SELECT extname FROM pg_extension;"
```

Expected output includes `uuid-ossp` and `pg_trgm`.

- [ ] **Step 3.5: Verify MinIO is up**

Open in browser: `http://localhost:9001` (login: `dam` / `dams3cret`).
Expected: dashboard loads, bucket `dam-link-dev` exists.

- [ ] **Step 3.6: Commit**

```bash
git add docker-compose.yml packages/api/drizzle/init.sql
git commit -m "chore: add docker-compose for dev (postgres+minio+mailhog)"
```

---

## Task 4: Docker Compose for test (different ports)

**Files:**
- Create: `docker-compose.test.yml`

- [ ] **Step 4.1: Write `docker-compose.test.yml`**

```yaml
name: dam-link-test

# Runs alongside docker-compose.yml — uses different ports so both can be up.

services:
  postgres:
    image: postgres:16-alpine
    container_name: dam-link-postgres-test
    environment:
      POSTGRES_USER: dam
      POSTGRES_PASSWORD: dam
      POSTGRES_DB: dam_link_test
    ports:
      - "5433:5432"
    tmpfs:
      - /var/lib/postgresql/data
    volumes:
      - ./packages/api/drizzle/init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dam -d dam_link_test"]
      interval: 2s
      timeout: 2s
      retries: 30

  minio:
    image: minio/minio:latest
    container_name: dam-link-minio-test
    command: server /data --console-address ":9002"
    environment:
      MINIO_ROOT_USER: dam
      MINIO_ROOT_PASSWORD: dams3cret
    ports:
      - "9003:9000"   # S3 API
      - "9002:9001"   # web console
    tmpfs:
      - /data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 2s
      timeout: 2s
      retries: 30

  minio-bucket:
    image: minio/mc:latest
    container_name: dam-link-minio-bucket-test
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 dam dams3cret &&
      mc mb --ignore-existing local/dam-link-test &&
      mc anonymous set download local/dam-link-test &&
      echo 'Test bucket dam-link-test ready.'
      "
```

- [ ] **Step 4.2: Bring test services up**

Run: `pnpm test:services:up`
Expected: 3 services running on ports 5433, 9003, 9002.

- [ ] **Step 4.3: Verify test Postgres is up**

Run:
```bash
docker exec dam-link-postgres-test psql -U dam -d dam_link_test -c "SELECT 1;"
```

Expected: `1` row.

- [ ] **Step 4.4: Commit**

```bash
git add docker-compose.test.yml
git commit -m "chore: add docker-compose for test (ports 5433/9003)"
```

---

## Task 5: API package skeleton (package.json, tsconfig, server boot, config)

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/.env.example`
- Create: `packages/api/src/config.ts`
- Create: `packages/api/src/lib/logger.ts`
- Create: `packages/api/src/lib/ids.ts`
- Create: `packages/api/src/lib/s3.ts`
- Create: `packages/api/src/types.ts`
- Create: `packages/api/src/server.ts`

- [ ] **Step 5.1: Write `packages/api/package.json`**

```json
{
  "name": "@dam-link/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "3.668.0",
    "@aws-sdk/s3-request-presigner": "3.668.0",
    "@dam-link/contracts": "workspace:*",
    "@fastify/cors": "10.0.1",
    "@fastify/helmet": "12.0.1",
    "@fastify/sensible": "6.0.1",
    "@fastify/swagger": "9.2.0",
    "@fastify/swagger-ui": "5.1.0",
    "drizzle-orm": "0.36.1",
    "fastify": "5.1.0",
    "fastify-type-provider-zod": "4.0.1",
    "pino": "9.5.0",
    "postgres": "3.4.5",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "22.7.5",
    "drizzle-kit": "0.28.0",
    "pino-pretty": "11.3.0",
    "tsx": "4.19.1",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 5.2: Write `packages/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 5.3: Write `packages/api/.env.example`**

```bash
# Inherits everything from the root .env. Set these if running api in isolation.

NODE_ENV=development
LOG_LEVEL=debug
WEB_ORIGIN=http://localhost:5173

API_HOST=0.0.0.0
API_PORT=3000
API_PUBLIC_URL=http://localhost:3000

DATABASE_URL=postgres://dam:dam@localhost:5432/dam_link

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=dam
S3_SECRET_KEY=dams3cret
S3_BUCKET=dam-link-dev
S3_FORCE_PATH_STYLE=true

SESSION_COOKIE_NAME=dam_session
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECRET=change-me-32-bytes-of-random-data
```

- [ ] **Step 5.4: Write `packages/api/src/config.ts`**

```ts
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  SESSION_COOKIE_NAME: z.string().default('dam_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_COOKIE_SECRET: z.string().min(16),

  SENTRY_DSN: z.string().url().optional(),

  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

/** Test-only — clears the config cache so tests can re-load with new env. */
export function _resetConfigForTests(): void {
  cached = null;
}
```

- [ ] **Step 5.5: Write `packages/api/src/lib/logger.ts`**

```ts
import pino, { type LoggerOptions } from 'pino';
import { loadConfig } from '../config.js';

const config = loadConfig();

const options: LoggerOptions = {
  level: config.LOG_LEVEL,
  base: { service: 'dam-link-api' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.sessionToken',
    ],
    censor: '[REDACTED]',
  },
};

export const logger =
  config.NODE_ENV === 'development'
    ? pino(options, pino.transport({ target: 'pino-pretty', options: { colorize: true } }))
    : pino(options);
```

- [ ] **Step 5.6: Write `packages/api/src/lib/ids.ts`**

```ts
import { randomUUID, randomBytes } from 'node:crypto';

/** UUID v4 for row IDs. */
export const newId = (): string => randomUUID();

/** URL-safe base64 token, used for session IDs and share-link tokens. */
export const newToken = (bytes = 32): string =>
  randomBytes(bytes).toString('base64url');
```

- [ ] **Step 5.7: Write `packages/api/src/lib/s3.ts`**

```ts
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
```

- [ ] **Step 5.8: Write `packages/api/src/types.ts`**

```ts
// Augment FastifyRequest with our custom context. Populated by plugins later.
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by request-id plugin. */
    requestId: string;
  }
}
```

- [ ] **Step 5.9: Write `packages/api/src/server.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from './config.js';
import { logger } from './lib/logger.js';
import { registerRequestId } from './plugins/request-id.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerCors } from './plugins/cors.js';
import { registerHelmet } from './plugins/helmet.js';
import { registerSentry } from './plugins/sentry.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerHealth } from './plugins/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => crypto.randomUUID(),
    disableRequestLogging: false,
    trustProxy: true,
  });

  await registerRequestId(app);
  await registerSentry(app);
  await registerErrorHandler(app);
  await registerHelmet(app);
  await registerCors(app);
  await registerSwagger(app);
  await registerHealth(app);

  return app;
}

async function main() {
  const config = loadConfig();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.API_HOST, port: config.API_PORT });
  } catch (err) {
    app.log.error(err, 'failed to start');
    process.exit(1);
  }
}

// Run when invoked directly (not when imported by tests).
const isMainModule = import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`;
if (isMainModule) {
  void main();
}
```

- [ ] **Step 5.10: Install dependencies**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm install
```

Expected: installs all workspace deps without errors.

- [ ] **Step 5.11: Typecheck the api package (expect plugin errors — fix in next task)**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: FAIL — plugin files don't exist yet. This is the red step.

- [ ] **Step 5.12: Don't commit yet — Task 6 creates the plugins this depends on**

---

## Task 6: Plugins (request-id, error-handler, CORS, Helmet, Sentry stub, Swagger, health)

**Files:**
- Create: `packages/api/src/plugins/request-id.ts`
- Create: `packages/api/src/plugins/error-handler.ts`
- Create: `packages/api/src/plugins/cors.ts`
- Create: `packages/api/src/plugins/helmet.ts`
- Create: `packages/api/src/plugins/sentry.ts`
- Create: `packages/api/src/plugins/swagger.ts`
- Create: `packages/api/src/plugins/health.ts`

- [ ] **Step 6.1: Write `packages/api/src/plugins/request-id.ts`**

```ts
import type { FastifyInstance } from 'fastify';

export async function registerRequestId(app: FastifyInstance): Promise<void> {
  // genReqId is set in buildApp; this plugin only enriches the log context.
  app.addHook('onRequest', async (req) => {
    req.log = req.log.child({ requestId: req.id });
  });
}
```

- [ ] **Step 6.2: Write `packages/api/src/plugins/error-handler.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ErrorBodySchema } from '@dam-link/contracts';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      const body = ErrorBodySchema.parse({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply.status(err.statusCode).send(body);
    }

    if (err instanceof ZodError) {
      const body = ErrorBodySchema.parse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues,
        },
      });
      return reply.status(422).send(body);
    }

    if ((err as { statusCode?: number }).statusCode && (err as { statusCode?: number }).statusCode! < 500) {
      const status = (err as { statusCode: number }).statusCode;
      const body = ErrorBodySchema.parse({
        error: { code: err.code ?? 'CLIENT_ERROR', message: err.message },
      });
      return reply.status(status).send(body);
    }

    req.log.error({ err }, 'unhandled error');
    const body = ErrorBodySchema.parse({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((_req, reply) => {
    const body = ErrorBodySchema.parse({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
    return reply.status(404).send(body);
  });
}
```

- [ ] **Step 6.3: Write `packages/api/src/plugins/cors.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from '../config.js';

export async function registerCors(app: FastifyInstance): Promise<void> {
  const config = loadConfig();
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}
```

- [ ] **Step 6.4: Write `packages/api/src/plugins/helmet.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

export async function registerHelmet(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    // Swagger UI needs to load its own assets.
    contentSecurityPolicy: false,
  });
}
```

- [ ] **Step 6.5: Write `packages/api/src/plugins/sentry.ts` (no-op stub for MVP)**

```ts
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';

/**
 * Sentry is wired in Plan 9. For now this is a no-op plugin that
 * reserves the place and warns if SENTRY_DSN is set but unused.
 */
export async function registerSentry(_app: FastifyInstance): Promise<void> {
  const config = loadConfig();
  if (config.SENTRY_DSN && config.NODE_ENV === 'production') {
    _app.log.warn(
      { dsn: '[REDACTED]' },
      'SENTRY_DSN is set but Sentry is not yet wired up. See Plan 9.',
    );
  }
}
```

- [ ] **Step 6.6: Write `packages/api/src/plugins/swagger.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadConfig } from '../config.js';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  const config = loadConfig();

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'DAM-Link API',
        version: '0.0.0',
        description: 'Multi-tenant Digital Asset Management API',
      },
      servers: [{ url: config.API_PUBLIC_URL }],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: config.SESSION_COOKIE_NAME,
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.get('/openapi.json', async () => app.swagger());
}
```

- [ ] **Step 6.7: Write `packages/api/src/plugins/health.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pingS3 } from '../lib/s3.js';
import { pingDb } from '../db/client.js';

const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'down']),
  s3: z.enum(['ok', 'down']),
  version: z.string(),
  uptime: z.number(),
});

export async function registerHealth(app: FastifyInstance): Promise<void> {
  const start = Date.now();

  app.get(
    '/healthz',
    {
      schema: {
        response: { 200: HealthResponseSchema, 503: HealthResponseSchema },
        tags: ['ops'],
        summary: 'Liveness + readiness probe',
      },
    },
    async (_req, reply) => {
      const [dbOk, s3Ok] = await Promise.all([pingDb(), pingS3()]);
      const ok = dbOk && s3Ok;
      const body = {
        status: ok ? ('ok' as const) : ('degraded' as const),
        db: dbOk ? ('ok' as const) : ('down' as const),
        s3: s3Ok ? ('ok' as const) : ('down' as const),
        version: '0.0.0',
        uptime: Math.floor((Date.now() - start) / 1000),
      };
      return reply.status(ok ? 200 : 503).send(body);
    },
  );

  app.get(
    '/version',
    {
      schema: {
        response: {
          200: z.object({
            version: z.string(),
            commit: z.string().nullable(),
            buildTime: z.string().nullable(),
          }),
        },
        tags: ['ops'],
        summary: 'Build version metadata',
      },
    },
    async () => ({
      version: '0.0.0',
      commit: process.env.GIT_COMMIT ?? null,
      buildTime: process.env.BUILD_TIME ?? null,
    }),
  );
}
```

- [ ] **Step 6.8: Typecheck (expect db/client.ts error — fixed in Task 7)**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: FAIL — `db/client.ts` and `db/repositories/health.repo.ts` don't exist yet.

- [ ] **Step 6.9: Don't commit yet — Task 7 creates the db client this depends on**

---

## Task 7: Drizzle schema (all tables) + db client

**Files:**
- Create: `packages/api/src/db/schema.ts`
- Create: `packages/api/src/db/client.ts`
- Create: `packages/api/src/db/repositories/health.repo.ts`
- Create: `packages/api/drizzle.config.ts`

- [ ] **Step 7.1: Write `packages/api/src/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const assetTypeEnum = pgEnum('asset_type', [
  'image',
  'video',
  'document',
  'audio',
]);
export const roleEnum = pgEnum('role', ['owner', 'editor', 'viewer']);
export const visibilityEnum = pgEnum('visibility', [
  'private',
  'org',
  'link',
]);
export const assetStatusEnum = pgEnum('asset_status', [
  'pending',
  'ready',
  'failed',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 32 random bytes, base64url
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  }),
);

export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('orgs_slug_unique').on(t.slug),
  }),
);

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.orgId] }),
    orgIdx: index('memberships_org_idx').on(t.orgId),
  }),
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: assetTypeEnum('type').notNull(),
    format: text('format').notNull(),
    size: integer('size').notNull(),
    mimeType: text('mime_type').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    favorite: boolean('favorite').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    width: integer('width'),
    height: integer('height'),
    duration: integer('duration'),

    objectKey: text('object_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    status: assetStatusEnum('status').notNull().default('pending'),
    visibility: visibilityEnum('visibility').notNull().default('org'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => ({
    orgDeletedIdx: index('assets_org_deleted_idx').on(t.orgId, t.deletedAt),
    orgTypeIdx: index('assets_org_type_idx').on(t.orgId, t.type),
    orgFormatIdx: index('assets_org_format_idx').on(t.orgId, t.format),
    orgUploadedAtIdx: index('assets_org_uploaded_at_idx').on(
      t.orgId,
      t.uploadedAt,
    ),
    orgUploaderIdx: index('assets_org_uploader_idx').on(
      t.orgId,
      t.uploadedBy,
    ),
    // GIN trigram + tags indexes are added in a follow-up migration
    // (see Task 8) because they require the pg_trgm extension and
    // a separate raw SQL migration.
  }),
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
  },
  (t) => ({
    tokenUnique: uniqueIndex('share_links_token_unique').on(t.token),
    assetIdx: index('share_links_asset_idx').on(t.assetId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type NewShareLink = typeof shareLinks.$inferInsert;
```

- [ ] **Step 7.2: Write `packages/api/src/db/client.ts`**

```ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadConfig } from '../config.js';
import * as schema from './schema.js';

export type DB = PostgresJsDatabase<typeof schema>;

let cached: DB | null = null;
let cachedSql: ReturnType<typeof postgres> | null = null;

/** Returns a process-wide Drizzle client. Lazy-initialised. */
export function getDb(): DB {
  if (cached) return cached;
  const config = loadConfig();
  cachedSql = postgres(config.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 5,
  });
  cached = drizzle(cachedSql, { schema });
  return cached;
}

/** Test-only — closes the pool and clears the cache. */
export async function _closeDbForTests(): Promise<void> {
  if (cachedSql) {
    await cachedSql.end({ timeout: 5 });
  }
  cached = null;
  cachedSql = null;
}

/** Liveness probe for /healthz. */
export async function pingDb(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 7.3: Write `packages/api/src/db/repositories/health.repo.ts`**

```ts
import { sql } from 'drizzle-orm';
import { getDb } from './client.js';

/** Used by /healthz and integration tests. */
export async function checkDbConnection(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1 AS ok`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
```

- [ ] **Step 7.4: Write `packages/api/drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://dam:dam@localhost:5432/dam_link',
  },
  strict: true,
  verbose: true,
});
```

Note: requires `dotenv` as a dev dependency. Add it in the next step.

- [ ] **Step 7.5: Add `dotenv` to api package**

Run: `pnpm --filter @dam-link/api add -D dotenv`

- [ ] **Step 7.6: Typecheck the api package**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS. All plugin files exist, db client exists.

- [ ] **Step 7.7: Commit (without running migrations yet)**

```bash
git add packages/api
git commit -m "feat(api): skeleton with plugins, drizzle schema, and db client"
```

---

## Task 8: Generate the initial migration

**Files:**
- Create: `packages/api/drizzle/0000_initial.sql` (generated)
- Create: `packages/api/drizzle/meta/_journal.json` (generated)
- Create: `packages/api/drizzle/meta/0000_snapshot.json` (generated)
- Create: `packages/api/drizzle/0001_trgm_and_gin.sql` (hand-written follow-up)

- [ ] **Step 8.1: Generate the initial migration from the schema**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm --filter @dam-link/api db:generate
```

Expected: `drizzle/0000_<random_name>.sql` is created in `packages/api/`. Open it and verify it contains CREATE TABLE for `users`, `sessions`, `orgs`, `memberships`, `assets`, `share_links` and the four enums.

- [ ] **Step 8.2: Rename the generated file to a stable name (if drizzle didn't name it `0000_initial.sql`)**

Run:
```bash
cd /d/DAM-Link-Backend/packages/api/drizzle
ls
# If the file isn't named 0000_*.sql, drizzle-kit will pick a name.
# In drizzle-kit 0.28 the default is `<random_word>_initial.sql`.
# We want to keep the random name to avoid conflicts; leave it.
```

Note: the `pnpm db:generate` script uses drizzle-kit's default naming. Subsequent migrations will be `<random>_<name>.sql`. Do not rename by hand.

- [ ] **Step 8.3: Write a follow-up migration for pg_trgm indexes**

Write `packages/api/drizzle/0001_trgm_and_gin.sql`:
```sql
-- Enable trigram search on asset name, uploader, and tags.
-- The pg_trgm extension is created in packages/api/drizzle/init.sql
-- which runs on first container start.

CREATE INDEX IF NOT EXISTS assets_name_trgm
  ON assets USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS assets_uploaded_by_trgm
  ON assets USING GIN ((uploaded_by::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS assets_tags_gin
  ON assets USING GIN (tags);
```

Note: `uploaded_by` is a uuid column, so we cast to text for the trigram index. Drizzle's typed schema doesn't model this, hence the hand-written follow-up migration.

- [ ] **Step 8.4: Commit migrations**

```bash
git add packages/api/drizzle
git commit -m "feat(db): initial schema + pg_trgm indexes"
```

---

## Task 9: Migration runner + apply migrations to dev DB

**Files:**
- Create: `packages/api/src/db/migrate.ts`

- [ ] **Step 9.1: Write the migration runner**

Write `packages/api/src/db/migrate.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import 'dotenv/config';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  console.log(`Running migrations against ${url.replace(/:[^:@/]+@/, ':***@')}`);
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');

  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 9.2: Run migrations against the dev database**

Run: `pnpm db:migrate`
Expected output includes:
```
Running migrations against postgres://dam:***@localhost:5432/dam_link
Migrations complete.
```

- [ ] **Step 9.3: Verify the tables exist**

Run:
```bash
docker exec dam-link-postgres psql -U dam -d dam_link -c "\dt"
```

Expected output lists: `users`, `sessions`, `orgs`, `memberships`, `assets`, `share_links`, `__drizzle_migrations`.

- [ ] **Step 9.4: Verify the trigram indexes exist**

Run:
```bash
docker exec dam-link-postgres psql -U dam -d dam_link -c "\di assets_*"
```

Expected output lists: `assets_org_deleted_idx`, `assets_org_type_idx`, `assets_org_format_idx`, `assets_org_uploaded_at_idx`, `assets_org_uploader_idx`, `assets_name_trgm`, `assets_uploaded_by_trgm`, `assets_tags_gin`.

- [ ] **Step 9.5: Boot the API and hit /healthz**

Run: `pnpm dev` (in one shell, leave running)
In another shell, run: `curl -s http://localhost:3000/healthz | jq`
Expected:
```json
{
  "status": "ok",
  "db": "ok",
  "s3": "ok",
  "version": "0.0.0",
  "uptime": 0
}
```

- [ ] **Step 9.6: Hit /version and /docs**

Run:
```bash
curl -s http://localhost:3000/version | jq
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/openapi.json
```

Expected: `/version` returns 200 with the version object, `/docs` returns 200, `/openapi.json` returns 200.

- [ ] **Step 9.7: Stop the dev server, commit**

```bash
# In the dev shell, press Ctrl+C
git add packages/api/src/db/migrate.ts
git commit -m "feat(db): migration runner script"
```

---

## Task 10: Vitest setup with global setup (Postgres + MinIO)

**Files:**
- Create: `packages/api/vitest.config.ts`
- Create: `packages/api/tests/setup.ts` (globalSetup)
- Create: `packages/api/tests/helpers/env.ts`
- Create: `packages/api/tests/helpers/build-app.ts`
- Create: `packages/api/tests/helpers/db.ts`
- Create: `packages/api/tests/helpers/s3.ts`

- [ ] **Step 10.1: Write `packages/api/tests/helpers/env.ts`**

```ts
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

/** Test env. Loaded once by globalSetup, frozen for the test run. */
export const TEST_ENV = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:5173',
  API_HOST: '127.0.0.1',
  API_PORT: 0, // ephemeral when binding via app.inject
  API_PUBLIC_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://dam:dam@localhost:5433/dam_link_test',
  S3_ENDPOINT: 'http://localhost:9003',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'dam',
  S3_SECRET_KEY: 'dams3cret',
  S3_BUCKET: 'dam-link-test',
  S3_FORCE_PATH_STYLE: 'true',
  SESSION_COOKIE_NAME: 'dam_session_test',
  SESSION_TTL_DAYS: '30',
  SESSION_COOKIE_SECRET: 'test-secret-must-be-at-least-16-chars',
};

export function applyTestEnv(): void {
  loadDotenv({ path: resolve(process.cwd(), '.env.test'), quiet: true });
  for (const [k, v] of Object.entries(TEST_ENV)) {
    process.env[k] = v;
  }
}
```

- [ ] **Step 10.2: Write `packages/api/tests/helpers/build-app.ts`**

```ts
import { buildApp as buildAppImpl } from '../../src/server.js';
import type { FastifyInstance } from 'fastify';
import { applyTestEnv } from './env.js';

export async function buildApp(): Promise<FastifyInstance> {
  applyTestEnv();
  const app = await buildAppImpl();
  await app.ready();
  return app;
}
```

- [ ] **Step 10.3: Write `packages/api/tests/helpers/db.ts`**

```ts
import { sql } from 'drizzle-orm';
import { getDb, _closeDbForTests } from '../../src/db/client.js';

/** Truncate all data tables (keeps schema, removes rows). CASCADE handles FKs. */
export async function truncateAllTables(): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    TRUNCATE
      share_links,
      assets,
      memberships,
      orgs,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function closeDb(): Promise<void> {
  await _closeDbForTests();
}
```

- [ ] **Step 10.4: Write `packages/api/tests/helpers/s3.ts`**

```ts
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { applyTestEnv } from './env.js';

let s3: S3Client | null = null;

function getClient(): S3Client {
  if (s3) return s3;
  applyTestEnv();
  // Re-import the singleton from the app code so it picks up the test env.
  // Because of ESM caching, this gets the same instance as production code.
  // If the import ordering is wrong, the env vars in src/config.ts get read
  // at module load — we ensure globalSetup applies env FIRST.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadConfig } = require('../../src/config.js') as typeof import('../../src/config.js');
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BUCKET } = require('../../src/lib/s3.js') as typeof import('../../src/lib/s3.js');
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
```

- [ ] **Step 10.5: Write `packages/api/tests/setup.ts` (globalSetup)**

```ts
import 'dotenv/config';
import { execSync } from 'node:child_process';
import postgres from 'postgres';
import { applyTestEnv } from './helpers/env.js';
import { getDb, _closeDbForTests } from '../src/db/client.js';

export async function setup(): Promise<void> {
  applyTestEnv();
  console.log('[vitest globalSetup] applying test env');

  // 1. Ensure test services are up
  console.log('[vitest globalSetup] ensuring docker-compose.test is up...');
  execSync('docker compose -f docker-compose.test.yml up -d', {
    stdio: 'inherit',
  });

  // 2. Wait for Postgres to be ready
  console.log('[vitest globalSetup] waiting for test postgres...');
  const url = process.env.DATABASE_URL!;
  let attempts = 0;
  const maxAttempts = 30;
  while (attempts < maxAttempts) {
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 2 });
      await sql`SELECT 1`;
      await sql.end();
      break;
    } catch {
      attempts += 1;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (attempts === maxAttempts) {
    throw new Error('Test postgres never became ready');
  }

  // 3. Apply migrations
  console.log('[vitest globalSetup] applying migrations...');
  execSync('pnpm db:migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });

  console.log('[vitest globalSetup] ready');
}

export async function teardown(): Promise<void> {
  await _closeDbForTests();
  // Leave the test services running between runs for speed.
  // Use `pnpm test:services:down` to stop them.
}
```

- [ ] **Step 10.6: Write `packages/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/helpers/env.ts'],
    globalSetup: './tests/setup.ts',
    pool: 'forks',
    poolOptions: {
      forks: {
        // Single fork — DB cleanup is sequential anyway, and tests share
        // the test postgres + minio. Parallelising would race.
        singleFork: true,
      },
    },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
```

- [ ] **Step 10.7: Install extra test deps**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm --filter @dam-link/api add -D @aws-sdk/client-s3
# dotenv is already added in step 7.5
```

Note: `@aws-sdk/client-s3` is already a regular dep; the dev add is to ensure it's resolvable from test files. It's a no-op if already present.

- [ ] **Step 10.8: Commit test scaffolding**

```bash
git add packages/api/tests packages/api/vitest.config.ts
git commit -m "test(api): vitest setup with real postgres+minio globalSetup"
```

---

## Task 11: First integration test (/healthz)

**Files:**
- Create: `packages/api/tests/health.test.ts`

- [ ] **Step 11.1: Write the integration test**

Write `packages/api/tests/health.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { flushTestBucket, closeS3 } from './helpers/s3.js';

describe('GET /healthz', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
    await closeS3();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestBucket();
  });

  it('returns 200 with db=ok, s3=ok when services are reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.s3).toBe('ok');
    expect(body.version).toBe('0.0.0');
    expect(typeof body.uptime).toBe('number');
  });

  it('returns 200 and the same shape on subsequent calls (idempotent)', async () => {
    const first = await app.inject({ method: 'GET', url: '/healthz' });
    const second = await app.inject({ method: 'GET', url: '/healthz' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('ok');
  });
});

describe('GET /version', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns version metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBe('0.0.0');
    expect(body.commit).toBeNull();
    expect(body.buildTime).toBeNull();
  });
});

describe('error envelope', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the standard error shape on 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/this-does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body).toMatchObject({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});
```

- [ ] **Step 11.2: Make sure test services are up**

Run: `pnpm test:services:up`
Expected: services start on ports 5433/9003.

- [ ] **Step 11.3: Run the tests**

Run: `pnpm --filter @dam-link/api test`
Expected:
```
✓ tests/health.test.ts (3 tests)
```

- [ ] **Step 11.4: Run typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add packages/api/tests/health.test.ts
git commit -m "test(api): integration tests for /healthz, /version, error envelope"
```

---

## Task 12: First real route — `GET /api/v1/ping` (sanity)

This task exists to prove the route → service → response path works end-to-end. It is deleted in Plan 2 once auth routes land.

**Files:**
- Create: `packages/api/src/routes/v1/ping.route.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 12.1: Write the route**

Write `packages/api/src/routes/v1/ping.route.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ReplySchema = z.object({
  pong: z.literal(true),
  now: z.string().datetime(),
});

export async function registerPingRoute(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/ping',
    {
      schema: {
        response: { 200: ReplySchema },
        tags: ['ops'],
        summary: 'Sanity ping (removed in Plan 2)',
      },
    },
    async () => ({ pong: true as const, now: new Date().toISOString() }),
  );
}
```

- [ ] **Step 12.2: Register the route in `server.ts`**

Edit `packages/api/src/server.ts` — add this import and call inside `buildApp`:
```ts
import { registerPingRoute } from './routes/v1/ping.route.js';
// ... inside buildApp, after registerHealth(app):
await registerPingRoute(app);
```

- [ ] **Step 12.3: Add a test for the route**

Write `packages/api/tests/ping.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { closeDb } from './helpers/db.js';
import { closeS3 } from './helpers/s3.js';

describe('GET /api/v1/ping', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
    await closeS3();
  });

  it('returns pong and an ISO timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ping' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pong).toBe(true);
    expect(() => new Date(body.now).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 12.4: Verify the OpenAPI spec lists the route**

Boot the server: `pnpm dev`
In another shell: `curl -s http://localhost:3000/openapi.json | jq '.paths | keys'`
Expected: includes `/api/v1/ping`, `/healthz`, `/version`.

- [ ] **Step 12.5: Run tests + typecheck**

Run:
```bash
pnpm --filter @dam-link/api test
pnpm --filter @dam-link/api typecheck
```

Expected: tests pass, typecheck passes.

- [ ] **Step 12.6: Commit**

```bash
git add packages/api/src/routes packages/api/src/server.ts packages/api/tests/ping.test.ts
git commit -m "feat(api): sanity ping route to validate the full request pipeline"
```

---

## Task 13: README updates + `.env.test`

**Files:**
- Modify: `D:\DAM-Link-Backend\README.md`
- Create: `packages/api/.env.test`

- [ ] **Step 13.1: Write `packages/api/.env.test`**

```bash
# Used by tests/helpers/env.ts. Mirrors test env values.
# Do not change without updating tests/helpers/env.ts too.

NODE_ENV=test
LOG_LEVEL=silent
WEB_ORIGIN=http://localhost:5173

API_HOST=127.0.0.1
API_PORT=0
API_PUBLIC_URL=http://localhost:3000

DATABASE_URL=postgres://dam:dam@localhost:5433/dam_link_test

S3_ENDPOINT=http://localhost:9003
S3_REGION=us-east-1
S3_ACCESS_KEY=dam
S3_SECRET_KEY=dams3cret
S3_BUCKET=dam-link-test
S3_FORCE_PATH_STYLE=true

SESSION_COOKIE_NAME=dam_session_test
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECRET=test-secret-must-be-at-least-16-chars
```

- [ ] **Step 13.2: Update the root `README.md` with the test workflow**

Modify `D:\DAM-Link-Backend\README.md` — replace the `Quickstart` section with:
```markdown
## Quickstart

Requires Node 22+, pnpm 9+, Docker.

```bash
# 1. Install
pnpm install

# 2. Copy env files
cp .env.example .env
cp packages/api/.env.example packages/api/.env

# 3. Start dev services (Postgres on :5432, MinIO on :9000, Mailhog on :8025)
pnpm services:up

# 4. Run database migrations
pnpm db:migrate

# 5. Start the API in dev mode
pnpm dev
# → http://localhost:3000
# → http://localhost:3000/docs (Swagger UI)
# → http://localhost:3000/healthz
# → http://localhost:9001 (MinIO console: dam / dams3cret)
# → http://localhost:8025 (Mailhog UI)

# 6. Run integration tests
pnpm test:services:up   # Postgres on :5433, MinIO on :9003
pnpm test
pnpm test:services:down
```

## Plans

This project is built incrementally from a series of plans. See `docs/superpowers/plans/`:

1. **Foundation** (this plan) — monorepo, contracts, docker, db schema, /healthz
2. Auth — register/login/logout, sessions, Turnstile
3. Orgs + memberships + RBAC
4. Assets core — CRUD, soft delete, smart collections, search/filter
5. Uploads — presigned PUT to S3
6. Thumbnails — sharp pipeline
7. Share links — tokenized public access
8. Import + frontend integration
9. Deployment — Dockerfile, CI, Fly.io, R2, rate limiting
```

- [ ] **Step 13.3: Commit**

```bash
git add .
git commit -m "docs: expand README with test workflow and plan roadmap"
```

---

## Task 14: Final verification + tag

- [ ] **Step 14.1: Run the full check suite from a clean slate**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm services:down -v
pnpm test:services:down -v
pnpm install --frozen-lockfile
pnpm services:up
pnpm db:migrate
pnpm test:services:up
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

Expected: all steps pass. Build produces `packages/contracts/dist/` and `packages/api/dist/`.

- [ ] **Step 14.2: Boot the dev server and exercise endpoints by hand**

Run: `pnpm dev`
In another shell:
```bash
curl -s http://localhost:3000/healthz | jq
curl -s http://localhost:3000/version | jq
curl -s http://localhost:3000/api/v1/ping | jq
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/openapi.json
```

Expected: all return 200 with the documented shapes.

- [ ] **Step 14.3: Tag the foundation**

Run:
```bash
git tag -a foundation-v0.1.0 -m "Foundation complete: monorepo, contracts, db, /healthz"
git log --oneline
```

Expected: at least 10 commits, tag in place.

- [ ] **Step 14.4: Report completion**

Reply to the user with:
- The list of commits made
- The output of `pnpm -r test`
- Confirmation that `pnpm dev` boots and `/healthz`, `/version`, `/api/v1/ping`, `/docs`, `/openapi.json` all return 200
- A pointer to Plan 2 in the same directory

---

## Self-review

**Spec coverage:**
- Monorepo (pnpm workspace, three packages) → Tasks 1, 2, 5
- contracts package with common schemas → Task 2
- API skeleton with Fastify + config + Pino + CORS + Helmet + error handler + /healthz + /version + Swagger → Tasks 5, 6
- Drizzle schema for all tables (users, sessions, orgs, memberships, assets, share_links) → Task 7
- Initial migration + follow-up trigram migration → Task 8
- Migration runner + apply to dev DB → Task 9
- Docker Compose for dev (postgres + minio + mailhog) → Task 3
- Docker Compose for test (different ports) → Task 4
- Vitest with real Postgres + MinIO in globalSetup → Task 10
- Test helpers: buildApp, truncateAllTables, flushMinio → Task 10
- Integration test for /healthz → Task 11
- OpenAPI spec served at /docs and /openapi.json → Task 6
- README + .env.example + .env.test → Tasks 1, 13

**Placeholder scan:** no "TBD", "TODO", or "implement later" present.

**Type consistency:** `ErrorBodySchema` from `common.ts` matches the shape used in `error-handler.ts` and `health.test.ts`. `HealthResponseSchema` shape matches what `/healthz` returns and what tests assert. `BUCKET` constant is imported from `lib/s3.ts` in both production and test code.

**Edge cases I added on purpose:**
- The `flushTestBucket` helper uses `require()` to load the S3 module at call time, not import time, so test env vars are applied before the module reads `loadConfig()`. Documented inline.
- `drizzle.config.ts` uses `dotenv/config` so migrations can read the root `.env`.
- The `assets_uploaded_by_trgm` index casts uuid to text because `gin_trgm_ops` requires text — Drizzle doesn't model this, hence a hand-written follow-up migration.
- `singleFork: true` in vitest config because tests share the DB and S3 and would race if parallelised.

---

## Execution handoff

Plan complete and saved to `D:\DAM-Link-Backend\docs\superpowers\plans\2026-06-04-dam-link-backend-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
