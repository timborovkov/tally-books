# Tally — Database schema

Drizzle schema for Tally. This directory is the source of truth for the database. Migrations are generated from these files via `drizzle-kit`.

## Files

| File | Concern |
|---|---|
| `_versioning.ts` | Versioning primitives — `versionedColumns()`, `versionTable()`, `editSessions`, `auditLog`, shared enums |
| `users-and-iam.ts` | Users, sessions, invites, scoped permissions |
| `entities-and-jurisdictions.ts` | Entities, jurisdictions, persons, financial periods |
| `blobs.ts` | MinIO blob references |
| `documents.ts` | Legal docs, contracts, government mail, guides |
| `taxonomies.ts` | Categories (income/expense/asset/liability/equity) |
| `source-artifacts.ts` | Receipts, expenses, invoices, time entries, bank transactions, parties |
| `derived-artifacts.ts` | VAT declarations, annual reports, balance sheets, budgets, trips, payroll, scenarios |
| `billing-arrangements.ts` | Generic billing arrangement model with attached documents |
| `integrations.ts` | Per-integration enabled state and sync metadata (no secrets) |
| `agents.ts` | Agent threads, messages, tool-call audit, suggestions |
| `embeddings.ts` | Index of what's been embedded into Qdrant |
| `audit.ts` | Re-export of audit log primitives |
| `index.ts` | Barrel — import from here |

## The versioning pattern

Most domain tables follow this shape:

```ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { versionedColumns, versionTable } from './_versioning';

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  // ...domain fields...
  ...versionedColumns(),
});

export const invoiceVersions = versionTable('invoice_versions', 'invoice_id');
```

This gives you:

- `invoices` — current state, plus lifecycle flags (`state`, `autoRefreshLocked`, `refreshPending`, `underlyingDataChanged`, `filedRef`, …)
- `invoice_versions` — append-only snapshot history with diffs and actor info

**Mutations always go through the service-layer `versioned<T>.update()` helper.** Direct DB writes to versioned tables are not allowed (enforced by code review).

## What's NOT versioned

- `time_entries` — fact-shaped, edited at source (Clockify)
- `bank_transactions` — imported from external systems
- `meetings` — facts; rare edits, no need for full history
- `parties`, `documents`, `categories` — reference data with light editing
- `audit_log`, `edit_sessions` — append-only by design
- `agent_messages`, `agent_actions` — append-only by design
- `embedding_index` — bookkeeping, not a Thing

## Conventions

- All ids are `cuid2` strings (never serial integers)
- All timestamps are `timestamp with time zone` and treated as UTC
- All money is `numeric(20, 4)` with a separate currency code; entity-base mirrors live next to original amounts
- JSON columns use `jsonb`; types live in sibling `*.types.ts` files where the shape is known
- Foreign keys are added where Drizzle can express them without creating cycles; service layer enforces the rest

## Migrations

```bash
# Generate a migration from schema changes
pnpm drizzle-kit generate

# Apply migrations
pnpm drizzle-kit migrate

# Open the studio for inspection
pnpm drizzle-kit studio
```

## Adding a new versioned Thing

1. Create the table file (or add to an existing one) using `versionedColumns()`
2. Create the `_versions` companion with `versionTable()`
3. Add a service module under `src/domains/<n>/`
4. Register dependencies in `src/lib/events/dependencies.ts` if it's a derived artifact
5. Generate migration, write the test, ship
