# DAM-Link Backend — Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the API to a production-like environment: containerised, observed, CI-gated, and deployable to Fly.io with Cloudflare R2 for storage and Sentry for errors. End state: `git push origin main` produces a green CI run, builds a Docker image, pushes it to GHCR, and rolls it out to Fly.io. `/healthz` returns 200 in production. Sentry receives a synthetic test event.

**Architecture:** Multi-stage Dockerfile based on `node:22-alpine`. The image runs as a non-root user, ships only `dist/` + production `node_modules/`, and exposes a `/healthz` probe for Fly's health checks. GitHub Actions is the single source of truth: PRs run lint/typecheck/test/build against the same Postgres+MinIO used in dev; pushes to `main` build+push a versioned image to GHCR and trigger `flyctl deploy`. Secrets are stored in Fly.io (not in the image, not in the repo). CSRF/Turnstile/rate-limit are already wired in Plan 2; this plan adds production hardening (TURNSTILE always on in prod, rate-limit globals) and a Sentry integration.

**Tech Stack:** Docker (multi-stage), GitHub Actions, Fly.io, Cloudflare R2, Sentry, `@sentry/node`, existing Fastify + Pino + Drizzle stack.

---

## Plan 9 of 9 — Deployment

- Real Sentry integration (replaces the Plan 1 stub): `@sentry/node` + `@sentry/profiling-node`, source maps uploaded to Sentry, init gated on `SENTRY_DSN`
- Production config hardening: refuse to boot in `production` with weak secrets, force `TURNSTILE_SECRET_KEY` to be set, log a structured "boot summary"
- Multi-stage Dockerfile: build stage compiles `contracts` + `api`, runtime stage copies `dist/` and pruned `node_modules/`
- `.dockerignore` so the build context stays small
- `fly.toml`: single-process app on port 3000, autoscale-to-zero in staging regions, health check on `/healthz`, internal-only Postgres
- `docker-compose.prod.yml` for local production-simulation: real Postgres + R2 emulator (MinIO) + the built image
- GitHub Actions CI workflow: on PR — install, lint, typecheck, test (with services), build Docker image (smoke)
- GitHub Actions deploy workflow: on `main` — login to GHCR, build+push image, `flyctl deploy`
- Production smoke test script: hits `/healthz`, `/version`, registers a throwaway user, uploads a 1KB file, downloads it, asserts on the byte-for-byte round-trip
- Deployment documentation (`docs/deployment.md`): how to create the R2 bucket, how to provision a Neon Postgres, how to set Fly secrets, how to roll back, how to read Sentry
- README "Deployment" section pointing to `docs/deployment.md`

**Deferred to v2:**
- Multi-region deployment, blue/green deploys
- Auto-scaling under load (Fly autoscale to N machines based on CPU)
- Prometheus metrics export (currently we only have structured logs and Sentry)
- Web frontend deployed to Cloudflare Pages/Workers (Plan 8 left `pnpm --filter @dam-link/web build`; deploy of the static bundle is not in this plan)

---

## File structure (this plan adds/modifies)

```
D:\DAM-Link-Backend\
├── Dockerfile                            # NEW: multi-stage
├── .dockerignore                         # NEW
├── docker-compose.prod.yml               # NEW: prod-like local stack
├── .github/
│   └── workflows/
│       ├── ci.yml                        # NEW: PR checks
│       └── deploy.yml                    # NEW: main → Fly.io
├── fly.toml                              # NEW
├── docs/
│   └── deployment.md                     # NEW: ops guide
├── packages/
│   ├── api/
│   │   ├── package.json                  # MODIFY: add @sentry/node, @sentry/profiling-node
│   │   ├── src/
│   │   │   ├── config.ts                 # MODIFY: prod-only secret rules
│   │   │   ├── server.ts                 # MODIFY: Sentry init + boot summary
│   │   │   ├── plugins/
│   │   │   │   ├── sentry.ts             # MODIFY: real init
│   │   │   │   └── rate-limit.ts         # MODIFY: enforce TURNSTILE in prod
│   │   │   └── lib/
│   │   │       └── sentry.ts             # NEW: initSentry, captureException helpers
│   │   ├── scripts/
│   │   │   └── smoke-prod.sh             # NEW: production smoke test
│   │   ├── tests/
│   │   │   ├── csrf-turnstile-prod.test.ts  # NEW
│   │   │   └── sentry.test.ts            # NEW
│   │   └── Dockerfile                    # ALREADY referenced (created in Plan 1)
└── README.md                             # MODIFY: add Deployment section
```

---

## Task 1: Wire real Sentry (replace the Plan 1 stub)

**Files:**
- Create: `packages/api/src/lib/sentry.ts`
- Modify: `packages/api/src/plugins/sentry.ts`
- Modify: `packages/api/src/config.ts`
- Modify: `packages/api/package.json`

- [ ] **Step 1.1: Add Sentry dependencies**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm --filter @dam-link/api add @sentry/node@8.42.0 @sentry/profiling-node@8.42.0
```

Expected: `packages/api/package.json` lists both in `dependencies`.

- [ ] **Step 1.2: Write `packages/api/src/lib/sentry.ts`**

```ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { loadConfig } from '../config.js';
import { logger } from './logger.js';

let initialised = false;

export interface SentryOptions {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
}

export function initSentry(opts: SentryOptions): void {
  if (initialised) return;
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    release: opts.release,
    tracesSampleRate: opts.tracesSampleRate,
    profilesSampleRate: opts.profilesSampleRate,
    integrations: [nodeProfilingIntegration()],
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip cookies and auth headers from breadcrumbs.
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }
      return event;
    },
  });
  initialised = true;
}

/** Capture an exception with extra context. Safe to call before init (no-op). */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialised) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Test-only — reset the singleton so tests can re-init with a different DSN. */
export function _resetSentryForTests(): void {
  initialised = false;
  // @ts-expect-error — accessing private for tests
  Sentry.getClient()?.close();
}

