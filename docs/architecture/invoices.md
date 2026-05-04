# Invoices

Outgoing invoices are the third versioned Thing after receipts and expenses, and the first one whose lifecycle uses the optional `sent` state. This doc covers the parts that aren't already in [`versioning.md`](./versioning.md): line-item composer, PDF generation, internal-invoice mirroring, sequential numbering, and `paid_at` semantics.

Source of truth for the data shape: [`data-model.md`](../data-model.md) §8.1 (parties) and §8.4 (invoices).

## Tables

- `parties` — counterparty contact rows shared across kinds (`client`, `supplier`, `contractor`, `employee`). Not versioned, soft-delete via `archived_at`. See [src/db/schema/parties.ts](../../src/db/schema/parties.ts).
- `invoices` + `invoice_versions` — versioned per the receipt/expense template. The DEFERRABLE FK on `current_version_id` is added by hand in [migration 0010](../../src/db/migrations/0010_narrow_sunset_bain.sql), same pattern as receipts and expenses.
- `entity_invoice_counters` — per-`(entity_id, year)` sequence used to allocate invoice numbers atomically. Composite primary key; rows upsert on first use of a year.
- `documents` — generic document store, polymorphic owner via `(owner_type, owner_id)`. Used by parties to attach contracts, addenda, and other paperwork.

## Lifecycle

Invoices add `sent` between `ready` and `filed`:

```
draft → ready → sent → filed → amending → filed …
  │       │       │
  └──► void ◄─────┘
```

`sent` is invoice-only — it represents "the PDF / e-invoice was dispatched to the client" and is the right place to hold an invoice while waiting for payment. `filed` is reserved for the invoice having been booked into a closed period (the e-invoice provider integration in v0.4 will assign `sent` automatically when delivery succeeds).

`paid_at` is **orthogonal to state**. A `sent` invoice can be marked paid before it's filed; a `filed` invoice can be marked paid after the period close. Use [`markInvoicePaid`](../../src/domains/invoices/mutations.ts) — it writes a new version row, audits `invoice.paid`, and is idempotent (re-paying errors).

## Number assignment

Numbers follow `<prefix>-<year>-<seq>`, where:

- `prefix` comes from `entities.metadata.branding.invoicePrefix` (default `INV`).
- `year` is `issue_date.UTCFullYear()` (or today's year if `issue_date` is null at the moment of transition).
- `seq` is a 4-digit zero-padded counter from `entity_invoice_counters`.

Numbers are assigned the first time the invoice transitions to `ready`, `sent`, or `filed`. Going back to `draft` drops the number; the next forward transition allocates a fresh sequence value (the counter does not roll back). Manual numbering is allowed at create-time; the unique constraint on `(entity_id, number)` handles collisions.

## PDF generation

Library: [`@react-pdf/renderer`](https://react-pdf.org). Reasons:

- No headless Chromium — runs cleanly in Next.js server actions, no extra binaries to ship.
- React-component layout matches the rest of the codebase.
- Built-in support for tables, page numbers, embedded images.

Files:

- [`src/lib/pdf/invoice.tsx`](../../src/lib/pdf/invoice.tsx) — `<InvoicePdf>` template.
- [`src/lib/pdf/render.ts`](../../src/lib/pdf/render.ts) — `renderInvoicePdf(db, invoiceId)` returns a `Buffer`.
- [`src/lib/storage/blob-bytes.ts`](../../src/lib/storage/blob-bytes.ts) — `getBlobBytes(bucket, key)` for embedding the entity logo.

The download flow is a server action that returns `{ fileName, base64 }` — the client component reconstitutes the bytes into a Blob URL and triggers a download. Server actions can't return raw `Response` objects when called from a Client Component, hence the base64 hop.

## Branding

Per-entity branding lives under `entities.metadata.branding`, validated by [`entityBrandingSchema`](../../src/lib/entity-branding.ts):

```ts
{
  invoicePrefix?: string;           // "INV", "TM", …
  logoBlobId?: string;              // points at blobs.id, fetched at PDF render
  bankAccount?: { iban, bic, bankName, accountHolder };
  footer?: string;                  // free text rendered at the bottom of the page
}
```

No schema migration — adding a field is a code change only. Reading is via `readEntityBranding(metadata)`; writing is via `withEntityBranding(metadata, branding)`.

## Internal-invoice mirror

Some setups have a sole-trader (`toiminimi`) entity billing a holding company, both owned by the same person. `createInternalInvoice` writes both sides in one transaction:

1. Resolve / create a `parties` row for each entity in the other entity's books. Match by `legal_entity_id` first, then by `metadata.mirroredEntityId`. Fresh rows get `metadata.mirroredEntityId = <other entity id>` so future mirrors deduplicate.
2. Insert the seller-side invoice (entity = seller, client = mirror party representing the buyer).
3. Insert the buyer-side invoice (entity = buyer, client = mirror party representing the seller). Description is auto-prefixed `Mirror of <seller-entity-name>`.
4. Cross-link via `mirror_invoice_id` on both rows.
5. v1 + audit (`invoice.created` with `payload.mirroredFrom`) on both rows.

`mirror_invoice_id` is a self-FK with `ON DELETE SET NULL` so voiding (or hard-deleting in tests) one side does not cascade.

## Mark as paid (v0.2 semantics)

In v0.2, "mark paid" is a manual flag — `markInvoicePaid(db, actor, { id, paidAt, paymentRef? })`:

- Sets `paid_at` and (optional) `payment_ref`.
- Writes a new version row so payment history is visible in the timeline.
- Audits `invoice.paid` with `payload.paidAt` and `payload.paymentRef`.

No `bank_transactions` row is created today (that table arrives with the bank-sync work). When that integration lands, the mutation gains an optional `linked_transaction_id` arg; the existing `paid_at` semantics keep working.

## Permissions

All invoice mutations gate behind `invoices` × `write` (scoped by `entityId`). Internal mirror requires write on **both** entity scopes, double-checked inside the transaction. Parties are gated under `business_details` × `write`. Documents under `legal_documents` × `write`.

## Tests

[`src/domains/invoices/__tests__/invoices.integration.test.ts`](../../src/domains/invoices/__tests__/invoices.integration.test.ts) covers create, line-item updates with diff, sequential numbering across multiple invoices in a year, drop-and-reissue on `ready → draft`, `sent` stamping, mark paid / unpaid + idempotency, and the internal-invoice mirror flow including audit trail and party resolution. PDF rendering is exercised by the dev-server smoke test in the verification section of the v0.2 plan.
