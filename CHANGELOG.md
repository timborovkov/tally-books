# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Next.js 16 (App Router) + TypeScript (strict, with `noUncheckedIndexedAccess` and friends).
- Tailwind v4 with shadcn/ui base setup (`Button`, `Input`, `cn` utility, slate theme tokens).
- Strict ESLint flat config (Next core-web-vitals + TypeScript, unused-imports, prettier-compat).
- Prettier with Tailwind class sorting.
- Knip for dead code / unused dependency detection.
- Vitest with jsdom + Testing Library, sample test for `cn`.
- GitHub Actions CI: parallel lint, typecheck, knip, unit, integration jobs.
- Husky pre-push hook running lint-staged on the diff being pushed.
- MIT license, contributor guide, GitHub issue + PR templates.
- Multi-stage Dockerfile (deps → build → runtime, distroless-friendly).
- `docker-compose.yml` for local dev (`app`, `postgres`, `minio`, `qdrant`) — also serves as the infra-shape reference for self-hosters.
- `.env.example` covering only env vars wired in this PR (app port + the compose-managed Postgres, MinIO, Qdrant containers). Future feature PRs add their own keys alongside the code that reads them.
- Typed environment loading via `src/lib/env.ts` (zod-validated, fail-fast at startup through `src/instrumentation.ts`).
- `/api/health` and `/api/ready` endpoints.
- `robots.txt` disallow-all + `X-Robots-Tag: noindex` headers (no search engine indexing).
- Drizzle ORM + drizzle-kit wired up against Postgres (postgres.js driver, cuid2 ids).
- Initial schema: shared enums (`thing_state`, `actor_kind`, `thing_type`, `user_role`, `resource_type`, `access_level`), IAM tables (`users` with the 2FA CHECK constraint, `sessions`, `invites`, `permissions`), and versioning primitives (`edit_sessions` with one-editor-per-Thing UNIQUE, `audit_log`).
- `versionedColumns()` helper exported for the next versioned-Thing PR; `current_version_id` deferred until then.
- Scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`. Idempotent admin-user seed.
- Real `pnpm test:integration` suite: schema smoke test that asserts enums, tables, named indexes, partial WHERE clauses, the 2FA CHECK rejection, and `edit_sessions` uniqueness against the live Postgres service.
- **Cross-cutting foundation (v0.1 pass):**
  - UTC-only date helpers in `src/lib/dates.ts` (`nowUtc`, `formatUtcDate`, `formatUtcDateTime`, `startOfUtcDay`, `endOfUtcDay`, `parseUtcDate`). ESLint `no-restricted-syntax` rule bans `toLocale*` and `Date.now()` outside this module.
  - Sentry wired via `@sentry/nextjs` for browser, Node, and edge runtimes. DSN-driven off-switch (empty DSN ⇒ `enabled: false`); local dev ships with blank DSNs. `global-error.tsx` plus a segment-level `(app)/error.tsx` both capture to Sentry.
  - Dockerfile build stage takes `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` as build args and `SENTRY_AUTH_TOKEN` as a BuildKit secret, so source maps upload during `docker build` without baking the token into the image.
  - App shell under a new `(app)` route group: `TopNav` (search + quick-add), `Sidebar` (eight primary sections), `AppShell`. Dashboard landing renders placeholder overview cards + a matching `DashboardSkeleton` via `loading.tsx`.
  - Quick-add `+` modal with four stub actions (new expense, upload receipt, new invoice draft, new trip). Real routing wires in v0.2+.
  - Reusable `Skeleton` primitive and `ErrorFallback` component; `docs/architecture/ui-conventions.md` codifies when to use each.
  - New docs: `docs/architecture/dates.md`, `docs/architecture/sentry.md`, `docs/architecture/ui-conventions.md`.
  - Meaningful tests for every new surface (date helpers + TZ invariance, Sentry-disabled guard, robots.txt content, `next.config` headers, skeleton a11y, error fallback retry, app-shell landmarks, quick-add dialog open/close/select).