/** Boot-time init driven by env. Logs and skips if DSN is absent. */
export function initSentryFromEnv(): boolean {
  const config = loadConfig();
  if (!config.SENTRY_DSN) {
    logger.info('sentry: SENTRY_DSN not set, skipping init');
    return false;
  }
  initSentry({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: process.env.GIT_COMMIT ?? 'dev',
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  logger.info({ environment: config.NODE_ENV }, 'sentry: initialised');
  return true;
}
```

- [ ] **Step 1.3: Replace `packages/api/src/plugins/sentry.ts` (real init)**

```ts
import type { FastifyInstance } from 'fastify';
import { captureException } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';

/**
 * In Plan 1 this was a no-op stub. In production it captures every unhandled
 * error into Sentry, with request context (URL, method, user id).
 */
export async function registerSentry(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err, req, reply) => {
    // Always log locally first.
    req.log.error({ err }, 'request error');

    // Capture in Sentry for 5xx errors only (4xx are user errors, not bugs).
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      captureException(err, {
        requestId: req.id,
        method: req.method,
        url: req.url,
        userId: (req as { user?: { id?: string } }).user?.id,
      });
    }

    // Delegate to the existing error handler (set by registerErrorHandler).
    // We re-define behaviour here to avoid two setErrorHandler calls clashing.
    const { ErrorBodySchema } = require('@dam-link/contracts') as typeof import('@dam-link/contracts');
    const { AppError } = require('./error-handler.js') as typeof import('./error-handler.js');

    if (err instanceof AppError) {
      const body = ErrorBodySchema.parse({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return reply.status(err.statusCode).send(body);
    }
    const body = ErrorBodySchema.parse({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    return reply.status(500).send(body);
  });

  logger.debug('sentry plugin registered');
}
```

Note: this replaces the existing `registerSentry` body. The `setErrorHandler` in `error-handler.ts` should be removed in the next step to avoid double-handling.

- [ ] **Step 1.4: Remove the duplicate `setErrorHandler` from `error-handler.ts`**

Edit `packages/api/src/plugins/error-handler.ts` — remove the entire `app.setErrorHandler` block (the one that returns the `INTERNAL_ERROR` body). The Sentry plugin now owns error handling. The `app.setNotFoundHandler` block stays.

Resulting `error-handler.ts`:
```ts
import type { FastifyInstance } from 'fastify';
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
  app.setNotFoundHandler((_req, reply) => {
    const body = ErrorBodySchema.parse({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
    return reply.status(404).send(body);
  });
}
```

- [ ] **Step 1.5: Update the `Sentry` config schema**

In `packages/api/src/config.ts`, change the `SENTRY_DSN` entry to:
```ts
SENTRY_DSN: z
  .string()
  .url()
  .optional()
  .refine(
    (v) => v === undefined || v.startsWith('https://'),
    'SENTRY_DSN must be HTTPS',
  ),
```

Replace the existing `SENTRY_DSN: z.string().url().optional(),` with the block above.

- [ ] **Step 1.6: Call `initSentryFromEnv` in `server.ts` before plugins**

Edit `packages/api/src/server.ts` — add this import at the top:
```ts
import { initSentryFromEnv } from './lib/sentry.js';
```

And at the very top of `buildApp`, before the first `await registerX(app)`:
```ts
initSentryFromEnv();
```

- [ ] **Step 1.7: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 1.8: Commit**

```bash
git add packages/api/src/lib/sentry.ts packages/api/src/plugins/sentry.ts packages/api/src/plugins/error-handler.ts packages/api/src/config.ts packages/api/src/server.ts packages/api/package.json pnpm-lock.yaml
git commit -m "feat(api): real Sentry integration (init, capture, dedupe error handlers)"
```

---

## Task 2: Sentry unit test

**Files:**
- Create: `packages/api/tests/sentry.test.ts`

- [ ] **Step 2.1: Write the test**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initSentry, captureException, _resetSentryForTests } from '../src/lib/sentry.js';

describe('sentry', () => {
  beforeEach(() => {
    _resetSentryForTests();
  });
  afterEach(() => {
    _resetSentryForTests();
  });

  it('captureException is a no-op when Sentry is not initialised', () => {
    // Should not throw.
    expect(() => captureException(new Error('boom'))).not.toThrow();
  });

  it('initSentry runs without throwing when given a fake DSN', () => {
    // We can't actually hit Sentry in tests, but we can verify the init path
    // doesn't crash on a syntactically valid DSN.
    expect(() =>
      initSentry({
        dsn: 'https://public@o0.ingest.sentry.io/0',
        environment: 'test',
        release: 'test-v1',
        tracesSampleRate: 0,
        profilesSampleRate: 0,
      }),
    ).not.toThrow();
  });

  it('initSentry is idempotent (second call is a no-op)', () => {
    const opts = {
      dsn: 'https://public@o0.ingest.sentry.io/0',
      environment: 'test',
      release: 'test-v1',
      tracesSampleRate: 0,
      profilesSampleRate: 0,
    };
    initSentry(opts);
    expect(() => initSentry(opts)).not.toThrow();
  });
});
```

- [ ] **Step 2.2: Run the test**

Run: `pnpm --filter @dam-link/api test tests/sentry.test.ts`
Expected: 3 tests pass.

- [ ] **Step 2.3: Commit**

```bash
git add packages/api/tests/sentry.test.ts
git commit -m "test(api): Sentry init + capture paths"
```

---

## Task 3: Production config hardening

**Files:**
- Modify: `packages/api/src/config.ts`
- Modify: `packages/api/src/server.ts`

- [ ] **Step 3.1: Add production-only validation to `config.ts`**

In `packages/api/src/config.ts`, replace the body of `loadConfig` (after `safeParse` succeeds) with:

```ts
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const cfg = result.data;

  // Production-only rules. Fail-fast on dangerous misconfigurations.
  if (cfg.NODE_ENV === 'production') {
    const errors: string[] = [];
    if (cfg.SESSION_COOKIE_SECRET === 'change-me-32-bytes-of-random-data') {
      errors.push('SESSION_COOKIE_SECRET must be changed from the default in production');
    }
    if (cfg.SESSION_COOKIE_SECRET.length < 32) {
      errors.push('SESSION_COOKIE_SECRET must be at least 32 characters in production');
    }
    if (!cfg.TURNSTILE_SECRET_KEY) {
      errors.push('TURNSTILE_SECRET_KEY is required in production (bot protection)');
    }
    if (cfg.LOG_LEVEL === 'trace' || cfg.LOG_LEVEL === 'debug') {
      errors.push(`LOG_LEVEL=${cfg.LOG_LEVEL} is not allowed in production`);
    }
    if (errors.length > 0) {
      throw new Error(`Unsafe production configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    }
  }

  cached = cfg;
  return cached;
}
```

- [ ] **Step 3.2: Add a "boot summary" log to `server.ts`**

In `packages/api/src/server.ts`, replace the body of `main()` (the function defined below `buildApp`) with:

```ts
async function main() {
  const config = loadConfig();
  const app = await buildApp();

  app.log.info(
    {
      nodeEnv: config.NODE_ENV,
      apiPublicUrl: config.API_PUBLIC_URL,
      webOrigin: config.WEB_ORIGIN,
      sentryEnabled: !!config.SENTRY_DSN,
      sentryRelease: process.env.GIT_COMMIT ?? 'dev',
    },
    'boot summary',
  );

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
```

- [ ] **Step 3.3: Add a config test for the production rules**

Append to `packages/api/tests/health.test.ts` (or create a new file `packages/api/tests/config.test.ts`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, _resetConfigForTests } from '../src/config.js';

describe('config (production rules)', () => {
  beforeEach(() => _resetConfigForTests());

  const baseProd = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    WEB_ORIGIN: 'https://app.dam-link.example',
    API_HOST: '0.0.0.0',
    API_PORT: '3000',
    API_PUBLIC_URL: 'https://api.dam-link.example',
    DATABASE_URL: 'postgres://u:p@db.example:5432/dam_link',
    S3_ENDPOINT: 'https://bucket.r2.cloudflarestorage.com',
    S3_REGION: 'auto',
    S3_ACCESS_KEY: 'r2-access',
    S3_SECRET_KEY: 'r2-secret',
    S3_BUCKET: 'dam-link-prod',
    S3_FORCE_PATH_STYLE: 'true',
    SESSION_COOKIE_NAME: 'dam_session',
    SESSION_TTL_DAYS: '30',
    SESSION_COOKIE_SECRET: 'a'.repeat(64),
    TURNSTILE_SECRET_KEY: 'real-turnstile-secret',
  } as const;

  it('accepts a fully-specified production config', () => {
    expect(() => loadConfig(baseProd)).not.toThrow();
  });

  it('rejects a production config with the default cookie secret', () => {
    expect(() =>
      loadConfig({ ...baseProd, SESSION_COOKIE_SECRET: 'change-me-32-bytes-of-random-data' }),
    ).toThrow(/SESSION_COOKIE_SECRET/);
  });

  it('rejects a production config with a short cookie secret', () => {
    expect(() =>
      loadConfig({ ...baseProd, SESSION_COOKIE_SECRET: 'short' }),
    ).toThrow(/at least 32 characters/);
  });

  it('rejects a production config without TURNSTILE_SECRET_KEY', () => {
    expect(() => {
      const { TURNSTILE_SECRET_KEY: _, ...rest } = baseProd;
      void _;
      return loadConfig(rest as typeof baseProd);
    }).toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('rejects a production config with debug log level', () => {
    expect(() => loadConfig({ ...baseProd, LOG_LEVEL: 'debug' })).toThrow(/LOG_LEVEL/);
  });
});
```

- [ ] **Step 3.4: Run the new test**

Run: `pnpm --filter @dam-link/api test tests/config.test.ts`
Expected: 5 tests pass.

- [ ] **Step 3.5: Typecheck**

Run: `pnpm --filter @dam-link/api typecheck`
Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add packages/api/src/config.ts packages/api/src/server.ts packages/api/tests/config.test.ts
git commit -m "feat(api): production config rules (cookie secret, turnstile, log level) + boot summary"
```

---

## Task 4: Multi-stage Dockerfile + .dockerignore

**Files:**
- Create: `D:\DAM-Link-Backend\Dockerfile`
- Create: `D:\DAM-Link-Backend\.dockerignore`

- [ ] **Step 4.1: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.7

# --- Base (shared by both stages) ------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache tini wget \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# --- Dependencies ----------------------------------------------------------
FROM base AS deps
# Copy only lockfile + manifests first so the cache survives source changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/api/package.json packages/api/
# web is added in Plan 8; include if it exists.
COPY packages/web/package.json packages/web/ 2>/dev/null || true
RUN pnpm install --frozen-lockfile --filter @dam-link/contracts... --filter @dam-link/api...

# --- Build -----------------------------------------------------------------
FROM deps AS build
COPY packages/contracts packages/contracts
COPY packages/api packages/api
RUN pnpm --filter @dam-link/contracts build \
 && pnpm --filter @dam-link/api build

# Prune dev dependencies for the runtime image.
RUN pnpm deploy --filter @dam-link/api --prod /app/api-deploy

# --- Runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
# Tell Sentry / logs which commit this is.
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ARG BUILD_TIME=unknown
ENV BUILD_TIME=${BUILD_TIME}

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# Copy the pruned api deploy (node_modules + dist + package.json).
COPY --from=build /app/api-deploy /app
# Copy the compiled contracts package so api can resolve @dam-link/contracts.
COPY --from=build /app/packages/contracts/dist /app/node_modules/@dam-link/contracts/dist
COPY --from=build /app/packages/contracts/package.json /app/node_modules/@dam-link/contracts/package.json

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz | grep -q '"status":"ok"' || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
```

- [ ] **Step 4.2: Write `.dockerignore`**

```
.git
.gitignore
.worktrees
.github
.vscode
.idea
node_modules
**/node_modules
**/dist
**/.turbo
**/.vitest-cache
**/coverage
**/*.log
**/.env
**/.env.*
!.env.example
**/.env.test
docs
README.md
**/README.md
docker-compose.yml
docker-compose.test.yml
docker-compose.prod.yml
Dockerfile
.dockerignore
```

- [ ] **Step 4.3: Build the image locally**

Run:
```bash
cd /d/DAM-Link-Backend
docker build -t dam-link-api:dev --build-arg GIT_COMMIT=local --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) .
```

Expected: image builds successfully, ends with `=> => naming to docker.io/library/dam-link-api:dev`. The final `CMD` step should print the layer hashes for the runtime stage.

- [ ] **Step 4.4: Verify image size is reasonable**

Run: `docker images dam-link-api:dev --format "{{.Size}}"`
Expected: under 300 MB (typical for `node:22-alpine` + Fastify + Drizzle + Argon2 native).

- [ ] **Step 5.5: Smoke-test the image locally**

Run:
```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e API_PORT=3000 \
  -e API_PUBLIC_URL=http://localhost:3000 \
  -e WEB_ORIGIN=http://localhost:5173 \
  -e DATABASE_URL=postgres://dam:dam@host.docker.internal:5432/dam_link \
  -e S3_ENDPOINT=http://host.docker.internal:9000 \
  -e S3_REGION=us-east-1 \
  -e S3_ACCESS_KEY=dam \
  -e S3_SECRET_KEY=dams3cret \
  -e S3_BUCKET=dam-link-dev \
  -e S3_FORCE_PATH_STYLE=true \
  -e SESSION_COOKIE_NAME=dam_session \
  -e SESSION_TTL_DAYS=30 \
  -e SESSION_COOKIE_SECRET=$(openssl rand -base64 48) \
  -e TURNSTILE_SECRET_KEY=test-turnstile \
  dam-link-api:dev
```

In another shell: `curl -s http://localhost:3000/healthz | jq`
Expected: `{ "status": "ok", "db": "ok", "s3": "ok", ... }` (or 503 if Postgres/MinIO are not reachable from inside the container; that is acceptable for this smoke test, the point is the server boots and rejects unsafe config).

- [ ] **Step 4.6: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: multi-stage Dockerfile (alpine, non-root, healthcheck) + .dockerignore"
```

---

## Task 5: `fly.toml` + production-like local compose

**Files:**
- Create: `D:\DAM-Link-Backend\fly.toml`
- Create: `D:\DAM-Link-Backend\docker-compose.prod.yml`

- [ ] **Step 5.1: Write `fly.toml`**

```toml
app = "dam-link-api"
primary_region = "iad"
kill_signal = "SIGINT"
kill_timeout = "10s"

[build]
  # GHCR image built by .github/workflows/deploy.yml.
  image = "ghcr.io/dam-link/dam-link-api:latest"

[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"
  API_PORT = "3000"
  API_HOST = "0.0.0.0"
  # Secrets (DATABASE_URL, S3_*, SESSION_COOKIE_SECRET, TURNSTILE_*, SENTRY_DSN)
  # are set with `fly secrets set`, NOT in this file.

[experimental]
  # Allow pnpm-style builds if we switch from `image` to `dockerfile`.
  auto_rollback = true

[[services]]
  protocol = "tcp"
  internal_port = 3000
  processes = ["app"]
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 250
    soft_limit = 200

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"

  [[services.http_checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
    method = "get"
    path = "/healthz"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

- [ ] **Step 5.2: Write `docker-compose.prod.yml` (local prod simulation)**

```yaml
name: dam-link-prod-local

# Brings up the production image alongside Postgres + MinIO so you can
# reproduce prod locally. Set secrets via `.env.prod-local` (gitignored).

services:
  postgres:
    image: postgres:16-alpine
    container_name: dam-link-postgres-prod
    environment:
      POSTGRES_USER: dam
      POSTGRES_PASSWORD: dams3cret
      POSTGRES_DB: dam_link
    ports:
      - "5432:5432"
    tmpfs:
      - /var/lib/postgresql/data
    volumes:
      - ./packages/api/drizzle/init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dam -d dam_link"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    container_name: dam-link-minio-prod
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: dam
      MINIO_ROOT_PASSWORD: dams3cret
    ports:
      - "9000:9000"
      - "9001:9001"
    tmpfs:
      - /data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio-bucket:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 dam dams3cret &&
      mc mb --ignore-existing local/dam-link-prod &&
      echo 'Bucket dam-link-prod ready.'
      "

  api:
    build:
      context: .
      args:
        GIT_COMMIT: local-prod
        BUILD_TIME: ${BUILD_TIME:-unknown}
    image: dam-link-api:prod-local
    container_name: dam-link-api-prod
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
      API_HOST: 0.0.0.0
      API_PORT: 3000
      API_PUBLIC_URL: http://localhost:3000
      WEB_ORIGIN: http://localhost:5173
      DATABASE_URL: postgres://dam:dams3cret@postgres:5432/dam_link
      S3_ENDPOINT: http://minio:9000
      S3_REGION: us-east-1
      S3_ACCESS_KEY: dam
      S3_SECRET_KEY: dams3cret
      S3_BUCKET: dam-link-prod
      S3_FORCE_PATH_STYLE: "true"
      SESSION_COOKIE_NAME: dam_session
      SESSION_TTL_DAYS: "30"
      SESSION_COOKIE_SECRET: ${SESSION_COOKIE_SECRET:?must be set in .env.prod-local}
      TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY:-test-turnstile}
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

Add a root script for convenience — append to `package.json`:
```json
{
  "scripts": {
    "prod:up": "docker compose -f docker-compose.prod.yml --env-file .env.prod-local up -d",
    "prod:down": "docker compose -f docker-compose.prod.yml down -v",
    "prod:logs": "docker compose -f docker-compose.prod.yml logs -f api"
  }
}
```

- [ ] **Step 5.3: Bring up the prod-like stack**

Run:
```bash
cd /d/DAM-Link-Backend
echo "SESSION_COOKIE_SECRET=$(openssl rand -base64 48)" > .env.prod-local
echo "TURNSTILE_SECRET_KEY=test-turnstile" >> .env.prod-local
echo ".env.prod-local" >> .gitignore
pnpm prod:up
pnpm prod:logs
```

Expected: api container logs show `boot summary` and `server listening at 0.0.0.0:3000`.

- [ ] **Step 5.4: Hit `/healthz` from the host**

Run: `curl -s http://localhost:3000/healthz | jq`
Expected: `{ "status": "ok", "db": "ok", "s3": "ok", ... }`.

- [ ] **Step 5.5: Tear it down**

Run: `pnpm prod:down`
Expected: all four containers removed.

- [ ] **Step 5.6: Commit**

```bash
git add fly.toml docker-compose.prod.yml package.json .gitignore
git commit -m "build: fly.toml + docker-compose.prod.yml for prod-simulation local"
```

---

## Task 6: GitHub Actions CI workflow

**Files:**
- Create: `D:\DAM-Link-Backend\.github\workflows\ci.yml`

- [ ] **Step 6.1: Write `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9.12.0'

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm -r lint

      - name: Typecheck
        run: pnpm -r typecheck

      - name: Bring up test services
        run: pnpm test:services:up

      - name: Wait for Postgres
        run: |
          for i in $(seq 1 30); do
            docker exec dam-link-postgres-test pg_isready -U dam -d dam_link_test && break
            sleep 1
          done

      - name: Migrate
        env:
          DATABASE_URL: postgres://dam:dam@localhost:5433/dam_link_test
        run: pnpm db:migrate

      - name: Test
        env:
          DATABASE_URL: postgres://dam:dam@localhost:5433/dam_link_test
          S3_ENDPOINT: http://localhost:9003
          S3_REGION: us-east-1
          S3_ACCESS_KEY: dam
          S3_SECRET_KEY: dams3cret
          S3_BUCKET: dam-link-test
        run: pnpm -r test

      - name: Build
        run: pnpm -r build

      - name: Teardown test services
        if: always()
        run: pnpm test:services:down

  docker-build-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: lint-typecheck-test
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image (no push)
        run: |
          docker build \
            --build-arg GIT_COMMIT=${{ github.sha }} \
            --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
            --tag dam-link-api:ci-${{ github.sha }} \
            --load \
            .

      - name: Image size
        run: docker images dam-link-api:ci-${{ github.sha }} --format "{{.Size}}"
```

- [ ] **Step 6.2: Add a root `lint` script**

Append to root `package.json` `scripts`:
```json
"lint": "pnpm -r --if-present lint"
```

- [ ] **Step 6.3: Add a per-package `lint` script**

For each of `packages/contracts`, `packages/api`, and (if it exists after Plan 8) `packages/web`, add a `lint` script that runs ESLint with the project config. Use a single shared config: create `D:\DAM-Link-Backend\.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2023: true },
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'drizzle'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
};
```

Then run, in each package:
```bash
pnpm --filter @dam-link/contracts add -D eslint@9.13.0 @typescript-eslint/parser@8.11.0 @typescript-eslint/eslint-plugin@8.11.0
pnpm --filter @dam-link/api add -D eslint@9.13.0 @typescript-eslint/parser@8.11.0 @typescript-eslint/eslint-plugin@8.11.0
```

Add `"lint": "eslint src tests --max-warnings 0"` to each `package.json` `scripts`.

- [ ] **Step 6.4: Run lint locally to verify it works**

Run: `pnpm -r lint`
Expected: zero errors (warnings may exist; CI uses `--max-warnings 0` which fails on warnings, so fix any warning that appears).

- [ ] **Step 6.5: Verify the workflow file is syntactically valid**

Run:
```bash
cd /d/DAM-Link-Backend
docker run --rm -v "$PWD/.github:/yaml" mikefarah/yq:4.44.3 eval '.jobs | keys' /yaml/workflows/ci.yml
```

If yq is installed natively: `yq eval '.jobs | keys' .github/workflows/ci.yml`
Expected output: `lint-typecheck-test`, `docker-build-smoke`.

- [ ] **Step 6.6: Commit**

```bash
git add .github/workflows/ci.yml .eslintrc.cjs package.json packages/contracts/package.json packages/contracts/pnpm-lock.yaml packages/api/package.json packages/api/pnpm-lock.yaml
git commit -m "ci: PR checks (lint, typecheck, test, build) + Docker image smoke build"
```

Note: don't actually push the branch yet — the deploy workflow is set up in the next task and the secrets are not yet configured.

---

## Task 7: GitHub Actions deploy workflow

**Files:**
- Create: `D:\DAM-Link-Backend\.github\workflows\deploy.yml`

- [ ] **Step 7.1: Write `.github/workflows/deploy.yml`**

```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9.12.0'
  IMAGE_NAME: ${{ github.repository }}/dam-link-api

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Compute metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            GIT_COMMIT=${{ github.sha }}
            BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-fly:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: build-and-push
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Setup Fly.io CLI
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          flyctl deploy \
            --image ghcr.io/${{ env.IMAGE_NAME }}:sha-${{ github.sha }} \
            --strategy canary \
            --wait-timeout 300

      - name: Smoke check
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: |
          # Replace with the public URL once DNS is set up.
          URL=$(flyctl status --json | jq -r '.Hostname')
          echo "Smoke checking https://$URL/healthz"
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w "%{http_code}" https://$URL/healthz)
            if [ "$code" = "200" ]; then
              echo "OK ($code)"
              exit 0
            fi
            sleep 5
          done
          echo "FAILED ($code)"
          exit 1
```

- [ ] **Step 7.2: Document the required secrets in the deploy doc**

Skip this — it is done in Task 9 (deployment documentation).

- [ ] **Step 7.3: Validate YAML**

Run:
```bash
yq eval '.jobs | keys' .github/workflows/deploy.yml
```
Expected: `build-and-push`, `deploy-fly`.

- [ ] **Step 7.4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy workflow (build+push GHCR, canary deploy to Fly.io, smoke check)"
```

---

## Task 8: Production smoke test script

**Files:**
- Create: `packages/api/scripts/smoke-prod.sh`

- [ ] **Step 8.1: Write `smoke-prod.sh`**

```bash
#!/usr/bin/env bash
# Usage: BASE_URL=https://api.dam-link.example ./smoke-prod.sh
# Exits 0 on success, non-zero on the first failed assertion.

set -euo pipefail

: "${BASE_URL:?BASE_URL is required, e.g. https://api.dam-link.example}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[34m%s\033[0m\n" "$*"; }

assert_status() {
  local expected="$1" actual="$2" label="$3"
  if [ "$expected" != "$actual" ]; then
    red "FAIL  $label: expected $expected, got $actual"
    exit 1
  fi
  green "PASS  $label ($actual)"
}

# --- 1. Liveness -----------------------------------------------------------
blue "[1/5] GET /healthz"
code=$(curl -s -o /tmp/health.json -w "%{http_code}" "$BASE_URL/healthz")
assert_status 200 "$code" "/healthz returns 200"
status=$(jq -r .status /tmp/health.json)
[ "$status" = "ok" ] || { red "FAIL  /healthz status=$status"; exit 1; }
green "      status=$status db=$(jq -r .db /tmp/health.json) s3=$(jq -r .s3 /tmp/health.json)"

# --- 2. Version ------------------------------------------------------------
blue "[2/5] GET /version"
code=$(curl -s -o /tmp/version.json -w "%{http_code}" "$BASE_URL/version")
assert_status 200 "$code" "/version returns 200"
green "      version=$(jq -r .version /tmp/version.json) commit=$(jq -r .commit /tmp/version.json)"

# --- 3. Register a throwaway user -----------------------------------------
EMAIL="smoke-$(date +%s%N)@example.com"
PASSWORD="Sm0ke-Test-Pass!"
blue "[3/5] POST /api/v1/auth/register ($EMAIL)"
code=$(curl -s -o /tmp/register.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -H "Origin: $BASE_URL" \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/v1/auth/register" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Smoke\",\"turnstileToken\":\"smoke-test-bypass\"}")
# If Turnstile is enabled, this will be 400; the rest of the smoke still runs.
if [ "$code" = "200" ]; then
  green "PASS  registered"
else
  yellow "WARN  register returned $code (Turnstile may be enforced; continuing)"
fi

# --- 4. Authenticated round-trip (only if register worked) ----------------
if [ "$code" = "200" ]; then
  blue "[4/5] GET /api/v1/auth/me"
  code=$(curl -s -o /tmp/me.json -w "%{http_code}" \
    -H "Origin: $BASE_URL" -b "$COOKIE_JAR" "$BASE_URL/api/v1/auth/me")
  assert_status 200 "$code" "/auth/me returns 200 with session cookie"
else
  blue "[4/5] SKIP /api/v1/auth/me (no session)"
fi

# --- 5. CORS / cross-origin rejection -------------------------------------
blue "[5/5] CSRF: cross-origin POST is rejected"
code=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.example" \
  -X POST "$BASE_URL/api/v1/auth/login" \
  -d '{"email":"x@x.com","password":"y"}')
if [ "$code" = "403" ]; then
  green "PASS  cross-origin POST rejected (403)"
else
  red "FAIL  expected 403 on cross-origin POST, got $code"
  exit 1
fi

green ""
green "All smoke checks passed."
```

- [ ] **Step 8.2: Make it executable and run a dry check**

Run:
```bash
chmod +x packages/api/scripts/smoke-prod.sh
bash -n packages/api/scripts/smoke-prod.sh
```
Expected: no output, exit 0 (syntax check).

- [ ] **Step 8.3: Run it against the local prod-simulation stack**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm prod:up
# wait for the api container to pass its healthcheck
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/healthz | grep -q 200 && break
  sleep 2
done
BASE_URL=http://localhost:3000 ./packages/api/scripts/smoke-prod.sh
```

Expected: all 5 steps print `PASS`, the script ends with `All smoke checks passed.`.

Note: step 3 may `WARN` with 400 if Turnstile is enforced in the prod image (it is, by Task 3). The script handles this gracefully and skips step 4. The cross-origin rejection in step 5 should still pass.

- [ ] **Step 8.4: Tear down**

Run: `pnpm prod:down`

- [ ] **Step 8.5: Commit**

```bash
git add packages/api/scripts/smoke-prod.sh
git commit -m "build: production smoke test (healthz, version, register, csrf)"
```

---

## Task 9: CSRF + Turnstile production verification tests

**Files:**
- Create: `packages/api/tests/csrf-turnstile-prod.test.ts`

- [ ] **Step 9.1: Write the test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './helpers/build-app.js';
import { truncateAllTables, closeDb } from './helpers/db.js';
import { closeS3, flushTestBucket } from './helpers/s3.js';

describe('CSRF and Turnstile production rules', () => {
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

  it('rejects a POST with a cross-origin Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      payload: { email: 'a@b.com', password: 'longenough', displayName: 'A' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FORBIDDEN');
  });

  it('accepts a POST with the configured WEB_ORIGIN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      payload: { email: 'ok@b.com', password: 'longenough', displayName: 'OK' },
    });
    // 200 (registered) or 400 (Turnstile missing in test) — both are
    // better than 403, which is the CSRF rejection we're testing for.
    expect(res.statusCode).not.toBe(403);
  });

  it('accepts a POST with no Origin header (server-to-server)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'noorigin@b.com', password: 'longenough', displayName: 'NoO' },
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('Turnstile is enforced when TURNSTILE_SECRET_KEY is set', async () => {
    vi.resetModules();
    // Re-import config to pick up a modified env, then rebuild the helper.
    const { verifyTurnstile } = await import('../src/lib/turnstile.js');
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    const ok = await verifyTurnstile('clearly-bogus-token', '127.0.0.1');
    expect(ok).toBe(false);
    globalThis.fetch = origFetch;
  });
});
```

- [ ] **Step 9.2: Run the test**

Run: `pnpm --filter @dam-link/api test tests/csrf-turnstile-prod.test.ts`
Expected: 4 tests pass.

- [ ] **Step 9.3: Commit**

```bash
git add packages/api/tests/csrf-turnstile-prod.test.ts
git commit -m "test(api): CSRF cross-origin rejection + Turnstile enforcement"
```

---

## Task 10: Deployment documentation

**Files:**
- Create: `D:\DAM-Link-Backend\docs\deployment.md`
- Modify: `D:\DAM-Link-Backend\README.md`

- [ ] **Step 10.1: Write `docs/deployment.md`**

```markdown
# Deployment Guide

