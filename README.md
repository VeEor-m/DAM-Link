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

1. **Foundation** — monorepo, contracts, docker, db schema, /healthz — tag `foundation-v0.1.0`
2. **Auth** — register/login/logout, sessions, CSRF, Turnstile — tag `auth-v0.2.0`
3. Orgs + memberships + RBAC
4. Assets core — CRUD, soft delete, smart collections, search/filter
5. Uploads — presigned PUT to S3
6. Thumbnails — sharp pipeline
7. Share links — tokenized public access
8. Import + frontend integration
9. Deployment — Dockerfile, CI, Fly.io, R2, rate limiting

### Auth endpoints (Plan 2)

```
POST /api/v1/auth/register   { email, password, displayName, turnstileToken? } → { data: { user, session } }, Set-Cookie
POST /api/v1/auth/login      { email, password, turnstileToken? }             → { data: { user, session } }, Set-Cookie
POST /api/v1/auth/logout                                                           → 204, clears cookie
GET  /api/v1/auth/me                                                                       → { data: { user, orgs: [] } } (orgs in Plan 3)
```

Curl exercise (in dev/test, `RATE_LIMIT_DISABLED=true` to avoid the 5/min auth cap):

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"manual@example.com","password":"hunter2pass","displayName":"Manual"}'
# Copy the Set-Cookie value, then:
curl http://localhost:3000/api/v1/auth/me -H "cookie: dam_session=<COOKIE_VALUE>"
```

## Documentation

- API surface: `http://localhost:3000/docs`
- OpenAPI spec: `http://localhost:3000/openapi.json`
- Implementation plans: `docs/superpowers/plans/`
- Coding standards: `docs/coding-standards.md`
- Deployment guide: `docs/deployment.md` (Plan 9)
