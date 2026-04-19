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
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile --prod=false

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
# On Railway/Docker, pass via `--build-arg` (and the token via `--secret`):
#   docker build \
#     --build-arg NEXT_PUBLIC_SENTRY_ENABLED=$NEXT_PUBLIC_SENTRY_ENABLED \
#     --build-arg NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
#     --build-arg NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE \
#     --build-arg NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE \
#     --build-arg NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE=$NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE \
#     --build-arg NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
#     --build-arg SENTRY_ORG=$SENTRY_ORG \
#     --build-arg SENTRY_PROJECT=$SENTRY_PROJECT \
#     --build-arg SENTRY_URL=$SENTRY_URL \
#     --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
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
# SENTRY_AUTH_TOKEN passed via BuildKit secret so it isn't baked into the
# image or shown in `docker history`. The mount exposes it at /run/secrets/…
# only for the lifetime of this RUN command.
RUN --mount=type=secret,id=sentry_auth_token,required=false,target=/run/secrets/sentry_auth_token \
    if [ -s /run/secrets/sentry_auth_token ]; then \
      export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; \
    fi; \
    pnpm build

# ─── runtime ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