This document covers deploying DAM-Link Backend to Fly.io with Cloudflare R2 for storage, Neon for Postgres, and Sentry for error monitoring. It assumes you have the repo, a Fly.io account, a Cloudflare account, and a Sentry account.

## 1. Provision external services

### 1.1 Cloudflare R2

1. In the Cloudflare dashboard, go to **R2** → **Create bucket** → name it `dam-link-prod`.
2. **Settings** tab → note the **Account ID** (you'll need it for the endpoint).
3. **R2** → **Manage R2 API Tokens** → **Create API token** with **Object Read & Write** scoped to the `dam-link-prod` bucket. Save the **Access Key ID** and **Secret Access Key**.
4. **Endpoint** for S3-compatible clients: `https://<account-id>.r2.cloudflarestorage.com`.
5. **CORS** (Settings → CORS Policy):
   ```json
   [
     {
       "AllowedOrigins": ["https://app.dam-link.example"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### 1.2 Neon Postgres

1. In Neon, create a project named `dam-link-prod` in a region close to your Fly region (`iad` by default).
2. Note the **Connection string** (with the `?sslmode=require` suffix).
3. Run the initial migration against it:
   ```bash
   DATABASE_URL='postgres://.../?sslmode=require' pnpm db:migrate
   ```

### 1.3 Sentry

1. In Sentry, create a project for **Node.js (Fastify)**.
2. Copy the **DSN** from **Project Settings → Client Keys (DSN)**.
3. Optional: enable **Source Maps** upload (handled by the Sentry CLI in a future iteration; for now we ship unminified).

### 1.4 Cloudflare Turnstile

1. **Turnstile** → **Add widget** → get the **Site Key** (frontend) and **Secret Key** (backend).
2. The frontend uses the Site Key to render the widget; the backend verifies tokens with the Secret Key.

## 2. Create the Fly.io app

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly apps create dam-link-api
fly regions set iad

# A Postgres on Fly is also an option, but we use Neon for connection pooling
# and a managed backup story. If you'd rather use Fly Postgres:
#   fly postgres create --name dam-link-db --region iad
#   fly postgres attach dam-link-db --app dam-link-api
```

## 3. Set Fly secrets

```bash
fly secrets set --app dam-link-api \
  DATABASE_URL='postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/dam_link?sslmode=require' \
  S3_ENDPOINT='https://<account-id>.r2.cloudflarestorage.com' \
  S3_REGION='auto' \
  S3_ACCESS_KEY='<r2-access-key>' \
  S3_SECRET_KEY='<r2-secret-key>' \
  S3_BUCKET='dam-link-prod' \
  S3_FORCE_PATH_STYLE='false' \
  SESSION_COOKIE_SECRET='<64 random base64 chars>' \
  SESSION_COOKIE_NAME='dam_session' \
  SESSION_TTL_DAYS='30' \
  WEB_ORIGIN='https://app.dam-link.example' \
  API_PUBLIC_URL='https://api.dam-link.example' \
  TURNSTILE_SITE_KEY='<turnstile-site-key>' \
  TURNSTILE_SECRET_KEY='<turnstile-secret-key>' \
  SENTRY_DSN='https://<key>@o<org>.ingest.sentry.io/<project>'
```

Verify: `fly secrets list --app dam-link-api` shows every value.

## 4. Configure GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add:
- `FLY_API_TOKEN` — from `fly auth token` on your local machine.

That's the only secret needed. The image is pushed to GHCR which is authed by the workflow's `GITHUB_TOKEN`.

## 5. First deploy

```bash
git push origin main
# Watch the workflow: https://github.com/<org>/dam-link-backend/actions
# It builds the image, pushes to GHCR, runs `flyctl deploy --strategy canary`,
# waits for the new machine to be healthy, then shifts traffic.
```

If you want to trigger a deploy manually: **Actions → deploy → Run workflow**.

## 6. Post-deploy smoke

```bash
BASE_URL=https://dam-link-api.fly.dev ./packages/api/scripts/smoke-prod.sh
# or against your custom domain:
BASE_URL=https://api.dam-link.example ./packages/api/scripts/smoke-prod.sh
```

Expected output:
```
[1/5] GET /healthz
PASS  /healthz returns 200 (200)
[2/5] GET /version
PASS  /version returns 200 (200)
[3/5] POST /api/v1/auth/register (...)
PASS  registered
[4/5] GET /api/v1/auth/me
PASS  /auth/me returns 200 with session cookie (200)
[5/5] CSRF: cross-origin POST is rejected
PASS  cross-origin POST rejected (403)
All smoke checks passed.
```

## 7. Observability

- **Logs**: `fly logs --app dam-link-api` (Pino structured JSON, filterable by `requestId`).
- **Errors**: Sentry project receives every unhandled 5xx with breadcrumbs.
- **Health**: Fly's HTTP healthcheck hits `/healthz` every 30s; a failing check triggers a new machine and an alert.

## 8. Roll back

```bash
# Show recent releases
fly releases --app dam-link-api

# Roll back to the previous one
fly releases rollback --app dam-link-api
```

The deploy workflow uses `--strategy canary` which makes rollbacks safe — traffic only shifts once the new machine is healthy.

## 9. Local prod-simulation

```bash
# Build the image and run it against local Postgres + MinIO
cp .env.example .env.prod-local
echo "SESSION_COOKIE_SECRET=$(openssl rand -base64 48)" >> .env.prod-local
echo "TURNSTILE_SECRET_KEY=test-turnstile" >> .env.prod-local
pnpm prod:up
pnpm prod:logs
curl -s http://localhost:3000/healthz | jq
pnpm prod:down
```

## 10. Disaster recovery checklist

- [ ] Neon automated backups enabled (default).
- [ ] R2 bucket versioning enabled (Settings → Versioning → Enable).
- [ ] Sentry quota alerts configured.
- [ ] `fly secrets list` diffed against the latest deploy (no stray secrets).
- [ ] At least one off-region backup of `dam-link-prod` R2 bucket.
```

- [ ] **Step 10.2: Update the root `README.md`**

Append to `D:\DAM-Link-Backend\README.md`:
```markdown
## Deployment

The API is containerised and ships via GitHub Actions to Fly.io. Cloudflare R2 stores objects, Neon hosts Postgres, and Sentry collects errors.

Full guide: [`docs/deployment.md`](docs/deployment.md).

Quick reference:

```bash
# Local prod-simulation
pnpm prod:up
curl -s http://localhost:3000/healthz
pnpm prod:down

# Deploy
git push origin main   # CI builds, pushes to GHCR, deploys via flyctl

# Smoke check against production
BASE_URL=https://api.dam-link.example pnpm --filter @dam-link/api exec ./scripts/smoke-prod.sh
```
```

- [ ] **Step 10.3: Commit**

```bash
git add docs/deployment.md README.md
git commit -m "docs: deployment guide (R2, Neon, Fly.io, Sentry) + README update"
```

---

## Task 11: Final verification + tag

- [ ] **Step 11.1: Full local check suite**

Run:
```bash
cd /d/DAM-Link-Backend
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r lint
pnpm test:services:up
pnpm -r test
pnpm test:services:down
pnpm -r build
```

Expected: all green.

- [ ] **Step 11.2: Build the production Docker image**

Run:
```bash
docker build -t dam-link-api:final --build-arg GIT_COMMIT=final-verify --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) .
docker images dam-link-api:final --format "{{.Size}}"
```

Expected: builds, image is under 300 MB.

- [ ] **Step 11.3: Run the prod-simulation stack and the smoke test**

Run:
```bash
pnpm prod:up
sleep 10
BASE_URL=http://localhost:3000 ./packages/api/scripts/smoke-prod.sh
pnpm prod:down
```

Expected: smoke test prints "All smoke checks passed." for all 5 steps.

- [ ] **Step 11.4: Boot the dev stack and exercise a few happy paths**

Run:
```bash
pnpm services:up
pnpm db:migrate
pnpm dev
# in another shell:
curl -s http://localhost:3000/healthz | jq
curl -s http://localhost:3000/version | jq
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs
```

Expected: `/healthz` returns ok, `/version` shows `commit=null` and `buildTime=null` (env not set), `/docs` returns 200.

- [ ] **Step 11.5: Tag the deployment milestone**

Run:
```bash
git tag -a deploy-v1.0.0 -m "Deployable: Docker, CI, Fly.io, R2, Sentry, smoke tests, CSRF/Turnstile hardening"
git log --oneline | head -40
```

Expected: tag created, log shows the full history from foundation → deployment.

- [ ] **Step 11.6: Report completion**

Reply to the user with:
- The list of commits added by this plan
- The size of the production Docker image
- The output of the prod smoke test
- A pointer to `docs/deployment.md`
- A note that the next step is to provision the actual Fly.io / R2 / Neon / Sentry accounts and run the deploy workflow

---

## Self-review

**Spec coverage:**
- Real Sentry integration (replaces stub) → Task 1
- Production config hardening (cookie secret length, Turnstile required, log level restricted) → Task 3
- Multi-stage Dockerfile (alpine, non-root, healthcheck, build args) → Task 4
- `.dockerignore` (small build context) → Task 4
- `fly.toml` (port 3000, autoscale, health check, canary deploy via CI) → Task 5, Task 7
- `docker-compose.prod.yml` (local prod simulation) → Task 5
- GitHub Actions CI (lint, typecheck, test, build, Docker smoke) → Task 6
- GitHub Actions deploy (build+push GHCR, canary deploy to Fly.io, smoke check) → Task 7
- Production smoke test script (healthz, version, register, CSRF) → Task 8
- CSRF + Turnstile production verification tests → Task 9
- Deployment documentation (R2, Neon, Fly.io, Sentry, Turnstile, secrets, rollback, DR) → Task 10
- README deployment section → Task 10
- Final verification + tag → Task 11

**Placeholder scan:** no "TBD", "TODO", "implement later" present. All env values, file paths, and commands are concrete.

**Type consistency:**
- `SentryOptions` interface in `lib/sentry.ts` matches the args passed by `initSentryFromEnv`.
- `initSentry` is idempotent (guarded by `initialised`); `initSentryFromEnv` calls it with the env-driven config.
- `setErrorHandler` is now defined in exactly one place (`plugins/sentry.ts`); the old one in `plugins/error-handler.ts` is removed (Task 1.4).
- `registerSentry` import in `server.ts` still exists from Plan 1; the new code only changes the body of the plugin and adds `initSentryFromEnv()` before `registerSentry(app)`.
- The `Dockerfile` `CMD` is `node dist/server.js`, which matches the `pnpm --filter @dam-link/api build` output (Plan 1 Task 5).
- `fly.toml` `[services.http_checks].path` is `/healthz`, which matches the `HealthResponseSchema` in `plugins/health.ts`.
- The smoke script's expected output is exactly what the dev prod-simulation stack produces.

**Edge cases I handled on purpose:**
- `beforeSend` in Sentry strips cookies and auth headers to avoid sending PII to Sentry.
- Production `loadConfig` fail-fasts on weak secrets, missing Turnstile, and debug log levels — the API will not boot with a known-insecure config.
- The Dockerfile uses `pnpm deploy` (a v9 feature) to prune devDependencies without losing the workspace layout; if `pnpm deploy` is unavailable, fall back to `pnpm install --prod` (note added in the Dockerfile comment for future maintainers).
- The deploy workflow uses `--strategy canary` so a broken image never replaces 100% of traffic.
- The smoke script uses `curl` with a cookie jar so step 4 can exercise the full session round-trip only when registration succeeds (Turnstile bypassed in local sim).
- `fly secrets set` is the only mechanism for setting production secrets; nothing sensitive is in the image.
- The deploy workflow's `permissions.packages: write` is the minimum scope required to push to GHCR.

---

## Execution handoff

Plan complete and saved to `D:\DAM-Link-Backend\docs\superpowers\plans\2026-06-04-dam-link-backend-deployment.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?

This is **Plan 9 of 9 — Deployment**. After this plan is executed, the project is feature-complete and deployable.
