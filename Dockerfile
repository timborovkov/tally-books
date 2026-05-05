# syntax=docker/dockerfile:1.7
# Multi-stage build for Tally (Next.js standalone)

ARG NODE_VERSION=20.18-alpine
ARG PNPM_VERSION=10.33.0

# ─── deps ───────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
ARG PNPM_VERSION
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
# HUSKY=0 disables the husky lifecycle script during install: there's no
# git or .husky/ in the build context, and we don't need git hooks in
# the final image anyway.
RUN HUSKY=0 pnpm install --frozen-lockfile --prod=false

# ─── prod-deps ──────────────────────────────────────────────────────────────────
# A node_modules tree with only production deps, used by the runtime
# image. Two consumers depend on this:
#   1. tsx-driven scripts (migrations + the pg-boss worker) need to resolve
#      drizzle-orm, postgres, pg-boss, etc — Next 16 + turbopack inlines
#      these into the standalone trace's bundles rather than its
#      node_modules dir, so the standalone tree alone isn't enough.
#   2. The standalone bundles themselves contain hashed require shims under
#      `.next/node_modules/<pkg>-<hash>` that symlink into `.pnpm/...` —
#      so we keep pnpm's default isolated layout (don't hoist) and copy
#      the whole tree, preserving the relative symlinks.
FROM node:${NODE_VERSION} AS prod-deps
ARG PNPM_VERSION
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN HUSKY=0 pnpm install --frozen-lockfile --prod --ignore-scripts

# ─── build ──────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
ARG PNPM_VERSION
WORKDIR /app

RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ── Sentry build-time configuration ───────────────────────────────────────────
# NEXT_PUBLIC_SENTRY_* vars are inlined into the client bundle by Next.js, so
# they must be present at build time (that includes the master-enabled flag
# and all sampling rates — baked into the browser JS). SENTRY_AUTH_TOKEN (+
# ORG/PROJECT/URL) gate source-map upload — leave them unset to build an
# image without source maps.
#
# On Railway, just set these as service variables — Railway auto-passes
# matching ARGs as `--build-arg` to the Docker build.
# Standalone `docker build` works the same:
#   docker build \
#     --build-arg NEXT_PUBLIC_SENTRY_ENABLED=$NEXT_PUBLIC_SENTRY_ENABLED \
#     --build-arg NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
#     ... \
#     --build-arg SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
#     -t tally .
ARG NEXT_PUBLIC_SENTRY_ENABLED="false"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=""
ARG NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=""
ARG NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
ARG SENTRY_URL=""
ARG SENTRY_AUTH_TOKEN=""
ENV NEXT_PUBLIC_SENTRY_ENABLED=${NEXT_PUBLIC_SENTRY_ENABLED}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE}
ENV NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE}
ENV NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE}
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV SENTRY_URL=${SENTRY_URL}

ENV NEXT_TELEMETRY_DISABLED=1
# SENTRY_AUTH_TOKEN is consumed inline for this RUN only and never
# `ENV`-exported, so it doesn't reach the final runtime stage. (Railway's
# Metal builder doesn't accept BuildKit secret mounts, hence ARG instead
# of `--mount=type=secret`.) Note: ARG values *do* get recorded in this
# build-stage layer's metadata — readable via `docker history --no-trunc`
# on the intermediate image and via shared build caches / CI logs. The
# token is safe in the published runtime image, not in the build cache.
RUN SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" pnpm build

# ─── runtime ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# tsx is used for two things on Railway / managed hosts:
#   1. `tsx src/db/migrate.ts` — preDeployCommand on the web service. The SQL
#      files in src/db/migrations/ are read at runtime by the drizzle migrator.
#   2. `tsx src/lib/jobs/worker-entry.ts` — start command on the worker service.
# Installing globally with npm sidesteps pnpm's symlinked node_modules layout,
# which doesn't survive a plain Docker COPY.
RUN npm install -g tsx@4.21.0

COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Full standalone tree (server.js, package.json, .next/, plus any future
# root files Next adds — e.g. next.config.json in newer minors). The
# trace's own node_modules is partial under turbopack and conflicts with
# the prod-deps tree we COPY next, so wipe it first.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
RUN rm -rf ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prod node_modules (pnpm isolated layout). Copying the whole tree
# preserves the relative `<pkg> → .pnpm/<pkg>@<ver>/node_modules/<pkg>`
# symlinks pnpm creates, so the standalone bundle's hashed shims under
# `.next/node_modules/` (which point into `.pnpm/...`) still resolve.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Source tree for tsx to execute (migrate.ts + worker-entry.ts).
COPY --from=build --chown=nextjs:nodejs /app/src ./src
COPY --from=build --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
