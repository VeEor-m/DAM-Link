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
COPY packages/web/package.json packages/web/
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
