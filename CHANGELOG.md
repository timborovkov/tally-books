# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Sentry fully env-driven: added `NEXT_PUBLIC_SENTRY_ENABLED` master toggle, per-runtime sampling rates (`*_TRACES_SAMPLE_RATE`, `*_REPLAYS_*_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`), `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, and `SENTRY_URL` for self-hosted / EU instances. Collapsed duplicate `SENTRY_DSN` into the single `NEXT_PUBLIC_SENTRY_DSN` (used across client + server + edge). Client vars now validated via new `src/lib/env.client.ts`. Node profiling wired via `@sentry/profiling-node`.

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
- **Design system (v0.1 pass):**
  - tweakcn **LogisticOne** palette applied in `src/app/globals.css` — full oklch token set for light + dark, sidebar palette, chart colors, shadow + tracking tokens.
  - 26 shadcn/ui components pre-installed (button, input, textarea, label, select, checkbox, radio-group, switch, form, card, dialog, sheet, dropdown-menu, popover, tabs, table, badge, avatar, separator, skeleton, tooltip, sonner, alert, breadcrumb, scroll-area, sidebar).
  - Light / dark / system mode via `next-themes` (`ThemeProvider` mounted in root layout, no-flash `disableTransitionOnChange`). `ModeToggle` dropdown with Sun / Moon / Monitor icons.
  - Reusable `<Logo />` component — `TALLY` wordmark in **Space Grotesk** 600 + optional tagline "Self-hosted finance for solo operators." Sizes `sm` / `md` / `lg` / `xl`.
  - Lucide-based `src/app/icon.svg` (App Router file-convention app icon) — stylized scale on navy rounded square.
  - `/design-system-demo` — standalone showcase route with its own `layout.tsx` so it does NOT inherit the future app shell; 12 sections cover brand, typography, color tokens, buttons, forms, data display, overlays, feedback, navigation, sidebar shell, status badges across all three taxonomies (**Thing state**: DRAFT / READY / FILED / UNDERLYING DATA CHANGED / AUTO-REFRESH LOCKED / IN PERIOD LOCK; **Intake queue**: NEW / NEEDS REVIEW / ROUTED / CONFIRMED / REJECTED; **Compliance task**: OPEN / DONE / SNOOZED / WAIVED), and icon library.
  - `DESIGN.md` — canonical design doc covering principles, brand, typography, color, spacing, motion, components, status vocabulary, accessibility, and component-addition workflow.
  - Knip configured to treat `components/logo.tsx`, `theme-provider.tsx`, and `mode-toggle.tsx` as entry points so pre-installed UI stays linted. ESLint relaxed for shadcn vendor files (`components/ui/**`, `hooks/use-mobile.ts`).
