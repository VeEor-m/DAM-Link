# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project at a glance

Multi-tenant Digital Asset Management monorepo. Backend serves a React 19 SPA.

- **Monorepo:** pnpm 9 workspaces — `packages/contracts` (Zod schemas, single source of truth for types), `packages/api` (Fastify 5 + Drizzle + PostgreSQL 16 + S3-compatible storage), `packages/web` (Vite + React 19 + GSAP, no longer a mock-data app — talks to the real API).
- **Runtime:** Node 22, ESM, TypeScript 5.6 strict, `verbatimModuleSyntax: true` (use `import type` for type-only imports).
- **Infra:** Docker Compose for local Postgres (port **54321** — not 5432, to avoid Windows conflicts) + MinIO (9000/9001) + MailHog (1025/8025). Test stack uses **5433 / 9003** so both can run concurrently.
- **External:** Cloudflare R2 (prod storage), Neon (prod Postgres), Sentry (5xx-only, opt-in via `SENTRY_DSN`), Cloudflare Turnstile (opt-in), Fly.io deployment, GitHub Actions CI.
- **Test count target (as of `main`):** 148 API + 107 contracts + 237 web = **492/492 passing** in ~5 min on real Postgres + MinIO (no mocking the I/O layer).

## Commands

### Daily dev loop
```bash
pnpm install                    # first time / after merging a branch with new deps
pnpm services:up                # docker compose up Postgres + MinIO + MailHog
pnpm db:migrate                 # apply SQL files in packages/api/drizzle/
pnpm dev                        # API in watch mode (port 3000)
pnpm -F @dam-link/web dev       # Vite dev server (port 5173) — second terminal
```

