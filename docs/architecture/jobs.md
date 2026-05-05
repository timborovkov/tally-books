# Background jobs

Async work runs through [pg-boss](https://github.com/timgit/pg-boss) — a queue built on top of Postgres. No extra broker, no extra state store. Workers poll the same database the app already uses.

Source of truth: [`src/lib/jobs/`](../../src/lib/jobs).

## Why pg-boss

- No broker to operate. The queue is in Postgres; its backups are already part of the DB backup.
- At-least-once delivery with retries + dead-letter queues built in.
- Survives worker restarts: jobs left `active` past their heartbeat are reclaimed.
- Works for v0.2 through v1.0's cron-driven worker needs without changing runtime assumptions.

## Architecture

```
┌─────────┐   sendJob()    ┌──────────────┐   poll   ┌────────┐
│  Web    │ ─────────────► │  Postgres    │ ◄─────── │ Worker │
│ process │                │ (pgboss.*)   │          │ process│
└─────────┘                └──────────────┘          └────────┘
      ▲                                                   │
      └───────── app code + UI          ◄─────────────────┘
                                       work result / audit
```

The web process both enqueues and consumes jobs. [`startWorkers()`](../../src/lib/jobs/start-workers.ts) is invoked from [`src/instrumentation.ts`](../../src/instrumentation.ts) on server boot, so every Next.js Node instance attaches the pg-boss handlers alongside its HTTP server. Horizontally scaling the web tier is safe — pg-boss's `FOR UPDATE SKIP LOCKED` polling means each instance grabs its own jobs without duplicating work.

If OCR throughput ever needs to scale independently of HTTP traffic, re-extract a worker entrypoint and run it as a separate process / Railway service.

## The registry

[`QUEUES`](../../src/lib/jobs/queues.ts) is the one place queue names live. A typo on the send site would happily enqueue into a non-existent queue; the constant + the Zod payload schemas make both typos and malformed payloads into compile-time / parse-time failures:

```ts
export const QUEUES = {
  intakeOcr: "intake.ocr",
} as const;

export const intakeOcrPayload = z.object({
  intakeItemId: z.string().min(1),
});
```

Adding a queue:

1. Add a name to `QUEUES`.
2. Add a Zod payload schema.
3. Register it in `PAYLOAD_SCHEMAS`.
4. Write a worker handler under `src/lib/jobs/workers/`.
5. Register it from [`start-workers.ts`](../../src/lib/jobs/start-workers.ts).

## Sending

```ts
import { sendJob, QUEUES } from "@/lib/jobs";
await sendJob(QUEUES.intakeOcr, { intakeItemId: "int_…" });
```

`sendJob` validates the payload on the way out (catches a caller mistake immediately) and idempotently calls `createQueue` the first time a queue is used in this process.

## Handler contract

Handlers:

- Run one job at a time (current queue-level concurrency is set per-queue in [`start-workers.ts`](../../src/lib/jobs/start-workers.ts)).
- Receive `{ job, signal }` where `signal` is an `AbortSignal` that fires on heartbeat expiry / graceful shutdown.
- Re-validate the payload with the queue's Zod schema before doing any work.
- Import heavy dependencies (Drizzle, the S3 SDK, provider SDKs) lazily so the rest of the app's typecheck / test suite doesn't need them.

Failure policy:

- A throw → pg-boss marks the job failed, schedules a retry (default policy).
- A domain-level "business" failure (OCR said no, user data bad) → handler writes a `*_failed` audit + updates the intake/receipt/… row. pg-boss treats the job as succeeded. Retry is a user action, not a pg-boss action.

## Shutdown

Next.js doesn't expose a clean lifecycle hook for instrumentation, so pg-boss currently relies on its own runtime semantics: jobs killed mid-flight return to the queue once their `expireInSeconds` passes (configured per queue) and re-run on the next worker boot. Handlers should therefore be idempotent — see the [handler contract](#handler-contract) above.

## Running locally

```
pnpm dev
```

That's it. The web process attaches pg-boss handlers as part of its boot, so jobs you enqueue from a route immediately get picked up by the same process.
