# Auto-refresh and editor safety

> **Status: design doc.** The recalc worker, event bus, and edit-session enforcement ship in v0.3 (see [`TODO.md`](../../TODO.md) §v0.3). The data-model flags are already in the schema (shipped in v0.1 versioning engine).

Derived artifacts (VAT declarations, annual reports, balance sheets) are computed from many source records. Sources change constantly. Users also edit derived artifacts by hand before filing. If auto-refresh and manual editing collide, filed declarations get corrupted. This doc defines the rules that keep that from happening.

## The invariants

Numbered for reference; the recalc worker asserts all of them.

1. **No auto-refresh ever modifies a filed Thing.** Filed Things are immutable until explicitly unfiled via `filed → amending`.
2. **No auto-refresh modifies a Thing inside a locked period.** The period lock is binding on system actors, not just users.
3. **No auto-refresh modifies a Thing with `auto_refresh_locked = true`.** This is the user's explicit "hands off this one" pin.
4. **No auto-refresh modifies a Thing currently in an edit session.** Instead, it sets `refresh_pending = true` and tries again later.
5. **For filed Things**, if a recalc would have changed the result, the worker sets `underlying_data_changed = true` with a payload describing the delta. UI surfaces this with a badge. The user enters the amend flow to unfile → recompute → re-file when ready.

## Moving parts (v0.3)

```
     source mutation                    recalc worker (pg-boss)
   ┌───────────────────┐              ┌──────────────────────────────┐
   │ updateExpense(...)│              │ 1. read dependency registry  │
   │ recordAudit       │   event      │ 2. load each dependent Thing │
   │ emitDomainEvent ──┼──bus / pg_─► │ 3. check invariants 1–4      │
   └───────────────────┘   notify     │ 4. recompute snapshot        │
                                      │ 5. diff vs current           │
                                      │ 6. write new version (actor  │
                                      │    = system), OR set flags   │
                                      └──────────────────────────────┘
```

### Event bus

In-process for same-process subscribers; `pg_notify` for cross-worker. Domain events emitted from every source-data mutation:

- `expense.created | updated | deleted`
- `receipt.created | updated | void`
- `invoice.sent | paid | void`
- `bank_transaction.imported`
- `time_entry.synced`

Events never mutate derived artifacts inline. They enqueue a job on the pg-boss `recalc` queue.

### Dependency registry

A static map (`src/domains/_registry/dependencies.ts` — to be written in v0.3):

```ts
export const derivationDeps = {
  vatDeclaration: {
    sources: ["expense", "receipt", "invoice"],
    scopeBy: ["entity", "periodMonth"],
  },
  annualReport: {
    sources: ["expense", "receipt", "invoice", "payroll", "balanceSheetEntry"],
    scopeBy: ["entity", "financialYear"],
  },
  // ...
} as const;
```

The recalc worker consults this map to find which derived Things a source change might affect.

### System actor

Auto-refresh writes are attributed to a `system` actor. The version row records `actor_kind = 'system'` with `actor_id = null` — `recordAudit` accepts this directly today via [`CurrentActor`](../../src/lib/auth-shim.ts) + [`src/lib/audit.ts`](../../src/lib/audit.ts). The timeline UI already renders a "System" badge for these (see [versioning.md](./versioning.md)).

## Editor safety

The "editing a VAT declaration while background rerun happens" problem.

1. When a user navigates to a Thing's editor page, the client acquires a **soft edit lock** — a row in [`edit_sessions`](../../src/db/schema/versioning.ts) with a 30 s heartbeat.
2. While an edit lock exists, the recalc worker **skips** that Thing and sets `refresh_pending = true` on it.
3. On editor entry, the server performs a **controlled refresh from data** — the same logic the worker would have run — and shows a field-by-field diff of changes since the Thing was last saved. The user accepts or discards per-field.
4. The editor has a **"Refresh from data"** button that re-runs the controlled refresh on demand.
5. When the user navigates away, the edit lock is released. Stale sessions (no heartbeat for 2 min) are garbage-collected by a cron.
6. The manual **"Lock from auto-refresh"** toggle (`auto_refresh_locked`) persists independently of edit sessions.

## Data model flags (shipped in v0.1)

On every versioned parent row (spread from [`versionedColumns()`](../../src/db/schema/versioning.ts)):

| Column                            | Type    | Meaning                                                                                  |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `auto_refresh_locked`             | `bool`  | User pin. Recalc worker leaves this Thing alone.                                         |
| `refresh_pending`                 | `bool`  | Source changed while the Thing was blocked (filed / period-locked / in edit session).    |
| `underlying_data_changed`         | `bool`  | For filed Things: sources moved post-filing. UI surfaces this.                           |
| `underlying_data_changed_payload` | `jsonb` | Describes what changed (new totals, added/removed source rows). Read by the amend flow.  |

The `edit_sessions` table (also in [`versioning.ts`](../../src/db/schema/versioning.ts)) has one row per editor — `unique(thing_type, thing_id)` means one editor per Thing at a time. Second user hitting the editor gets a "this Thing is being edited by X" screen with a takeover option.

## Scheduled jobs (v0.3+)

Beyond recalc, pg-boss will host:

- Scheduled draft generation — e.g. create next VAT declaration on the 1st of each month.
- Deadline reminders.
- Receipt OCR — queued when a receipt blob is uploaded (v0.2).
- Embedding ingestion on artifact create/update (v0.5).
- Integration syncs — Paperless-ngx poll, Clockify sync, bank sync (v0.4+).
- Agent background tasks — nightly proactive recommendation generation (v0.9).

Postgres-backed, no Redis dependency, keeps `docker-compose.yml` small.

## What v0.1 ships

- Data-model flags all present on every versioned Thing.
- `edit_sessions` table present; no heartbeat client, no GC cron, no worker wired yet.
- `actor_kind = 'system'` supported end-to-end (schema, `recordAudit`, timeline UI).

Everything else in this doc is v0.3 design. The shape of the flags and the `edit_sessions` table is load-bearing: v0.3 adds the worker, cron, event bus, and UI without touching the schema.

## Where to read next

- [`docs/architecture/versioning.md`](./versioning.md) — the versioning engine that auto-refresh writes through.
- [`docs/data-model.md`](../data-model.md) §3.3 `edit_sessions`, §3.1 `versioned` mixin.
- [`PROJECT_BRIEF.md`](../../PROJECT_BRIEF.md) §6.5 "Event bus & auto-refresh", §6.6 "Editor-safety", §6.7 "Dependency registry", §7 "Trust & safety".