- Entities & jurisdictions slice (data-structure.md §5): tables `jurisdictions`, `entities`, `persons`, `entity_person_links`, `financial_periods`; enums `entity_kind`, `period_kind`; `numeric(7,4)` share-percent precision plus a `CHECK (share_percent BETWEEN 0 AND 100)` enforcing the business-rule ceiling; `archived_at` partial index for active entities; `entities_fy_start_month_range` CHECK; `financial_periods` UNIQUE on `(entity_id, kind, label)`.
- Typed `JurisdictionConfig` (Zod) plus prefilled configs for Estonia, Finland, and Delaware (US) — VAT rates, payout options, contributions, portal/guide links, freeform context. Idempotent seed installs them and creates a personal pseudo-entity for the bootstrap admin.
- Domain services in `src/domains/{jurisdictions,entities,persons}/` with Zod-validated CRUD, archive/unarchive (no hard delete on entities), bitemporal person-linking with atomic `UPDATE WHERE valid_to IS NULL` close (no SELECT-then-UPDATE race), typed errors (`NotFoundError`, `ConflictError`, `ValidationError`), server-side `entityType ∈ jurisdiction.entityTypes` validation, and per-mutation `audit_log` entries via the new `recordAudit` helper.
- Settings UI shell at `/settings/{entities,persons,jurisdictions}` (RSC + server actions, shadcn `Input/Label/Select/Table/Card/Badge/Textarea`, loading + error boundaries). Entity form is client-interactive: jurisdiction selection drives entity-type options and base-currency default reactively; tax residency on PersonForm uses the same controlled + hidden-input pattern. Currency options are the union of a common list, every jurisdiction default, and the current value so nothing renders as a blank trigger.
- Shared form helpers in `src/lib/form-helpers.ts` (`str`, `strOrNull`, `int`) consumed by both action files.
- Temporary `src/lib/auth-shim.ts` resolving the audit actor to the bootstrap admin until BetterAuth lands.
- **Auth & IAM (v0.1 pass):**
  - BetterAuth with the Drizzle adapter mapped onto the existing `users` and `sessions` tables; new tables `accounts`, `verifications`, `two_factors`. Email+password only — no SSO. Public signup is blocked by a `hooks.before` gate that only admits the first-boot admin and invited emails.
  - Mandatory TOTP second factor: the `twoFactor` plugin drives enrollment, and `requireAuth` rejects any session where `two_factor_enabled_at IS NULL` (redirects to `/enroll-2fa`). `markTwoFactorEnabledAction` only flips the flag after a verified row lands in `two_factors` (fail-closed default, `verified=false`).
  - Strong password policy (≥12 chars, upper+lower+digit+symbol, embedded top-100 common-password deny list) enforced via BetterAuth's `password.validate` callback.
  - Resend-only transactional email (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`), with production env refinements that reject the `.env.example` placeholders so a missed copy-paste fails fast.
  - First-boot setup wizard at `/setup` (guarded by `adminExists()`): creates the bootstrap admin, enrolls TOTP, then sets `bootstrap_completed_at` idempotently (UPDATE...RETURNING on `IS NULL` so racing tabs don't rewrite the canonical timestamp or spam the audit log).
  - Scoped invite flow: SHA-256 hashed tokens (raw token never hits the DB), 72h default TTL, jsonb scope column validated on every read via `zod`. `finalizeInviteAcceptance` runs in a single transaction with `UPDATE...WHERE accepted_at IS NULL RETURNING` to close the TOCTOU race between concurrent acceptors. Acceptance failures trigger a compensating delete so the invitee can retry.
  - Admin shell at `/admin` (guarded by `requireAdmin`): user list with soft-remove (sets `removed_at`, revokes permissions, terminates sessions in a single tx serialized by `pg_advisory_xact_lock` to prevent the last-admin removal race), plus invite create/list/revoke. Client components use `useActionState` so action errors surface inline instead of being swallowed.
  - `can / assertCan / requireAuth / requireAdmin` helpers in `src/lib/iam` with documented subset-match scope semantics (empty `{}` = wildcard for that resource_type + access_level).
  - `auth-shim.getCurrentActor` now delegates to the real BetterAuth session via `getCurrentUser()` — same call-site API, so existing domain services write audit rows against the signed-in user automatically.
  - Every auth/admin action writes an `audit_log` row via the shared `recordAudit(db, …)` helper: `bootstrap.admin.created`, `bootstrap.completed`, `2fa.enrolled`, `invite.created`, `invite.accepted`, `invite.revoked`, `permission.granted`, `user.removed`.
  - Integration tests against a real Postgres for password policy, invite lifecycle (hash match, expired, revoked, double-accept), permission scope matching, bootstrap gating, admin-actions flows, and the BetterAuth HTTP handler (signup → accounts/users row, login → sessions row, 2FA-required gate). Resend is stubbed at its narrow wrapper — the only mocked seam, at a genuine third-party boundary.
- Integration tests for schema constraints (two CHECKs, UNIQUE, FK CASCADE/RESTRICT, numeric precision boundary), domain behaviour (archive/unarchive, link/unlink, FK validation, entity-type ↔ jurisdiction validation, NaN rejection, listEntities joined-shape contract), seed idempotency, and unit tests for `JurisdictionConfig` parsing.
