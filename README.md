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

## Layout

- `packages/contracts/` — Zod schemas + generated types (shared)
- `packages/api/` — Fastify server, Drizzle schema, services
- `packages/web/` — React frontend (added in Plan 8)

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

## Documentation

- API surface: `http://localhost:3000/docs`
- OpenAPI spec: `http://localhost:3000/openapi.json`
- Implementation plans: `docs/superpowers/plans/`
- Coding standards: `docs/coding-standards.md`
- Deployment guide: `docs/deployment.md` (Plan 9)
