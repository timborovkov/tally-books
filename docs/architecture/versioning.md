# Versioning

**Rule: every Thing in Tally is versioned. Every edit is preserved. No in-place mutation.**

The versioning engine lives in [`src/lib/versioning/`](../../src/lib/versioning). This doc is the working reference for what's there and how to add a new versioned Thing.

Source of truth for the data shape: [`data-structure.md`](../../data-structure.md) §2.1, §3.1–§3.4.

## The shape

Each versioned Thing is **two tables**:

- A parent table (`receipts`, later `invoices`, `expenses`, `vat_declarations`, …) — the current view, one row per Thing.
- A companion `<thing>_versions` table — one row per historical snapshot.

The parent carries the lifecycle bookkeeping (spread from [`versionedColumns()`](../../src/db/schema/versioning.ts)): `state`, `current_version_id`, `auto_refresh_locked`, `refresh_pending`, `underlying_data_changed`, `underlying_data_changed_payload`, `filed_ref`, `filed_at`, `disclaimer_dismissed_at`, `created_at`, `updated_at`.

The versions table carries `version_num` (monotonic, unique per parent), `state_snapshot` (full domain state), `diff` (RFC 6902 JSON Patch from the previous snapshot), `semantic_summary`, `actor_id`, `actor_kind`, `agent_id`, `reason`, `created_at`.

### The DEFERRABLE FK

`receipts.current_version_id → receipt_versions.id` is declared `DEFERRABLE INITIALLY DEFERRED` so the parent row and its first version row can be inserted in the same transaction (§3.1). drizzle-kit can't emit that clause today, so the FK is added by hand in the migration SQL after `pnpm db:generate` runs. See [`0004_smooth_maria_hill.sql`](../../src/db/migrations/0004_smooth_maria_hill.sql) for the pattern — a `--> statement-breakpoint` followed by an explicit `ALTER TABLE … ADD CONSTRAINT … DEFERRABLE INITIALLY DEFERRED`.

## The lifecycle

```
draft ──► ready ──► filed ──► amending ──► filed …
  │        │                       │
  ├──► void ◄──────────────────────┘
  │        ▲
  └────────┘
```

Allowed transitions (base machine, enforced by [`assertTransition`](../../src/lib/versioning/state-machine.ts)):

| From       | To                       |
| ---------- | ------------------------ |
| `draft`    | `ready`, `void`          |
| `ready`    | `draft`, `filed`, `void` |
| `filed`    | `amending` (only)        |
| `amending` | `filed`, `void`          |
| `void`     | terminal                 |

A filed Thing **cannot** be voided directly — it must go through `amending` first. Voiding a filed receipt is an accounting correction (it changes what the filed period contains), and the correction needs its own version row so the audit trail captures the amendment reason.

`sent` is an invoice-only additional state between `ready` and `filed`; the base state machine for every other Thing does not include it.

"**Amended**" is a UI label, not a state. A receipt is shown as "amended" when it has more than one `filed` version in its history. The enum stays `amending` (the active editing state after filing).

## The helpers

