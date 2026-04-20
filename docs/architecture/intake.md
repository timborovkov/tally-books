# Intake inbox

Every uploaded scan lands in the unified intake inbox before it becomes a receipt, expense, or anything else. The inbox is a **cross-entity queue** — a single place to triage, route, and confirm everything that comes in.

Source of truth: [`src/domains/intake/`](../../src/domains/intake) + [`src/app/(app)/intake/`](<../../src/app/(app)/intake>).

> **Naming note.** [`docs/data-model.md`](../data-model.md) §8.2.1 sketches the table with slightly different column names (`source_blob_id`, `route_scope` enum, `route_target`, `source_kind`). The shipped v0.2 schema uses shorter code-style names (`blob_id`, tri-state `is_personal` text, `target_flow`). The semantics match. A follow-up rename-to-spec PR will reconcile once the v0.6 domains (trip, mileage, benefit, compliance) land and depend on the fully-specified shape.

## Why a separate Thing

A receipt is an accounting fact. An intake item is operational work. Conflating the two (stuffing `status='needs_review'` and `extraction` onto `receipts`) would mean:

- Personal vs business routing pollutes the receipt table with fields every query has to ignore.
- Routing to non-receipt flows (trip evidence, benefit docs, mileage claims) has nowhere to live.
- Wrong-route recovery can't cleanly void and recreate — the workflow state travels with the artifact.

So `intake_items` is its own table, and a confirmed intake item is the **origin anchor** for whatever Thing it produced. `receipt.blob_id` points at the scan; `intake_item.receipt_id` points back at the receipt — following that link answers "how did this receipt get here?".

## Lifecycle

```
new ──OCR──► needs_review ──route──► routed ──confirm──► confirmed
 │                │                                         │
 │                └─reject──► rejected                      │
 └─reject──► rejected                                       │
                                                            ▼
                                               (re_route → needs_review)
```

States (enum `intake_status`):

| State          | Meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `new`          | Just uploaded. OCR may or may not have finished.                                  |
| `needs_review` | OCR done, waiting for a human to route.                                           |
| `routed`       | User picked scope / entity / target flow; confirm hasn't happened.                |
| `confirmed`    | Downstream Thing created (for `targetFlow='expense'`, a receipt; others pending). |
| `rejected`     | User discarded. Operational cancel, not destructive — the blob row stays.         |

OCR runs on its own axis (`intake_ocr_status`: `queued` → `running` → `succeeded`/`failed`/`skipped`) so `confirmed` items can still be re-extracted without walking backwards through routing state.

## Routing axes

- `isPersonal` — tri-state text column. `null` means undecided; `"true"` / `"false"` is the user's choice. Personal routing must have `entity_id = null`; business routing must have an `entity_id`. Enforced in the domain layer.
- `entity_id` — which entity the item belongs to (when business).
- `target_flow` — `expense` | `trip` | `mileage` | `benefit` | `compliance_evidence`. Only `expense` has a downstream Thing today (receipts); the rest are surfaced in the UI with a "not yet wired" label and will produce real artifacts as their domains land in v0.6+.

## OCR worker

`pg-boss` queue `intake.ocr`, payload `{ intakeItemId }`. The handler [`processIntakeOcrJob()`](../../src/domains/intake/ocr-handler.ts):

1. Fail-fast on missing `OPENAI_API_KEY` — mark `ocr_failed`.
2. Read the blob from MinIO.
3. Call `getVisionProvider().extractReceipt(...)`.
4. Write the result + flip to `needs_review` (or leave status as-is when an already-confirmed item is being re-extracted).
5. On any thrown error, mark `ocr_failed` with the message.

## Confirm

```ts
await confirmIntakeItem(db, actor, {
  id,
  receipt: { vendor, amount, currency, occurredAt, notes },
});
```

Only `targetFlow='expense'` creates a downstream artifact. The confirm mutation:

1. Merges user-supplied field values over the OCR extraction.
2. Calls `createReceipt(db, actor, { …, blobId })` in the same transaction.
3. Flips intake status to `confirmed`, stores `receipt_id`.
4. Writes `intake.confirmed` audit (the receipt's own `receipt.created` audit lands alongside).

## Wrong-route recovery

Route went to the wrong entity, wrong flow, or should have been personal? Any confirmed item can be re-routed:

```ts
await reRouteIntakeItem(db, actor, { id, isPersonal, entityId, targetFlow });
```

The mutation:

1. Snapshots current routing → `previous_route_snapshot` jsonb.
2. Voids the downstream receipt (transitions `filed` → `amending` → `void` when needed; direct → `void` for drafts).
3. Resets routing + clears `receipt_id`; status → `needs_review`.
4. Applies the new routing; status → `routed`.
5. Writes `intake.wrong_route` + `intake.re_routed` audit pair.

Downstream-refresh signal: the audit rows are the signal. The v0.3 recalc worker listens for them and refreshes derived artifacts (VAT declarations etc.) that depended on the voided receipt.

Period locks are respected — if the voided receipt sits inside a locked period, the re-route fails. Fix the lock first.

## Mass actions

Every intake mutation has a batch form via `bulkMutate()`:

- `bulkRoute`: pick one entity + target flow, apply to N items.
- `bulkMarkPersonal`: route N items to personal + expense.
- `bulkAttach`: route to trip / mileage / benefit / compliance (v0.2 stub; real confirm comes with those domains).
- `bulkReExtract`: re-enqueue OCR.
- `bulkRequestEvidence`: currently rejects with a "missing evidence" reason — will grow into a real notification hook in v1.0.
- `bulkReject`: cancel N items.

`bulkMutate` runs each mutation in its own transaction and collects per-item `{ ok: true, value } | { ok: false, error }` results. Partial success is normal.

## Audit actions

Loose verb-noun strings under `intake.*`:

| Action               | When                                                | Payload includes                       |
| -------------------- | --------------------------------------------------- | -------------------------------------- |
| `intake.uploaded`    | Blob stored + intake row created                    | `intakeItemId`, `blobId`               |
| `intake.ocr_applied` | Vision provider returned, row now `needs_review`    | `provider`, `overallConfidence`        |
| `intake.ocr_failed`  | Provider threw or API key missing                   | `error`                                |
| `intake.routed`      | `routeIntakeItem` wrote routing fields              | `isPersonal`, `entityId`, `targetFlow` |
| `intake.confirmed`   | `confirmIntakeItem` created the downstream artifact | `targetFlow`, `receiptId`              |
| `intake.rejected`    | `rejectIntakeItem` discarded the item               | `reason`                               |
| `intake.wrong_route` | `reRouteIntakeItem` snapshotted previous routing    | `previousRouteSnapshot`                |
| `intake.re_routed`   | `reRouteIntakeItem` committed the new routing       | `from`, `to`                           |

Scoped lookup: the intake audit query filters by `payload->>'intakeItemId' = ?` alongside the action set. For v0.2 the full scan is cheap; if inbox detail pages start to dominate audit reads, a generated column + composite index are the drop-in upgrade.
