# DAM-Link — Local Development Startup Guide

> **Goal:** Get the full stack (Postgres + MinIO + API + Web) running on your laptop in under 10 minutes.
> **Audience:** Anyone cloning the repo for the first time.

This document is a single source of truth for local dev. Update it (not a wiki) when something changes.

---

## 0. Prerequisites

Install these once. Skip what you already have.

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 22.x | `.nvmrc` pins `22`. The `.npmrc` `engines` field requires `>=22`. |
| **pnpm** | 9.12+ | Workspace orchestrator. `corepack enable && corepack prepare pnpm@9.12.0 --activate` is the cleanest install. |
| **Docker Desktop** | latest | Hosts Postgres + MinIO. Must be running before `services:up`. |
| **Git** | any | — |

**Windows-specific:** WSL2 backend enabled in Docker Desktop. (See `docs/coding-standards.md` and the `gotchas.md` in your project memory for the Windows + Docker registry mirror fix — the default USTC/163 mirrors DNS-fail, use `https://docker.1ms.run`.)

Verify:

```bash
node --version    # v22.x.x
pnpm --version    # 9.12.x
docker --version  # 24+ (Docker Desktop)
```

---

## 1. Clone & install

```bash
git clone <repo-url> dam-link-backend
cd dam-link-backend
pnpm install
```

This installs deps for all three workspaces (`@dam-link/api`, `@dam-link/web`, `@dam-link/contracts`).

> **One-time fix for the local port 5432 conflict on Windows:** if you have a local PostgreSQL install listening on 5432, the Docker container's host-port mapping silently fails. We use **54321** for dev and **5433** for tests to avoid the conflict. Nothing to do here if your dev DB is the Docker one.

---

## 2. Environment variables

Copy the example and edit if you need to override anything (defaults work out-of-the-box):

```bash
cp .env.example .env
```

`.env` is gitignored. Never commit it. Key vars:

| Var | Default | What |
|---|---|---|
| `NODE_ENV` | `development` | — |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS allowlist (must match Vite dev server) |
| `API_PORT` | `3000` | API listen port |
| `DATABASE_URL` | `postgres://dam:dam@localhost:54321/dam_link` | **Host port is 54321** (mapped from container 5432) |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO API |
| `S3_BUCKET` | `dam-link-dev` | Auto-created on `services:up` |
| `SESSION_COOKIE_SECRET` | `change-me-...` | Change in prod. 32+ bytes of random. |
| `SENTRY_DSN` | empty | Optional. Leave blank to disable Sentry in dev. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | empty | Optional in dev. Without them, the API auto-bypasses Turnstile for local requests. |

> **Note:** `.env.example` says port `5432` but the committed `.env` correctly uses `54321`. The `.env` file is the source of truth locally.

---

## 3. Start the infrastructure (Postgres + MinIO + MailHog)

```bash
pnpm services:up
```

This is a thin wrapper around `docker compose -f docker-compose.yml up -d`. It brings up:

| Service | Host port | Purpose | Auto-config |
|---|---|---|---|
| `dam-link-postgres` | **54321** (→ 5432) | App database | Creates `dam` user + `dam_link` DB on first run. Mounts custom `pg_hba.conf` (trust auth on all hosts — see gotcha below). |
| `dam-link-minio` | **9000** (API) + **9001** (console) | S3-compatible storage | `dam`/`dams3cret` root creds. |
| `dam-link-minio-bucket` | — | Init container | Waits for MinIO health, then creates the `dam-link-dev` bucket and makes it publicly downloadable. |
| `dam-link-mailhog` | **1025** (SMTP) + **8025** (web UI) | Dev mail catcher | Catches all outbound email. Browse `http://localhost:8025` to see messages. |