| Helper                                               | Purpose                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `createPatch(from, to)` / `applyPatch(base, patch)`  | RFC 6902 JSON Patch wrappers around [`rfc6902`](https://www.npmjs.com/package/rfc6902).                            |
| `pickSnapshot(row, fields)`                          | Extract the domain-field subset of a parent row, normalising `Date` → ISO string.                                  |
| `assertTransition(from, to, { thingType })`          | Throw `InvalidStateTransitionError` on illegal transitions.                                                        |
| `assertPeriodUnlocked(db, { entityId, occurredAt })` | Throw `PeriodLockedError` if the Thing's economic date sits inside any `financial_periods` row with `locked=true`. |

All helpers are exported from the `@/lib/versioning` barrel.

## Adding a new versioned Thing

The recipe, cross-referenced against the receipt implementation:

1. **Schema** — new file `src/db/schema/<things>.ts`. Define the parent table with `versionedColumns()` spread in, a nullable `current_version_id` column, and domain columns. Define `<thing>_versions` with `version_num`, `state_snapshot`, `diff`, `actor_id`, `actor_kind`, `reason`, and the `unique(<parent>_id, version_num)` constraint. Export the schema from [`src/db/schema/index.ts`](../../src/db/schema/index.ts).
2. **Migration** — run `pnpm db:generate`, then hand-edit the emitted SQL to add the `DEFERRABLE INITIALLY DEFERRED` FK on `<things>.current_version_id`.
3. **Domain module** — `src/domains/<things>/`:
   - `schema.ts` — Zod inputs for create / update / transition. Normalise numeric amounts at parse time (they round-trip through Postgres as strings).
   - `mutations.ts` — `create<Thing>`, `update<Thing>`, `transition<Thing>`. Each wraps `db.transaction(async (tx) => …)`. See [`src/domains/receipts/mutations.ts`](../../src/domains/receipts/mutations.ts) for the canonical pattern:
     - Take `SELECT ... FOR UPDATE` on the parent to serialise concurrent writers.
     - Compare `expectedVersionNum` (if supplied) to the latest version — throw `VersionConflictError` on mismatch.
     - Build the next parent row by spreading `existing` and applying the caller's patch.
     - Call `assertPeriodUnlocked` on the _target_ `occurredAt` (a move into a locked period is blocked too).
     - Compute `createPatch(prevSnapshot, nextSnapshot)`. If the patch is empty, early-return without writing.
     - Insert the new version row (`version_num = prev + 1`); the unique constraint is the concurrency backstop.
     - Update the parent row, including `current_version_id` pointing at the new version.
     - Call `recordAudit` with `thing.updated` / `thing.<nextState>` and a payload that includes version numbers.
   - `queries.ts` — `list`, `get`, `get<Thing>History` (versions + actor join), `get<Thing>AuditEntries`.
   - `index.ts` — barrel.
4. **Test harness** — add the new tables to `truncateAll` in [`src/domains/__tests__/test-utils.ts`](../../src/domains/__tests__/test-utils.ts), ordered so children are truncated before parents.
5. **UI** — the [`<VersionTimeline>`](../../src/components/versioning/VersionTimeline.tsx), [`<StateBadge>`](../../src/components/versioning/StateBadge.tsx), [`<FlagBadges>`](../../src/components/versioning/FlagBadges.tsx), and [`<DiffView>`](../../src/components/versioning/DiffView.tsx) components are thing-agnostic. The page loader passes pre-joined rows.

## Period locks

`financial_periods` rows have `locked`, `locked_at`, `locked_by`, `lock_reason`. Lock / unlock via [`src/domains/periods`](../../src/domains/periods) (`lockPeriod` / `unlockPeriod`) — both audit `period.locked` / `period.unlocked`.

Enforcement at the service layer: every mutation on a Thing with an economic date calls `assertPeriodUnlocked(db, { entityId, occurredAt })` before writing. The check uses inclusive bounds (`start_at ≤ occurredAt ≤ end_at`) — a period "covers" its last day.

## Audit trail

Every versioning mutation writes exactly one row to `audit_log` via [`recordAudit`](../../src/lib/audit.ts). Actions are loose verb-noun strings: `receipt.created`, `receipt.updated`, `receipt.filed`, `period.locked`. The payload carries version numbers and any free-form context worth debugging with.

Audits are displayed alongside versions in the timeline UI by matching `payload.versionNum` or `payload.toVersion`.

## What this milestone does **not** cover

Tracked in v0.3 "Editor-safety":

- Edit-session acquisition / heartbeat wiring in the UI — the [`edit_sessions`](../../src/db/schema/versioning.ts) table is deployed but mutations do not check it yet.
- `auto_refresh_locked` toggle UI.
- The recalc worker that flips `underlying_data_changed` for filed Things when sources move.
- Google-Docs-style click-to-restore on the timeline — today's timeline is read-only.

## Tests

- Unit: [`src/lib/versioning/__tests__/state-machine.test.ts`](../../src/lib/versioning/__tests__/state-machine.test.ts), [`diff.test.ts`](../../src/lib/versioning/__tests__/diff.test.ts).
- Integration: [`src/domains/receipts/__tests__/receipts.integration.test.ts`](../../src/domains/receipts/__tests__/receipts.integration.test.ts) covers create → update → transition → amend cycles, RFC 6902 diff correctness, `expectedVersionNum` conflict detection, transaction rollback, concurrency races, period-lock enforcement (create + update), and `period.locked` / `period.unlocked` audit entries.
- UI: [`src/components/versioning/__tests__/VersionTimeline.test.tsx`](../../src/components/versioning/__tests__/VersionTimeline.test.tsx).
