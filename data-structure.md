# Tally — Data Structure Spec

> Canonical data-model reference. TypeScript schemas (Drizzle) will be generated from this document when we start writing code in v0.1. Lives in markdown so the model can evolve without fighting ORM syntax or committing to FK arrangements we haven't tested yet.
>
> This supersedes §8 of `PROJECT_BRIEF.md` for any conflict. Brief §8 remains as a high-level sketch; this file is the detail.

---

## 1. Conventions

- **IDs.** `cuid2` strings. No serial integers. Referenced as `text` in every table.
- **Time.** All timestamps are `timestamptz`, treated as UTC on read and write. UI never localizes entry/exit.
- **Money.** `numeric(20, 4)` for amounts. **Never `text`.** Every monetary amount travels with its `currency` (ISO 4217) and, where relevant, an `amount_in_base` mirror in the entity's base currency.
- **Rates vs percentages.** A **rate** is stored as a decimal fraction (VAT 24% → `0.2400`) in `numeric(6, 4)` — max 9.9999, more than enough. A **percentage** is stored as 0–100 (ownership 100% → `100.0000`) in `numeric(7, 4)` — max 999.9999. Six-four cannot hold 100, which is why the two are separate.
- **JSON.** `jsonb`. Every jsonb field has a named shape in the sibling `*.types.ts` when code lands. If the shape is unknown, say so explicitly in this doc.
- **Foreign keys.** Declared wherever the ORM can express them, including self-references (via lazy callbacks). The only FKs we omit are ones that form a circular init dependency with `current_version_id`; those are enforced via a `DEFERRABLE INITIALLY DEFERRED` constraint (see §3.1).
- **Indexes.** Every table declares its indexes inline (see §16 for the summary). Zero-index tables are a footgun; adding them after the first million rows is surgery.
- **Soft deletion.** One rule per table, chosen from §17. No table mixes policies.
- **Enums.** Postgres `pgEnum`. When an enum value is jurisdiction-specific, prefer canonical English (e.g. `private_withdrawal`) and let the jurisdiction config map display names.
- **Polymorphic references** (where one column can point at many kinds of Things) use the `thing_type` enum from §3.4 plus `thing_id`. Typos are caught at the schema level.

---

## 2. Shared enums

### 2.1 `thing_state`
Lifecycle every versioned Thing rides through. Not every Thing uses every value; a receipt only sees `draft`/`ready`/`void`.

`draft · ready · sent · filed · amending · void`

### 2.2 `actor_kind`
Who produced a version row. **Agent writes use `actor_kind = 'user'`** with an agent-origin note — brief §9.3 treats the agent as a peer, not a privileged channel. The separate `agent_actions` table carries the tool-call audit trail.

`user · system`

### 2.3 `thing_type`
The enum that names every versioned or lockable Thing. Used by `edit_sessions`, `audit_log`, `agent_suggestions`, and any other polymorphic reference. Adding a new versioned Thing = adding a value here.

`invoice · expense · receipt · vat_declaration · annual_report · income_tax_return · balance_sheet · budget · trip · trip_report · payroll_run · scenario · billing_arrangement`

### 2.4 Other enums
Defined in the section of their owning table.

---

## 3. Versioning primitives

### 3.1 `versioned` mixin (columns every versioned Thing shares)

| Column | Type | Notes |
|---|---|---|
| `current_version_id` | `text`, FK → `<thing>_versions.id`, **DEFERRABLE INITIALLY DEFERRED** | Pointer to the active version row. Nullable only transiently inside a single transaction between inserting the parent row and its first version; the deferred FK makes the two-statement flow work without losing integrity. Resolves **C1** from the review. |
| `state` | `thing_state`, NOT NULL, default `'draft'` | Current lifecycle state. |
| `auto_refresh_locked` | `bool`, NOT NULL, default `false` | User pin: recalc worker leaves this Thing alone. |
| `refresh_pending` | `bool`, NOT NULL, default `false` | Source changed while Thing was blocked (filed / period-locked / edit-session). UI surfaces this. |
| `underlying_data_changed` | `bool`, NOT NULL, default `false` | For filed Things whose sources moved post-filing. |
| `underlying_data_changed_payload` | `jsonb`, nullable | Describes what changed (new totals, added/removed source rows). |
| `filed_ref` | `text`, nullable | Filing portal reference. Only set once `state` ≥ `filed`. |
| `filed_at` | `timestamptz`, nullable | |
| `disclaimer_dismissed_at` | `timestamptz`, nullable | Per-version dismissal of the "this is a draft — accountant sign-off required" banner on derived artifacts (resolves the brief §12.2 open question). Only meaningful on annual reports and tax returns; ignored elsewhere. |
| `created_at` | `timestamptz`, NOT NULL, default `now()` | |
| `updated_at` | `timestamptz`, NOT NULL, default `now()` | |

### 3.2 Companion `<thing>_versions` table

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `<parent>_id` | `text`, NOT NULL, FK → parent.id | The back-pointer. Name matches the Thing (`invoice_id`, `expense_id`, …). |
| `version_num` | `integer`, NOT NULL | Monotonic per parent, starts at 1. Integer, not text — resolves **C2**. |
| `state_snapshot` | `jsonb`, NOT NULL | Full domain state of the Thing at this version. |
| `diff` | `jsonb`, NOT NULL, default `[]` | JSON Patch (RFC 6902) from the previous version's snapshot. Empty array on version 1. Closes the brief §12.2 open question on diff format. |
| `semantic_summary` | `text`, nullable | Optional human-readable summary: "fix VAT rate on line 2". |
| `actor_id` | `text`, nullable, FK → `users.id` ON DELETE SET NULL | Null for system actors or deleted users. |
| `actor_kind` | `actor_kind`, NOT NULL | |
| `agent_id` | `text`, nullable | Set when this version was produced by an agent acting on behalf of a user. Audit trail bridge to `agent_actions`. |
| `reason` | `text`, nullable | Free-form note. |
| `created_at` | `timestamptz`, NOT NULL, default `now()` | |

**Constraints**
- `UNIQUE(<parent>_id, version_num)` — enforces monotonic-per-parent.
- Index on `(<parent>_id, version_num DESC)` — every history read uses it.
- Index on `created_at` for time-range queries across versions.