Verify they're up:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep dam-link
```

Wait ~5s for healthchecks. Postgres especially takes a few seconds to initialize on first run.

**Logs (if something's wrong):**

```bash
pnpm services:logs             # all services, follow mode
pnpm services:logs postgres    # one service
```

**Stop:**

```bash
pnpm services:down             # stops + removes containers (data volumes persist)
pnpm services:down -v          # also wipes data (full reset)
```

---

## 4. Run database migrations

```bash
pnpm db:migrate
```

This runs `packages/api/src/db/migrate.ts` with the env loaded. It applies all SQL files in `packages/api/drizzle/` in order (tracked in `__drizzle_migrations` + `meta/_journal.json`).

**First-time setup creates:**

- All 11 tables (`users`, `sessions`, `orgs`, `org_members`, `assets`, `tags`, `asset_tags`, `share_links`, `share_link_assets`, `uploads`, `thumbnails`)
- 3 GIN trigram indexes for `pg_trgm` search
- Extensions: `pg_trgm`, `uuid-ossp`

**Generate a new migration** after editing `packages/api/src/db/schema.ts`:

```bash
pnpm db:generate    # creates a new .sql file in packages/api/drizzle/
pnpm db:migrate     # apply it
```

**Browse the DB** (optional, great for debugging):

```bash
pnpm db:studio      # opens Drizzle Studio in your browser
```

---

## 5. Start the back-end (API)

```bash
pnpm dev
```

This is `pnpm --filter @dam-link/api dev` — runs `node --env-file=../../.env --watch --import tsx src/server.ts` in the API package. The `--env-file` flag loads `.env` automatically; `--watch` restarts on source changes.

You should see something like:

```
{"level":30,"time":...,"msg":"server listening","address":"0.0.0.0","port":3000}
{"level":30,"time":...,"msg":"postgres connected","host":"localhost","port":54321,"db":"dam_link"}
{"level":30,"time":...,"msg":"s3 client ready","endpoint":"http://localhost:9000","bucket":"dam-link-dev"}
{"level":30,"time":...,"msg":"http server listening","port":3000}
```

**Health check:**

```bash
curl http://localhost:3000/healthz
# {"status":"ok","db":"up","s3":"up"}
```

**Other useful endpoints:**

```bash
curl http://localhost:3000/version         # git SHA + build time
curl http://localhost:3000/documentation   # Swagger UI
```

**Stop:** `Ctrl+C` in the terminal.

---

## 6. Start the front-end (Web) — second terminal

The root `pnpm dev` only starts the API. The web dev server is separate. Open a second terminal:

```bash
pnpm -F @dam-link/web dev
```

This runs `vite` in the `@dam-link/web` package. You should see:

```
  VITE v8.0.12  ready in 412 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open `http://localhost:5173/` in your browser. The new login screen renders (with the GSAP mount animation, if you have Plan 11).

**How the web talks to the API:** Vite proxies `/api/*` → `http://localhost:3000` automatically. No CORS issues in dev. See `packages/web/vite.config.ts`.

**Stop:** `Ctrl+C` in the terminal.

---

## 7. Two-terminal dev workflow (TL;DR)

| Terminal | Command | Watches | Port |
|---|---|---|---|
| **T1** | `pnpm services:up` (once) | Docker services | 54321, 9000, 9001, 1025, 8025 |
| **T2** | `pnpm db:migrate` (once) | — | — |
| **T3** | `pnpm dev` | `packages/api/src/**` | 3000 |
| **T4** | `pnpm -F @dam-link/web dev` | `packages/web/src/**`, `packages/web/index.html` | 5173 |

After the first time, your daily loop is just T3 + T4.

---

## 8. Common commands

### Run all tests

```bash
pnpm test
```

This runs `vitest run` in every workspace. **Caveat:** the API tests need their own Docker stack (Postgres on 5433 + MinIO on 9003) and will auto-bring it up via `globalSetup`. If Docker Desktop isn't running, the API tests fail with a globalSetup error — web tests still pass.

```bash
pnpm -F @dam-link/web test           # web only
pnpm -F @dam-link/api test           # api only
pnpm -F @dam-link/web test:watch     # web, watch mode
```

