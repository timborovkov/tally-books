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

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

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
