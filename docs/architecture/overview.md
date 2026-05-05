# Architecture overview

Entry point for Tally's architecture. Read this first; follow the links for depth.

For the product vision, read [`PROJECT_BRIEF.md`](../../PROJECT_BRIEF.md) at the repo root. That file is the narrative. This file is the engineer's map.

## The layers

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js App Router — /src/app                              │
│    (app)/**     authenticated surface (sidebar + shell)     │
│    setup/       first-boot admin wizard                     │
│    login/       unauthenticated auth gates                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼  server actions / server components
┌─────────────────────────────────────────────────────────────┐
│  Domain services — /src/domains/<thing>                     │
│    schema.ts    Zod inputs, parsed at the boundary          │
│    mutations.ts writes, versioning, audit, IAM checks       │
│    queries.ts   reads, typed shapes                         │
│    index.ts     barrel                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼  Drizzle
┌─────────────────────────────────────────────────────────────┐
│  Postgres (16, pgvector) + RustFS                           │
└─────────────────────────────────────────────────────────────┘
```

No UI or route handler touches the database directly. Every write flows through a domain service; every read that the UI cares about has a typed query function in the same domain module.

## The folders

| Path                   | What lives there                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/**`     | Authenticated surface. Layout at `src/app/(app)/layout.tsx` enforces session + 2FA.                                                |
| `src/app/setup/**`     | First-boot admin wizard — the only writable route when no admin exists.                                                            |
| `src/app/login/**`     | Login, 2FA challenge, invite-accept flows.                                                                                         |
| `src/domains/<thing>`  | Business logic per versioned or semi-versioned Thing (entities, receipts, periods, …).                                             |
| `src/lib/iam`          | `can` / `assertCan`, scope semantics, admin actions. See "IAM" below.                                                              |
| `src/lib/versioning`   | Versioning engine: diff, state machine, period locks, errors. See [versioning.md](./versioning.md).                                |
| `src/lib/audit.ts`     | The `recordAudit` chokepoint. Every mutation calls it exactly once.                                                                |
| `src/lib/auth-shim.ts` | `getCurrentActor` — resolves the BetterAuth session into a `CurrentActor`.                                                         |
| `src/db/schema/**`     | Drizzle table definitions, one file per concern. Exported through `src/db/schema/index.ts`.                                        |
| `src/db/migrations/**` | Drizzle-kit output. Hand-edits are marked with an explicit comment (e.g. the DEFERRABLE FK in `0004_smooth_maria_hill.sql`).       |
| `src/components/**`    | React components. `ui/` is shadcn-derived primitives. `settings/` is per-page forms. `versioning/` is the thing-agnostic timeline. |
| `docs/**`              | This directory.                                                                                                                    |

## Request shape

For an authenticated surface:

1. Next.js routes the request; `src/app/(app)/layout.tsx` short-circuits to `/login` or `/enroll-2fa` if the user isn't fully authenticated.
2. The page (Server Component) loads. It calls domain queries and renders. Database reads here run on the module-level Drizzle client.
3. Interactive changes post to a server action (files named `actions.ts` under `src/app/(app)/**`).
4. The action resolves `getCurrentActor(db)`, parses form data with `src/lib/form-helpers.ts`, and calls the domain mutation.
5. The domain mutation calls `assertCan(db | tx, actor.user, ...)` for IAM, opens a `db.transaction(async (tx) => ...)` if the write touches more than one row, and at the end calls `recordAudit(tx, ...)` exactly once.
6. `revalidatePath` / `redirect` in the server action; Next re-renders.

## Versioning

Every Thing in Tally is versioned. No in-place mutation. See [`versioning.md`](./versioning.md) for the complete story — parent + `<thing>_versions` table shape, the `DEFERRABLE INITIALLY DEFERRED` FK pattern, state machine, period locks, diff format (RFC 6902), and the recipe for adding a new versioned Thing.

## IAM

User roles (`admin`, `member`) + explicit permissions keyed by `resource_type × access_level × scope`. Admins short-circuit; non-admins need a grant whose scope is a subset of the requested scope.

- Types: [`src/lib/iam/types.ts`](../../src/lib/iam/types.ts) — 17 resource types, 2 access levels.
- Check functions: [`src/lib/iam/permissions.ts`](../../src/lib/iam/permissions.ts) — `can(db, user, resource, access, scope?)` and its assert variant. Pass `tx` from inside a transaction so the permission query reads the same snapshot and is serialised with any `SELECT ... FOR UPDATE` lock.
- 2FA is mandatory. No SSO. The invite flow grants scoped permissions at creation.

## Audit

`audit_log` is append-only. Every mutation records one row via `recordAudit`. The action strings are loose verb-noun (`entity.created`, `period.locked`, `receipt.filed`). Thing-scoped entries set `thing_type` + `thing_id` so the timeline UI can surface them alongside the version history.

## Dates and money

- **Times**: always UTC. See [`dates.md`](./dates.md). Raw `Date.now()` and `toLocale*` are ESLint-banned in app code.
- **Money**: `numeric(20, 4)` stored as string. Normalised at the Zod boundary (see `src/domains/receipts/schema.ts` for the pattern). Every amount travels with its `currency` (ISO 4217).

## Auto-refresh (forward-looking)

The recalc worker, event bus, and dependency registry aren't shipped yet. The data model already carries the flags (`auto_refresh_locked`, `refresh_pending`, `underlying_data_changed`). See [`auto-refresh.md`](./auto-refresh.md) for the v0.3 design.

## Jurisdictions

Each jurisdiction is a config bundle (`src/lib/jurisdictions/configs/<code>.ts`) attached to `jurisdictions.config` at seed time. The config covers allowed entity types, VAT rules, per-diem rules, filing schedules, payout options, contributions, and portal + guide links. See:

- [`docs/jurisdictions/estonia.md`](../jurisdictions/estonia.md)
- [`docs/jurisdictions/finland.md`](../jurisdictions/finland.md)
- [`docs/jurisdictions/us-delaware.md`](../jurisdictions/us-delaware.md)

## Integrations

Catalogs are scaffolded but v0.1 ships no live integrations. v0.4 brings the first wave (Finnish e-invoice, Paperless-ngx, Clockify). The interfaces live in `src/integrations/<category>/` when they land.

## What's shipped vs planned

A short inventory. Full roadmap is [`TODO.md`](../../TODO.md).

- **Shipped (v0.1):** auth (BetterAuth + mandatory 2FA), invite flow, IAM, first-boot wizard, entities / persons / jurisdictions / periods / receipts domains, versioning engine, audit log, dev compose (postgres with pgvector / rustfs), Sentry.
- **Coming v0.2:** source-data inbox — receipts (OCR/vision), expenses, invoices, clients, suppliers, categories, basic bookkeeping views, pg-boss.
- **Coming v0.3:** derived artifacts (VAT declarations, balance sheets), event bus, recalc worker, editor safety (edit sessions + `auto_refresh_locked`).
- **Coming v0.4+:** integrations, AI agents, payroll, trips, budgets, annual reports.

## Where to read next

- [`docs/data-model.md`](../data-model.md) — every table, every column, every constraint.
- [`docs/architecture/versioning.md`](./versioning.md) — the versioning engine end-to-end.
- [`docs/architecture/auto-refresh.md`](./auto-refresh.md) — v0.3 recalc design.
- [`docs/guides/deployment.md`](../guides/deployment.md) — running the thing.