### Type-check & lint

```bash
pnpm typecheck    # tsc --noEmit in every workspace
pnpm lint         # ESLint in API + contracts (web is excluded from root lint intentionally)
pnpm -F @dam-link/web lint    # web lint, if you need it
```

### Build for production

```bash
pnpm build        # builds every workspace
```

Produces:
- `packages/api/dist/server.js` (Node 22 ESM)
- `packages/web/dist/` (static SPA — `index.html` + assets)
- The Docker image: `D:\DAM-Link-Backend\Dockerfile` (multi-stage, see `docs/deployment.md`)

### Full reset (when things go sideways)

```bash
pnpm services:down -v          # nuke Postgres + MinIO data
docker volume prune            # clean any dangling volumes
pnpm install                   # re-install deps
pnpm services:up
pnpm db:migrate                # recreate schema
pnpm dev                       # in T3
pnpm -F @dam-link/web dev      # in T4
```

---

## 9. Smoke test the full stack

After all four terminals are up, run this in a fifth terminal:

```bash
# 1. Health
curl -s http://localhost:3000/healthz | jq .

# 2. Register a user (with dev Turnstile bypass — no token required)
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@studio.com","password":"correct-horse-battery-staple","displayName":"You"}' \
  -c cookies.txt | jq .

# 3. Open the web app — you should be auto-logged in
#    http://localhost:5173/

# 4. Browse MinIO (optional)
#    http://localhost:9001/   (dam / dams3cret)
```

---

## 10. Troubleshooting

### "ECONNREFUSED 127.0.0.1:5432"
You have a local Postgres listening on 5432. Two options:
- **Use the Docker one:** change `DATABASE_URL` in `.env` to `localhost:54321`.
- **Stop the local one** (Services app on Windows → PostgreSQL → Stop).

### "port is already allocated" on `pnpm services:up`
- Check `docker ps -a` for stale containers. `docker rm -f <name>`.
- Check the host isn't running anything on 54321, 9000, 9001, 1025, 8025.

### MinIO: "AccessDenied" on upload
- Confirm the bucket exists: `docker logs dam-link-minio-bucket` should end with "Bucket dam-link-dev ready."
- Re-run the init: `docker rm -f dam-link-minio-bucket && pnpm services:up` (the `minio-bucket` service is a one-shot init that re-runs on `up` if missing).

### Web: blank page or "Failed to fetch /api/v1/..."
- Is the API up? `curl http://localhost:3000/healthz`
- Check Vite proxy: `packages/web/vite.config.ts` → `server.proxy['/api']` should target `http://localhost:3000`.

### Tests fail: "Failed to load url @sentry/node" (or similar module-not-found)
- You probably merged a feature branch that added a new dep. Run `pnpm install --frozen-lockfile` to pull it in.

### Tests fail: "docker daemon not running"
- Start Docker Desktop. The API test `globalSetup` will bring up the test stack (Postgres 5433, MinIO 9003) automatically.

### TypeScript errors in the IDE but `pnpm typecheck` is clean
- Restart the TS server (VS Code: `Cmd/Ctrl+Shift+P` → "Restart TS Server").
- The monorepo uses project references; the IDE needs to pick up the root `tsconfig.json`.

### Login page animations don't run
- Check `prefers-reduced-motion` in your OS. Animations skip if "Reduce motion" is on (this is the intended behavior).
- Open DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → set to "no-preference".

---

## 11. Where to look next

- `docs/coding-standards.md` — production code conventions (errors, validation, API shape)
- `docs/deployment.md` — Fly.io + R2 + Neon + Sentry (production deployment)
- `docs/superpowers/specs/` — approved design specs (one per plan)
- `docs/superpowers/plans/` — implementation plans + visual verification screenshots
- `README.md` — repo root overview

For project structure and key file locations, see `packages/web/CLAUDE.md` and the `memory/` directory in your Claude config (auto-loaded into every session).
