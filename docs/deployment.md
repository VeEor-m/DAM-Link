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