### 3.3 `edit_sessions` — soft locks

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `user_id` | `text`, NOT NULL, FK → `users.id` | |
| `thing_type` | `thing_type` enum, NOT NULL | Typed, not free text — resolves **C5**. |
| `thing_id` | `text`, NOT NULL | No FK (polymorphic); service layer validates. |
| `started_at` | `timestamptz`, NOT NULL, default `now()` | |
| `last_heartbeat_at` | `timestamptz`, NOT NULL, default `now()` | 30 s heartbeat from the client. |

**Constraints**
- `UNIQUE(thing_type, thing_id)` — **one editor per Thing at a time.** Resolves **C4** and matches brief §6.6. A second user hitting the editor gets a "this Thing is being edited by X" screen with a takeover option.
- Index on `last_heartbeat_at` — the GC sweep (anything older than 2 min is stale).

### 3.4 `audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `actor_id` | `text`, nullable, FK → `users.id` ON DELETE SET NULL | Resolves **I4**. Null for `system` actors with no user context. |
| `actor_kind` | `actor_kind`, NOT NULL | |
| `agent_id` | `text`, nullable | If the action was agent-originated. |
| `action` | `text`, NOT NULL | e.g. `period.locked`, `invite.sent`, `permission.revoked`. Loose by design. |
| `thing_type` | `thing_type`, nullable | Typed enum, nullable (some actions don't target a Thing — e.g. `login`). |
| `thing_id` | `text`, nullable | |
| `payload` | `jsonb`, NOT NULL, default `{}` | |
| `at` | `timestamptz`, NOT NULL, default `now()` | |

**Indexes:** `(thing_type, thing_id, at DESC)`, `(actor_id, at DESC)`, `(at DESC)`.

---

## 4. Users & IAM

### 4.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `email` | `text`, NOT NULL, UNIQUE | |
| `name` | `text`, nullable | |
| `role` | `user_role` enum (`admin`, `member`), NOT NULL, default `member` | |
| `two_factor_secret` | `text`, nullable | TOTP secret. Nullable only during setup. |
| `two_factor_enabled_at` | `timestamptz`, nullable | |
| `bootstrap_completed_at` | `timestamptz`, nullable | Set when first-boot admin finishes the wizard; additional users must have 2FA enabled before this column is set. |
| `removed_at` | `timestamptz`, nullable | Soft delete; row kept for audit linkage. |
| `created_at` | `timestamptz`, NOT NULL | |
| `updated_at` | `timestamptz`, NOT NULL | |

**CHECK constraint** (resolves **C6**):
```
two_factor_enabled_at IS NOT NULL
  OR removed_at IS NOT NULL
  OR bootstrap_completed_at IS NULL
```
Translation: every active, non-bootstrap user has 2FA. The one exception is the very first admin mid-setup.

**Indexes:** `UNIQUE(email)`, `(removed_at) WHERE removed_at IS NULL` (partial — hot path is "active users").

### 4.2 `sessions`
BetterAuth owns the shape. Mirrored here so Drizzle can join:

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `user_id` | `text`, NOT NULL, FK → `users.id` | |
| `expires_at` | `timestamptz`, NOT NULL | |
| `ip_address` | `text`, nullable | |
| `user_agent` | `text`, nullable | |
| `created_at` | `timestamptz`, NOT NULL | |

**Indexes:** `(user_id, expires_at DESC)`.

### 4.3 `invites`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `email` | `text`, NOT NULL | |
| `scope` | `jsonb`, NOT NULL | Snapshot of permissions chosen at invite time. Not kept in sync after acceptance. |
| `token_hash` | `text`, NOT NULL, UNIQUE | SHA-256 of the invite token. We never store raw tokens at rest. |
| `created_by` | `text`, NOT NULL, FK → `users.id` | |
| `created_at` | `timestamptz`, NOT NULL | |
| `expires_at` | `timestamptz`, NOT NULL | |
| `accepted_at` | `timestamptz`, nullable | |
| `accepted_by_user_id` | `text`, nullable, FK → `users.id` | |
| `revoked_at` | `timestamptz`, nullable | |
| `revoked_by` | `text`, nullable, FK → `users.id` | |

**Indexes:** `UNIQUE(token_hash)`, `(email, accepted_at)`.

### 4.4 `permissions`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `user_id` | `text`, NOT NULL, FK → `users.id` | |
| `resource_type` | `resource_type` enum | See list below. |
| `resource_scope` | `jsonb`, NOT NULL, default `{}` | e.g. `{ entityId: 'oue_123' }`. Service layer evaluates. |
| `access` | `access_level` enum (`read`, `write`), NOT NULL | |
| `granted_by` | `text`, NOT NULL, FK → `users.id` | |
| `granted_at` | `timestamptz`, NOT NULL | |
| `revoked_at` | `timestamptz`, nullable | |
| `revoked_by` | `text`, nullable, FK → `users.id` | |

**Enum `resource_type`:**
`invoices · expenses · receipts · payouts · taxes · filings · legal_documents · estimates · budgets · reports · trips · agents · business_details · personal_details`

**Indexes:** `(user_id) WHERE revoked_at IS NULL` (the IAM check is a hot path).

---

## 5. Entities, jurisdictions, persons, periods

### 5.1 `jurisdictions`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `code` | `text`, NOT NULL, UNIQUE | `EE`, `FI`, `US-DE`, `ES`, … |
| `name` | `text`, NOT NULL | |
| `config` | `jsonb`, NOT NULL | Big bundle: `entity_types[]`, `tax_types[]`, `vat_rules`, `per_diem_rules`, `filing_schedules[]`, `portal_links[]`, `guide_links[]`, `payout_options[]`, `contributions[]`, `payout_kind_display[]` (see §8.4). Typed as `JurisdictionConfig` in `packages/jurisdictions/types.ts`. |
| `freeform_context_md` | `text`, nullable | Injected into AI prompts — quirks, gotchas. |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

### 5.2 `entities`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `kind` | `entity_kind` enum (`legal`, `personal`), NOT NULL | The personal pseudo-entity is `personal`. |
| `name` | `text`, NOT NULL | |
| `entity_type` | `text`, nullable | Drawn from jurisdiction's `entity_types[]`: `OU`, `TOIMINIMI`, … |
| `jurisdiction_id` | `text`, NOT NULL, FK → `jurisdictions.id` | |
| `business_id` | `text`, nullable | |
| `vat_registered` | `bool`, NOT NULL, default `false` | |
| `vat_number` | `text`, nullable | |
| `address` | `jsonb`, NOT NULL, default `{}` | |
| `financial_year_start_month` | `integer`, NOT NULL | 1–12. **No default** — the setup wizard forces the user to pick it. |
| `base_currency` | `text`, NOT NULL | ISO 4217. **No default** — forced at creation. Resolves **I15**. |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |
| `archived_at` | `timestamptz`, nullable | Soft delete. |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

**Removed:** `ownership jsonb`. Ownership lives entirely in `entity_person_links` — single source of truth. Resolves **I8**. If a dashboard wants a quick ownership summary, it's a view, not a column.

**Indexes:** `(jurisdiction_id)`, `(archived_at) WHERE archived_at IS NULL`.

### 5.3 `persons`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `user_id` | `text`, nullable, FK → `users.id` | Set when the person is also a platform user. |
| `legal_name` | `text`, NOT NULL | |
| `tax_residency` | `text`, nullable | Jurisdiction code. |
| `ids` | `jsonb`, NOT NULL, default `{}` | `{ henkilotunnus, isikukood, NIE, SSN, … }` |
| `addresses` | `jsonb`, NOT NULL, default `[]` | |
| `contact` | `jsonb`, NOT NULL, default `{}` | |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

### 5.4 `entity_person_links`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `person_id` | `text`, NOT NULL, FK → `persons.id` | |
| `role` | `text`, NOT NULL | `board`, `ceo`, `shareholder`, `cfo`, … |
| `share_percent` | `numeric(7, 4)`, nullable | **Numeric**, not text — 0.0000 to 100.0000. `numeric(7,4)` because `numeric(6,4)` caps at 99.9999 and a sole shareholder holds 100.0000. Resolves **I1**. Null for non-equity roles. |
| `valid_from` | `timestamptz`, NOT NULL | |
| `valid_to` | `timestamptz`, nullable | |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |

**Indexes:** `(entity_id, valid_to)`, `(person_id, valid_to)`.

### 5.5 `financial_periods`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `kind` | `period_kind` enum (`month`, `quarter`, `year`, `custom`) | |
| `label` | `text`, NOT NULL | `"FY2024"`, `"2024-Q3"`, `"2024-03"`. |
| `start_at` | `timestamptz`, NOT NULL | |
| `end_at` | `timestamptz`, NOT NULL | |
| `locked` | `bool`, NOT NULL, default `false` | |
| `locked_at` | `timestamptz`, nullable | |
| `locked_by` | `text`, nullable, FK → `users.id` | |
| `lock_reason` | `text`, nullable | |
| `created_at` | `timestamptz`, NOT NULL | |

**Indexes:** `(entity_id, kind, start_at)`.

---

## 6. FX rates (new)

Resolves **C7**. Brief §12.2 requires daily FX pulls and per-amount base-currency mirrors — there has to be a table to store the rates.

### 6.1 `fx_rates`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `rate_date` | `date`, NOT NULL | The day this rate applies to. Not timestamptz — FX is a daily series. |
| `from_ccy` | `text`, NOT NULL | ISO 4217. |
| `to_ccy` | `text`, NOT NULL | ISO 4217. |
| `rate` | `numeric(20, 10)`, NOT NULL | Multiply `from_ccy` amount by this to get `to_ccy`. Extra precision vs money columns because rates compound. |
| `source` | `text`, NOT NULL | `ecb`, `exchangerate_host`, `manual`, … |
| `fetched_at` | `timestamptz`, NOT NULL, default `now()` | |

**Constraints**
- `UNIQUE(rate_date, from_ccy, to_ccy, source)`.
- Index `(from_ccy, to_ccy, rate_date DESC)` — the hot lookup.

**Filling `amount_in_base`:** service layer looks up `fx_rates` by `(expense.currency, entity.base_currency, expense.occurred_at::date)`. If missing, fall back to the most recent earlier rate from the configured source and mark the amount as "FX estimated" in metadata.

---

## 7. Blobs, documents, taxonomies

### 7.1 `blobs`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `bucket` | `text`, NOT NULL | MinIO bucket. |
| `key` | `text`, NOT NULL | Object key. |
| `mime` | `text`, NOT NULL | |
| `size_bytes` | `integer`, NOT NULL | Postgres `integer` is 2 GB; use `bigint` if we ever store larger. |
| `checksum` | `text`, NOT NULL | SHA-256. |
| `uploaded_by` | `text`, nullable, FK → `users.id` ON DELETE SET NULL | |
| `uploaded_at` | `timestamptz`, NOT NULL | |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |

**Indexes:** `(checksum)` — resolves **I16**; dedup check hits this constantly. `UNIQUE(bucket, key)`.

### 7.2 `documents`
Legal docs, guides, government mail, etc. Not versioned (see README rule — external artifacts are replaced, not diffed).

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `kind` | `document_kind` enum | See list. |
| `entity_id` | `text`, nullable, FK → `entities.id` | Null for global documents (PWC summaries etc.). |
| `blob_id` | `text`, NOT NULL, FK → `blobs.id` | |
| `title` | `text`, NOT NULL | |
| `parties` | `jsonb`, NOT NULL, default `[]` | `[{ name, role, partyId? }]` — ad-hoc signer records. |
| `dates` | `jsonb`, NOT NULL, default `{}` | `{ signedAt, effectiveFrom, expiresAt, … }` |
| `tags` | `jsonb`, NOT NULL, default `[]` | |
| `extracted_text` | `text`, nullable | For FTS / embedding input. Separate table later if sizes become painful. |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |
| `uploaded_by` | `text`, nullable, FK → `users.id` ON DELETE SET NULL | |
| `archived_at` | `timestamptz`, nullable | Soft delete. |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

**Enum `document_kind`:**
`contract · addendum · invoice_received · filing · government_mail · insurance · guide · identification · other`

**Indexes:** `(entity_id, kind, created_at DESC)`, GIN on `tags`.

### 7.3 `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `scope` | `category_scope` enum (`entity`, `personal`, `global`) | |
| `entity_id` | `text`, nullable, FK → `entities.id` | Set only when `scope = 'entity'`. |
| `name` | `text`, NOT NULL | |
| `parent_id` | `text`, nullable, FK → `categories.id` | **Self-reference FK** via lazy callback — resolves **I3** for this table. |
| `kind` | `category_kind` enum (`income`, `expense`, `asset`, `liability`, `equity`), NOT NULL | |
| `code` | `text`, nullable | Chart-of-accounts code. |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |
| `archived_at` | `timestamptz`, nullable | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

**CHECK:** `(scope = 'entity') = (entity_id IS NOT NULL)`.

**Indexes:** `(scope, entity_id)`, `(parent_id)`.

---

## 8. Source artifacts

### 8.1 `parties` (clients, suppliers, contractors, employees)

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `kind` | `party_kind` enum (`client`, `supplier`, `contractor`, `employee`) | |
| `name` | `text`, NOT NULL | |
| `legal_entity_id` | `text`, nullable | VAT/business id if counterparty is a legal entity. |
| `contact` | `jsonb`, NOT NULL, default `{}` | |
| `tax_ids` | `jsonb`, NOT NULL, default `{}` | |
| `default_terms` | `jsonb`, NOT NULL, default `{}` | |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |
| `archived_at` | `timestamptz`, nullable | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

**Indexes:** `(kind, archived_at)`, `(name)`.

### 8.2 `receipts` — versioned

Domain columns plus the `versioned` mixin from §3.1, with a companion `receipt_versions` table per §3.2.

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `blob_id` | `text`, NOT NULL, FK → `blobs.id` | |
| `merchant` | `text`, nullable | OCR-extracted. |
| `occurred_at` | `timestamptz`, nullable | Date of purchase (not upload). |
| `total` | `numeric(20, 4)`, nullable | |
| `currency` | `text`, nullable | |
| `vat_amount` | `numeric(20, 4)`, nullable | |
| `vat_rate` | `numeric(6, 4)`, nullable | |
| `ocr_status` | `receipt_ocr_status` enum (`pending`, `processing`, `done`, `failed`, `skipped`) | |
| `ocr_raw` | `jsonb`, nullable | |
| `ocr_confidence` | `jsonb`, nullable | Per-field scores for UI highlighting. |
| `description` | `text`, nullable | |
| … `versioned` mixin | | |

**Indexes:** `(entity_id, occurred_at DESC)`, `(ocr_status) WHERE ocr_status IN ('pending','processing')` (worker queue).

### 8.3 `expenses` — versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `category_id` | `text`, nullable, FK → `categories.id` | |
| `vendor` | `text`, nullable | |
| `occurred_at` | `timestamptz`, NOT NULL | |
| `amount` | `numeric(20, 4)`, NOT NULL | Original currency. |
| `currency` | `text`, NOT NULL | |
| `amount_in_base` | `numeric(20, 4)`, nullable | Populated by recalc via §6 rates. |
| `vat_amount` | `numeric(20, 4)`, nullable | |
| `vat_rate` | `numeric(6, 4)`, nullable | |
| `vat_deductible` | `bool`, NOT NULL, default `true` | Partial/disallowed cases override. |
| `paid_by` | `expense_paid_by` enum (`entity`, `personal_reimbursable`, `personal_no_reimburse`) | |
| `linked_receipt_id` | `text`, nullable, FK → `receipts.id` | |
| `linked_transaction_id` | `text`, nullable, FK → `bank_transactions.id` (lazy) | Resolves **I3**. |
| `trip_id` | `text`, nullable, FK → `trips.id` (lazy) | Resolves **I3**. |
| `description` | `text`, nullable | **Only one free-text field** — resolves **I6**. The old `notes` column is gone; put extra detail in `description`. |
| … `versioned` mixin | | |

**Indexes:** `(entity_id, occurred_at DESC)` (VAT recalc hot path), `(category_id)`, `(linked_receipt_id)`, `(trip_id)`.

### 8.4 `invoices` — versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `client_id` | `text`, nullable, FK → `parties.id` | |
| `number` | `text`, nullable | Sequential per entity, with prefix. |
| `issue_date` | `timestamptz`, nullable | |
| `due_date` | `timestamptz`, nullable | |
| `line_items` | `jsonb`, NOT NULL, default `[]` | Typed as `InvoiceLineItem[]` in the sibling types file. |
| `total` | `numeric(20, 4)`, nullable | |
| `vat_total` | `numeric(20, 4)`, nullable | |
| `currency` | `text`, NOT NULL | |
| `total_in_base` | `numeric(20, 4)`, nullable | |
| `delivery_method` | `invoice_delivery_method` enum (`e_invoice`, `pdf`, `email`, `manual`) | |
| `sent_at` | `timestamptz`, nullable | |
| `paid_at` | `timestamptz`, nullable | |
| `mirror_invoice_id` | `text`, nullable, FK → `invoices.id` (self-ref) | For internal toiminimi→OÜ invoices. Resolves **I3**. |
| `billing_arrangement_id` | `text`, nullable, FK → `billing_arrangements.id` (lazy) | Resolves **I3**. |
| `description` | `text`, nullable | (Same convention as expenses — one free-text column, no separate `notes`.) |
| … `versioned` mixin | | |

**Constraints** (resolves **I10**):
- CHECK: `state IN ('draft', 'void') OR number IS NOT NULL` — only filed/sent/ready invoices need a number. A draft voided before it reaches `ready` legitimately has no number (brief §6.4 lets voids happen from `draft` or `ready`).
- `UNIQUE(entity_id, number) WHERE number IS NOT NULL` — invoice numbers are unique per entity.
- CHECK: `filed_ref IS NULL OR state IN ('filed','sent')`.

**Indexes:** `(entity_id, issue_date DESC)`, `(entity_id, state)`, `(client_id)`, `(billing_arrangement_id)`.

### 8.5 `time_entries` — NOT versioned
Event-shaped, edited at source (Clockify).

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `source` | `time_entry_source` enum (`clockify`, `manual`) | |
| `external_id` | `text`, nullable | For idempotent sync. |
| `person_id` | `text`, nullable, FK → `persons.id` | |
| `party_id` | `text`, nullable, FK → `parties.id` | |
| `project` | `text`, nullable | |
| `description` | `text`, nullable | |
| `started_at` | `timestamptz`, NOT NULL | |
| `ended_at` | `timestamptz`, NOT NULL | |
| `duration_minutes` | `integer`, NOT NULL | Redundant with start/end, cached for fast sum. |
| `manually_overridden` | `bool`, NOT NULL, default `false` | Freezes source sync for this row. |
| `synced_at` | `timestamptz`, nullable | |
| `created_at` | `timestamptz`, NOT NULL | |

**Indexes:** `(party_id, started_at)`, `(source, external_id) WHERE external_id IS NOT NULL` (UNIQUE for idempotent import).

### 8.6 `bank_transactions` — NOT versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `account_label` | `text`, NOT NULL | Free text per integration for now. |
| `external_id` | `text`, nullable | |
| `occurred_at` | `timestamptz`, NOT NULL | |
| `amount` | `numeric(20, 4)`, NOT NULL | |
| `currency` | `text`, NOT NULL | |
| `counterparty` | `text`, nullable | |
| `description` | `text`, nullable | |
| `linked_expense_id` | `text`, nullable, FK → `expenses.id` | |
| `linked_invoice_id` | `text`, nullable, FK → `invoices.id` | |
| `linked_payroll_run_id` | `text`, nullable, FK → `payroll_runs.id` (lazy) | Resolves **I3**. |
| `raw` | `jsonb`, nullable | Retention policy: keep for 2 years post-import, then prune. |
| `imported_at` | `timestamptz`, NOT NULL, default `now()` | |

**Indexes:** `(entity_id, occurred_at DESC)`, `(external_id) WHERE external_id IS NOT NULL`.

---

## 9. Derived artifacts

All versioned; all carry `computed_snapshot jsonb`; all respect filed / period-lock / edit-session / auto-refresh-lock per brief §7.

### 9.1 `vat_declarations`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `period_id` | `text`, NOT NULL, FK → `financial_periods.id` | |
| `computed_snapshot` | `jsonb`, NOT NULL | |
| … `versioned` mixin | | |

**Constraint:** `UNIQUE(entity_id, period_id)` — one declaration per (entity, period). Index `(entity_id, period_id)`.

### 9.2 `annual_reports`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `period_id` | `text`, NOT NULL, FK → `financial_periods.id` | **Links to a `year` period** — resolves **I11**. No ambiguous integer year field; the period carries the exact start/end. |
| `computed_snapshot` | `jsonb`, NOT NULL | |
| … `versioned` mixin | | |

**Constraint:** `UNIQUE(entity_id, period_id)`.

### 9.3 `income_tax_returns`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `subject_person_id` | `text`, NOT NULL, FK → `persons.id` | |
| `jurisdiction_id` | `text`, NOT NULL, FK → `jurisdictions.id` | **FK added** — resolves **I2**. |
| `tax_year` | `integer`, NOT NULL | |
| `computed_snapshot` | `jsonb`, NOT NULL | |
| … `versioned` mixin | | |

**Constraint:** `UNIQUE(subject_person_id, jurisdiction_id, tax_year)`.

### 9.4 `balance_sheets`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `as_of` | `timestamptz`, NOT NULL | |
| `snapshot` | `jsonb`, NOT NULL | |
| … `versioned` mixin | | |

**Indexes:** `(entity_id, as_of DESC)`.

### 9.5 `balance_sheet_entries` — NOT versioned
Manually-entered augments (investments, loans receivable).

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `kind` | `balance_sheet_entry_kind` enum (`asset`, `liability`, `equity`) | |
| `label` | `text`, NOT NULL | |
| `amount` | `numeric(20, 4)`, NOT NULL | |
| `currency` | `text`, NOT NULL | |
| `as_of` | `timestamptz`, NOT NULL | |
| `metadata` | `jsonb`, NOT NULL, default `{}` | |
| `archived_at` | `timestamptz`, nullable | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

### 9.6 `budgets`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `period_id` | `text`, NOT NULL, FK → `financial_periods.id` | |
| `lines` | `jsonb`, NOT NULL, default `[]` | `[{ categoryId, plannedAmount, currency, notes }]` |
| … `versioned` mixin | | |

Budget-vs-reality reads the version active during the compared period — the `<thing>_versions` timeline makes this mechanical.

### 9.7 `trips` — versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | (Can be the `personal` entity.) |
| `person_id` | `text`, NOT NULL, FK → `persons.id` | |
| `destinations` | `jsonb`, NOT NULL, default `[]` | `[{ country, fromDate, toDate, days }]` |
| `purpose` | `text`, nullable | |
| `narrative` | `text`, nullable | |
| … `versioned` mixin | | |

### 9.8 `trip_reports` — versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `trip_id` | `text`, NOT NULL, FK → `trips.id` | |
| `computed_snapshot` | `jsonb`, NOT NULL | |
| … `versioned` mixin | | |

**Constraint:** `UNIQUE(trip_id)` — one report per trip.

### 9.9 `meetings` — NOT versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `occurred_at` | `timestamptz`, NOT NULL | |
| `location` | `text`, nullable | |
| `counterparties` | `jsonb`, NOT NULL, default `[]` | `[{ name, role, partyId? }]` — ad-hoc participant records (mirrors `documents.parties`). |
| `purpose` | `text`, nullable | |
| `description` | `text`, nullable | |
| `trip_id` | `text`, nullable, FK → `trips.id` | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

### 9.10 `meeting_expenses` — new join table
Resolves **I7**. Replaces the jsonb array of expense ids with a proper join.

| Column | Type | Notes |
|---|---|---|
| `meeting_id` | `text`, NOT NULL, FK → `meetings.id` ON DELETE CASCADE | |
| `expense_id` | `text`, NOT NULL, FK → `expenses.id` ON DELETE CASCADE | |
| `created_at` | `timestamptz`, NOT NULL | |

**PK:** `(meeting_id, expense_id)`. **Index:** `(expense_id)`.

### 9.11 `payroll_runs` — versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `person_id` | `text`, NOT NULL, FK → `persons.id` | |
| `period_id` | `text`, NOT NULL, FK → `financial_periods.id` | |
| `payout_kind` | `payout_kind` enum | See §9.11.1. |
| `gross` | `numeric(20, 4)`, NOT NULL | |
| `net` | `numeric(20, 4)`, NOT NULL | |
| `currency` | `text`, NOT NULL | |
| `taxes` | `jsonb`, NOT NULL, default `{}` | Per-jurisdiction breakdown. |
| `paid_via_transaction_id` | `text`, nullable, FK → `bank_transactions.id` (lazy) | |
| … `versioned` mixin | | |

#### 9.11.1 Enum `payout_kind`
Canonical English only — resolves **I12**:

`salary · dividend · board_compensation · private_withdrawal · reimbursement · other`

Jurisdiction-local display names live in `jurisdiction.config.payout_kind_display` (e.g. FI: `private_withdrawal → "Yksityisotto"`). Adding a jurisdiction no longer forces enum edits.

### 9.12 `scenarios` — versioned, pure

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `name` | `text`, NOT NULL | |
| `description` | `text`, nullable | |
| `base_kind` | `scenario_base_kind` enum (`current`, `scenario`), NOT NULL | Resolves **I9**. |
| `base_scenario_id` | `text`, nullable, FK → `scenarios.id` (self-ref) | Required when `base_kind = 'scenario'`. |
| `changes` | `jsonb`, NOT NULL, default `[]` | |
| `computed` | `jsonb`, nullable | |
| … `versioned` mixin | | |

**CHECK:** `(base_kind = 'scenario') = (base_scenario_id IS NOT NULL)`.

---

## 10. Billing arrangements

### 10.1 `billing_arrangements` — versioned

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `name` | `text`, NOT NULL | |
| `billing_entity_id` | `text`, NOT NULL, FK → `entities.id` | |
| `counterparty_party_id` | `text`, nullable, FK → `parties.id` | **Renamed** from `counterparty_client_id` — resolves **I13**. A counterparty can be any party kind. |
| `explainer_md` | `text`, nullable | Free-form description. |
| `model` | `jsonb`, NOT NULL | Discriminated union: `lump_sum`, `hourly`, `daily`, `monthly`, `percent_of_underlying`. |
| `schedule` | `jsonb`, NOT NULL, default `{}` | Cadence. |
| `vat_treatment` | `jsonb`, NOT NULL, default `{}` | |
| `tax_notes_md` | `text`, nullable | |
| `terms` | `jsonb`, NOT NULL, default `{}` | |
| `is_estimate` | `bool`, NOT NULL, default `false` | |
| `active_from` | `timestamptz`, nullable | |
| `active_to` | `timestamptz`, nullable | |
| … `versioned` mixin | | |

### 10.2 `billing_arrangement_documents`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `arrangement_id` | `text`, NOT NULL, FK → `billing_arrangements.id` ON DELETE CASCADE | |
| `document_id` | `text`, NOT NULL, FK → `documents.id` | |
| `role` | `text`, NOT NULL, default `'contract'` | `contract`, `addendum`, `email`, … |
| `created_at` | `timestamptz`, NOT NULL | |

**Constraint:** `UNIQUE(arrangement_id, document_id, role)`.

---

## 11. Integrations

### 11.1 `integration_configs`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `catalog_id` | `text`, NOT NULL | Matches a catalog entry. |
| `enabled` | `bool`, NOT NULL, default `false` | |
| `params` | `jsonb`, NOT NULL, default `{}` | **Non-secret only.** Secrets live in `.env`. |
| `last_sync_at` | `timestamptz`, nullable | |
| `last_sync_status` | `text`, nullable | |
| `last_sync_error` | `text`, nullable | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

**Constraint:** `UNIQUE(catalog_id)` — at most one config per catalog entry.

---

## 12. Agents

### 12.1 `agent_threads`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `agent_id` | `text`, NOT NULL | Logical agent id from `src/lib/ai/agents/<n>/agent.ts`. |
| `kind` | `agent_thread_kind` enum (`user`, `system`), NOT NULL, default `user` | |
| `user_id` | `text`, nullable, FK → `users.id` ON DELETE SET NULL | Null for system threads. |
| `title` | `text`, nullable | |
| `created_at`, `updated_at` | `timestamptz`, NOT NULL | |

**Indexes:** `(user_id, updated_at DESC)`, `(agent_id, updated_at DESC)`.

### 12.2 `agent_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `thread_id` | `text`, NOT NULL, FK → `agent_threads.id` ON DELETE CASCADE | |
| `agent_id` | `text`, NOT NULL | Denormalized from thread for partition queries. |
| `role` | `agent_message_role` enum (`user`, `assistant`, `tool`, `system`) | |
| `content` | `jsonb`, NOT NULL | Typed as `AgentMessageContent` in sibling types file. |
| `content_version` | `integer`, NOT NULL, default `1` | Shape evolves with tool shapes; bump when breaking. |
| `tokens_in` | `integer`, nullable | **Integer**, not text — resolves **I5**. |
| `tokens_out` | `integer`, nullable | Same. |
| `model` | `text`, nullable | Resolved model identifier. |
| `created_at` | `timestamptz`, NOT NULL | |

**Indexes:** `(thread_id, created_at)` — the hot ordering read.

### 12.3 `agent_actions`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `thread_id` | `text`, NOT NULL, FK → `agent_threads.id` ON DELETE CASCADE | |
| `agent_id` | `text`, NOT NULL | |
| `tool` | `text`, NOT NULL | |
| `input` | `jsonb`, NOT NULL | |
| `output` | `jsonb`, nullable | |
| `status` | `agent_action_status` enum (`pending`, `succeeded`, `failed`, `rejected`) | |
| `confirmed_by_user` | `bool`, nullable | Null for non-destructive tools. |
| `error_message` | `text`, nullable | |
| `started_at` | `timestamptz`, NOT NULL | |
| `completed_at` | `timestamptz`, nullable | |

**Indexes:** `(thread_id, started_at DESC)`, `(status) WHERE status = 'pending'`.

### 12.4 `agent_suggestions`

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `agent_id` | `text`, NOT NULL | |
| `target_thing_type` | `thing_type` enum, NOT NULL | **Typed enum** — resolves **C5**. |
| `target_thing_id` | `text`, NOT NULL | |
| `payload` | `jsonb`, NOT NULL | Discriminated by `{ kind, ...payload }`. |
| `status` | `agent_suggestion_status` enum (`pending`, `accepted`, `rejected`, `superseded`) | |
| `created_at` | `timestamptz`, NOT NULL | |
| `decided_at` | `timestamptz`, nullable | |
| `decided_by` | `text`, nullable, FK → `users.id` ON DELETE SET NULL | |

**Indexes:** `(target_thing_type, target_thing_id, status)`, `(status, created_at DESC) WHERE status = 'pending'`.

---

## 13. Embeddings

### 13.1 `embedding_index`
Bookkeeping for Qdrant. Vectors themselves live in Qdrant.

| Column | Type | Notes |
|---|---|---|
| `id` | `text`, PK | |
| `collection` | `text`, NOT NULL | Qdrant collection name. |
| `source_kind` | `text`, NOT NULL | e.g. `expense`, `invoice`, `document`. Not the `thing_type` enum — we embed some non-Thing surfaces too (tax guides, trip narratives). Free text, documented in `docs/architecture/embeddings-and-search.md`. |
| `source_id` | `text`, NOT NULL | |
| `qdrant_point_id` | `text`, NOT NULL | |
| `text_hash` | `text`, NOT NULL | SHA-256 of normalized text — dedup check. |
| `model` | `text`, NOT NULL | |
| `embedded_at` | `timestamptz`, NOT NULL | |
| `deleted_at` | `timestamptz`, nullable | Soft delete — keep the row after Qdrant point removal for debugging. |

**Constraints:**
- `UNIQUE(collection, source_kind, source_id)` — one point per artifact per collection. Resolves the I-list concern about dedup.
- Index on `(text_hash)` — fast "did content change?" check.

---

## 14. Non-tracked / non-negotiable invariants

Rules the schema alone can't enforce; live in service code.

- **Every versioned-Thing mutation goes through `versioned<T>.update(id, patch, actor, reason?)`.** Direct writes to `<thing>` or `<thing>_versions` are forbidden.
- **Period-locked Things reject mutations at the service layer** based on `occurred_at` / `issue_date` / `as_of` falling inside a locked `financial_period` for the entity.
- **Scenarios are pure.** They read state, compute, and write only to `scenarios.computed`. They never touch source or other derived artifacts.
- **Agent writes carry `actor_kind = 'user'` with `agent_id` set** on the version row. `agent_actions` holds the tool-call detail.
- **Internal invoice mirror:** when both ends of an invoice are owned entities, the service creates two invoice rows and sets `mirror_invoice_id` bidirectionally.
- **OCR extraction runs through the vision provider abstraction** — never calls OpenAI SDK directly from a receipt handler.

---

## 15. Polymorphic `thing_type` enum — adding a new Thing

1. Add the value to the `thing_type` enum (§2.3).
2. Define the Thing's table using the `versioned` mixin + companion versions table.
3. Add indexes (§16).
4. Register dependencies in `src/lib/events/dependencies.ts` if derived.
5. Create a service module under `src/domains/<name>/`.
6. Write the integration test.

If a Thing can be the target of an agent suggestion or the subject of an edit session, step 1 is non-optional. Forgetting it used to fail silently; now it fails at the schema level.

---

## 16. Index summary

One place for every index this spec prescribes. When a migration lands, diff this table against `pg_indexes` to confirm parity.

| Table | Index | Purpose |
|---|---|---|
| `<thing>_versions` | `UNIQUE(<parent>_id, version_num)` | Monotonic-per-parent. |
| `<thing>_versions` | `(<parent>_id, version_num DESC)` | History read. |
| `<thing>_versions` | `(created_at)` | Cross-parent time range. |
| `edit_sessions` | `UNIQUE(thing_type, thing_id)` | One editor per Thing. |
| `edit_sessions` | `(last_heartbeat_at)` | GC sweep. |
| `audit_log` | `(thing_type, thing_id, at DESC)` | Thing history. |
| `audit_log` | `(actor_id, at DESC)` | User activity. |
| `audit_log` | `(at DESC)` | Recent activity. |
| `users` | `UNIQUE(email)` | |
| `users` | `(removed_at) WHERE removed_at IS NULL` | Active users. |
| `sessions` | `(user_id, expires_at DESC)` | |
| `invites` | `UNIQUE(token_hash)` | |
| `invites` | `(email, accepted_at)` | |
| `permissions` | `(user_id) WHERE revoked_at IS NULL` | IAM check. |
| `entities` | `(jurisdiction_id)` | |
| `entities` | `(archived_at) WHERE archived_at IS NULL` | Active entities. |
| `entity_person_links` | `(entity_id, valid_to)` | |
| `entity_person_links` | `(person_id, valid_to)` | |
| `financial_periods` | `(entity_id, kind, start_at)` | |
| `fx_rates` | `UNIQUE(rate_date, from_ccy, to_ccy, source)` | |
| `fx_rates` | `(from_ccy, to_ccy, rate_date DESC)` | Rate lookup. |
| `blobs` | `(checksum)` | Dedup. |
| `blobs` | `UNIQUE(bucket, key)` | |
| `documents` | `(entity_id, kind, created_at DESC)` | |
| `documents` | GIN on `tags` | |
| `categories` | `(scope, entity_id)` | |
| `categories` | `(parent_id)` | |
| `parties` | `(kind, archived_at)` | |
| `parties` | `(name)` | Search. |
| `receipts` | `(entity_id, occurred_at DESC)` | |
| `receipts` | `(ocr_status) WHERE ocr_status IN ('pending','processing')` | Worker queue. |
| `expenses` | `(entity_id, occurred_at DESC)` | VAT recalc. |
| `expenses` | `(category_id)` | |
| `expenses` | `(linked_receipt_id)` | |
| `expenses` | `(trip_id)` | |
| `invoices` | `(entity_id, issue_date DESC)` | |
| `invoices` | `(entity_id, state)` | |
| `invoices` | `UNIQUE(entity_id, number) WHERE number IS NOT NULL` | |
| `invoices` | `(client_id)` | |
| `invoices` | `(billing_arrangement_id)` | |
| `time_entries` | `(party_id, started_at)` | |
| `time_entries` | `UNIQUE(source, external_id) WHERE external_id IS NOT NULL` | Idempotent sync. |
| `bank_transactions` | `(entity_id, occurred_at DESC)` | |
| `bank_transactions` | `(external_id) WHERE external_id IS NOT NULL` | |
| `vat_declarations` | `UNIQUE(entity_id, period_id)` | |
| `annual_reports` | `UNIQUE(entity_id, period_id)` | |
| `income_tax_returns` | `UNIQUE(subject_person_id, jurisdiction_id, tax_year)` | |
| `balance_sheets` | `(entity_id, as_of DESC)` | |
| `trip_reports` | `UNIQUE(trip_id)` | |
| `meeting_expenses` | `PK(meeting_id, expense_id)`, `(expense_id)` | |
| `agent_threads` | `(user_id, updated_at DESC)` | |
| `agent_threads` | `(agent_id, updated_at DESC)` | |
| `agent_messages` | `(thread_id, created_at)` | Ordering. |
| `agent_actions` | `(thread_id, started_at DESC)` | |
| `agent_actions` | `(status) WHERE status = 'pending'` | Confirm queue. |
| `agent_suggestions` | `(target_thing_type, target_thing_id, status)` | |
| `agent_suggestions` | `(status, created_at DESC) WHERE status = 'pending'` | Dashboard. |
| `embedding_index` | `UNIQUE(collection, source_kind, source_id)` | |
| `embedding_index` | `(text_hash)` | |

Resolves **C3**.

---

## 17. Soft-deletion policy

Each table declares one policy. No mixing. Resolves **I14**.

| Policy | Column | Used by |
|---|---|---|
| **Archive** (soft hide from default lists) | `archived_at timestamptz` | `entities`, `parties`, `documents`, `categories`, `balance_sheet_entries` |
| **Remove** (user account off-boarded) | `removed_at timestamptz` | `users` |
| **Revoke** (credential / grant withdrawn) | `revoked_at timestamptz` | `invites`, `permissions` |
| **Void** (versioned Thing killed, history retained) | `state = 'void'` | every versioned Thing |
| **Delete + tombstone** (Qdrant bookkeeping) | `deleted_at timestamptz` | `embedding_index` |
| **Hard delete** | — | `sessions`, `edit_sessions` (ephemeral), `meeting_expenses` (cascade) |

---

## 18. Open questions for build time

- **FX source per base-currency.** ECB covers EUR. What do we use when a self-hoster's entity is USD/GBP/CHF? Lean: `exchangerate.host` (free, covers everything) as the default non-EUR source, ECB when base is EUR. Store the source in `fx_rates.source` so retroactive audits work.
- **Invoice number formats.** Brief says "Sequential number per entity, with prefix." Do we generate in the service or let the user type? Lean: generate on `draft → ready` transition, user can edit before filing.
- **Receipt retention after void.** When an expense is voided, does the attached receipt stay? Lean: yes, keep the receipt — it might re-attach to a new expense.
- **Agent thread ownership after user removal.** A `user_id` is nullable (ON DELETE SET NULL) on threads, but the conversation is authored by that user. Lean: keep the thread, null the `user_id`, render `"deleted user"` in the UI.
- **`time_entries.party_id` nullability.** Clockify projects may not map to a party. Keep nullable; the invoice estimator skips unmapped entries.

---

## 19. Issues from review — resolution map

Every finding from the design review landed somewhere in this doc.

| ID | Finding | Resolution |
|---|---|---|
| **C1** | `current_version_id` nullable, no FK | §3.1 — FK with `DEFERRABLE INITIALLY DEFERRED`. |
| **C2** | `version_num` as text | §3.2 — `integer` + `UNIQUE(parent, version_num)`. |
| **C3** | Zero indexes | §16 — full index table. |
| **C4** | `edit_sessions` no uniqueness | §3.3 — `UNIQUE(thing_type, thing_id)`, heartbeat index. |
| **C5** | Polymorphic `thing_type` free-form | §2.3 — `thing_type` enum, used by §3.3, §3.4, §12.4. |
| **C6** | 2FA nullable with no constraint | §4.1 — CHECK constraint + `bootstrap_completed_at`. |
| **C7** | No FX rate table | §6 — `fx_rates` with unique constraint + lookup index. |
| **I1** | `share_percent` text | §5.4 — `numeric(6, 4)`. |
| **I2** | Missing FK on `income_tax_returns.jurisdiction_id` | §9.3. |
| **I3** | Missing FKs (tripId, linkedTransactionId, mirrorInvoiceId, billingArrangementId, linkedPayrollRunId, categories.parentId) | §7.3, §8.3, §8.4, §8.6. |
| **I4** | `audit_log.actor_id` no FK | §3.4. |
| **I5** | `tokens_in/out` text | §12.2. |
| **I6** | Two free-text fields on expenses | §8.3 — only `description`. Applied across the schema. |
| **I7** | `meetings.expenseIds` jsonb | §9.10 — `meeting_expenses` join table. |
| **I8** | `entities.ownership` duplicates links | §5.2 — removed. |
| **I9** | `scenarios.base text` mixing concepts | §9.12 — `base_kind` + `base_scenario_id`. |
| **I10** | `invoices.number` constraints | §8.4 — CHECK + UNIQUE. |
| **I11** | `annual_reports.financial_year` integer | §9.2 — uses `financial_periods` link. |
| **I12** | Jurisdictional values in `payout_kind` enum | §9.11.1 — canonical enum + `jurisdiction.config.payout_kind_display`. |
| **I13** | `counterparty_client_id` misnamed | §10.1 — `counterparty_party_id`. |
| **I14** | Soft-deletion inconsistent | §17 — one-policy-per-table table. |
| **I15** | `entities.base_currency` defaults to EUR | §5.2 — no default. Also no default on `financial_year_start_month`. |
| **I16** | `blobs.checksum` no index | §7.1 / §16. |
| Plan note | `actor_kind` enum vs brief §9.3 | §2.2 — enum is `user · system`; agents ride on `'user'` + `agent_id` on the version row, per brief §9.3. |
| Plan note | Disclaimer state | §3.1 — `disclaimer_dismissed_at`. |
| Plan note | Diff format open | §3.2 — JSON Patch (RFC 6902) chosen, closes brief §12.2. |
| Plan note | Index strategy missing from roadmap | §16 — spec'd here; TODO.md will reference this doc. |
| Plan note | FX source/ingestion missing from roadmap | §6 + §18 — modelled here; roadmap gets a v0.2 item. |
