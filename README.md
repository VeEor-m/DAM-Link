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
- Coding standards: `docs/coding-standards.md`
- Deployment guide: `docs/deployment.md` (Plan 9)