### Tests
```bash
pnpm test                       # all workspaces
pnpm -F @dam-link/api test      # API only (auto-brings up test docker stack via globalSetup)
pnpm -F @dam-link/web test      # web only
pnpm -F @dam-link/api test tests/uploads.test.ts    # single API test file
pnpm test:services:down         # stop the test Postgres/MinIO
```
- API tests use **real Postgres (5433) + MinIO (9003)** via `tests/setup.ts` globalSetup (auto-up'd). `pool: 'forks', singleFork: true` — DB cleanup is sequential.
- API tests seed data **via API endpoints** (`POST /api/v1/auth/register`, `/orgs`, `/members`) not the `seedOrgWith` helper. The helper creates a phantom user not connected to the API-registered session, so authenticated requests get `ORG_FORBIDDEN`. See `tests/uploads.test.ts:21-44` for the `createOrgViaApi` + `inviteMemberViaApi` pattern.

### Lint / typecheck / build
```bash
pnpm typecheck                  # tsc --noEmit in every workspace
pnpm lint                       # ESLint in api + contracts (web intentionally excluded from root)
pnpm -F @dam-link/web lint      # web's own lint if needed
pnpm build                      # tsc + vite build for every workspace
pnpm db:studio                  # Drizzle Studio in browser (read-only debugging)
```

### Verify
```bash
curl http://localhost:3000/healthz   # returns {status, db, s3, version, uptime, pool:{max,inUse,waiting}}
curl http://localhost:3000/docs      # Swagger UI
```

## Architecture

### Backend layers (`packages/api/src/`)

```
routes/v1/   →  services/   →  repositories/   →   db/   (Drizzle)
                              ↑
                          plugins/  (cross-cutting: auth, org-context, error-handler, sentry, csrf, rate-limit, zod-validator, helmet, cors, cookie, request-id, health, swagger)
                              ↑
                          lib/      (utilities: s3, sharp, argon2, sessions, sentry, logger, ids, passwords, slug, turnstile)
```

- **Routes** parse input (Zod schemas from `@dam-link/contracts`), call a service, return JSON-schema response (NOT Zod — see gotcha below).
- **Services** own business logic + RBAC decisions + S3 presigning + result mapping. They never touch the DB client directly.
- **Repositories** own SQL. **Every exported async function must be wrapped with `observeSql('<repo>.<method>', fn)`** — invariant guarded by `tests/repos.observe.test.ts` (7 static-analysis tests count `export async function` vs `observeSql(` per file).
- **Plugins** register preHandlers and decorators. Order matters in `server.ts` (Sentry must come before error handler; org-context must come after auth).

### Frontend (`packages/web/src/`)

- **State** — single `useReducer` + Context in `state/store.tsx`. `wrappedDispatch` is **stable across all state changes** (deps: `[dispatch]` only; reads current state via `useRef` mirror). Never put `state` in a `useCallback` dep array — see `state/store.tsx:72-80` for the rationale (the sidebar-counts refetch feedback loop).
- **API client** — `api/client.ts` thin `fetch` wrapper; `credentials: 'include'` for session cookies; `ApiError(status, code, message, details?)`. Vite dev proxy at `vite.config.ts` routes `/api/*` → `http://localhost:3000`.
- **Adapter** — `state/assetAdapter.ts` is the **only** file that maps `apiAssetToLocal`. Inline mappings scattered around the codebase are a smell.
- **Action pattern for mutations** — UI handler does `try { dispatch optimistic; await api*; dispatch server-truth } catch { rollback; toast }`. See any handler in `App.tsx` for the snapshot/rollback template.

### Contracts (`packages/contracts/src/`)

Zod schemas + inferred TS types, shared between API and Web. `index.ts` re-exports the domain modules. **Response shapes are not in contracts** — Fastify wants JSON-schema (see gotcha). Use Zod for `body` / `querystring` / `params` only.

## Cross-cutting patterns (the important ones)

### Tenant isolation — the single chokepoint
`plugins/org-context.ts` mounts a preHandler that resolves `:orgId` → `{ org, role }` and decorates `req.orgContext`. **Every org-scoped route goes through it; never query another org's data without it.** `requireRole('owner'|'editor'|'viewer')` is a factory for minimum-role checks. Denials throw `AppError(403, 'INSUFFICIENT_ROLE', ...)` — tests assert on the **error code**, not just `statusCode === 403`.

### Observability (`feat/backend-observability` plan)
- `observeSql<T>(op: string, fn: () => Promise<T>)` in `db/observe.ts` — times the query, emits `{evt:'slow_query', op, durationMs, rowCount, requestId}` Pino `warn` + Sentry breadcrumb if duration > `SLOW_QUERY_MS` (default 200, env-tunable, `0` = log every query). `op` is `<repo>.<method>`, NOT raw SQL.
- `requestIdStore` is module-level `AsyncLocalStorage<string>`, seeded by the `request-id` plugin via `enterWith(req.id)`. Slow-query logs inherit the active Sentry transaction id.
- `/healthz` response includes `pool: {max, inUse, waiting}`. `inUse` = count of in-flight `observeSql` calls. `waiting` is **always 0** — postgres-js 3.4.5 doesn't expose pool events; pool saturation shows as `inUse == max` sustained. See `docs/observability.md` (operator runbook) for Sentry/Neon alert rules.
- Sentry is for **5xx only**. Never wrap 4xx in a Sentry capture. `addBreadcrumb` is safe to call before `Sentry.init` (no-op).

### Errors
`throw new AppError(statusCode, code, message, details?)` in `plugins/error-handler.ts`. Codes are `SCREAMING_SNAKE_CASE` (e.g. `ORG_FORBIDDEN`, `INSUFFICIENT_ROLE`, `INVALID_CURSOR`, `ASSET_NOT_FOUND`). The HTTP 404/500 envelope is `{ error: { code, message, details? } }` — `ErrorBodySchema` from contracts is the single source of truth.

### Worktrees
- `.worktrees/<branch>/` is gitignored. One worktree per implementation plan.
- **After merging a worktree to main, run `pnpm install --frozen-lockfile` before tests** — the merge may add deps (e.g. `@sentry/node`) that `node_modules/` doesn't have.
- **On Windows, `git worktree remove` fails with "Directory not empty"** if `pnpm --filter @dam-link/api dev` or `tsx --watch` from that worktree is still running. Kill those processes first.

## Critical gotchas (worth grep-ing for)

- **Routes use JSON-schema response objects, NOT Zod.** Zod response schemas crash Fastify with `data/required must be array`. See `routes/v1/assets.routes.ts:24-94` for the pattern (raw `{type: 'object', properties: {...}, required: [...]}` consts). Zod is still fine for `body` / `querystring` / `params`.
- **`seedOrgWith` in `tests/helpers/seed.ts` creates a phantom user** not connected to the API-registered session. Use `createOrgViaApi` / `inviteMemberViaApi` instead (see `tests/uploads.test.ts:21-44`).
- **`SeededAsset` has no `objectKey` or `mimeType`** — `seedAsset` computes them internally. For tests that need a real S3 object, `s3.send(new PutObjectCommand(...))` separately (the presign itself doesn't validate object existence).
- **`@sentry/node` is a sealed ESM namespace** — `vi.spyOn` doesn't work on it. Use `vi.mock('@sentry/node', () => ({...}))` with `vi.importActual<typeof Sentry>()`. See `tests/sentry.breadcrumb.test.ts`.
- **`PaginationInputSchema.limit` needs `z.coerce.number()`** for querystring (querystrings are strings).
- **Vite's port: 5173 → API at 3000** via `packages/web/vite.config.ts` proxy. If the web "can't reach the API", check the proxy config, not CORS.
- **Sentry init is fire-and-forget** (`void initSentryFromEnv()` in `server.ts:30`). Code that runs during boot must tolerate Sentry not being initialised.
- **Local Postgres port is 54321, not 5432** (Windows + Docker port conflict). `DATABASE_URL` in `.env` is the source of truth; `.env.example` is misleading. See `docs/development.md` §2.

## Workflow

This project is built incrementally from numbered plans in `docs/superpowers/plans/`. Each plan is a self-contained deliverable with a design spec in `docs/superpowers/specs/` and a tagged merge commit on `main`. **Read the relevant plan + spec before touching code in that area.** The plan explains the *why* and the trade-offs; the spec explains the *what*.

- **For new multi-step work:** use `superpowers:brainstorming` first, then `superpowers:writing-plans`. One worktree per plan. Branch name format: `feat/<short-name>`. Tag on merge: `<short-name>-v<MAJOR>.<MINOR>.0` (monotonic per project, not per plan).
- **For execution mode:** user prefers subagent-driven (one subagent per independent task) with worktrees. See `~/.claude/projects/D--DAM-Link-Backend/memory/` for prior-session context (auto-loaded into every conversation).
- **For visual / UI changes:** run Playwright in a real dev environment (`docs/superpowers/plans/screenshots/<plan-id>/verify.py` pattern). Real Chrome, real API, real user — not jsdom.
- **Commits:** Conventional Commits, atomic per task, no `--no-verify`, no force push, no amend after push.
- **The project is feature-complete and deployable** (last merged plan: `observability-v0.16.0`, 16/16 plans done). New work is maintenance, scale, or new features — verify with the user before starting.

## Critical paths

- `docs/coding-standards.md` — full code conventions (errors, validation, API shape, naming)
- `docs/development.md` — local dev startup, troubleshooting
- `docs/deployment.md` — Fly.io + R2 + Neon + Sentry + GH Actions CI
- `docs/observability.md` — `/healthz` schema, slow-query log shape, alert rules
- `docs/superpowers/plans/` — 16 plans (numbered 1-11, 14-16, 18-19; 12-13/17 never produced)
- `docs/superpowers/specs/` — approved design specs
- `packages/web/CLAUDE.md` — frontend-only notes (predates API integration; treat as historical, see `src/state/store.tsx` and `src/api/client.ts` for current)
- `~/.claude/projects/D--DAM-Link-Backend/memory/MEMORY.md` — auto-loaded cross-session context (topic files: `architecture.md`, `coding-standards.md`, `plan-roadmap.md`, `gotchas.md`)
