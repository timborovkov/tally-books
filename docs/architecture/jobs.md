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

Web processes (Next.js) call `sendJob()` to enqueue. Workers (run via `pnpm worker` → [`worker-entry.ts`](../../src/lib/jobs/worker-entry.ts)) poll and execute handlers. Scale them independently:

```
docker compose --profile app up --scale worker=3
```

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
5. Register it from `worker-entry.ts`.

## Sending

```ts
import { sendJob, QUEUES } from "@/lib/jobs";
await sendJob(QUEUES.intakeOcr, { intakeItemId: "int_…" });
```

`sendJob` validates the payload on the way out (catches a caller mistake immediately) and idempotently calls `createQueue` the first time a queue is used in this process.

## Handler contract

Handlers:

- Run one job at a time (current queue-level concurrency is set per-queue in `worker-entry.ts`).
- Receive `{ job, signal }` where `signal` is an `AbortSignal` that fires on heartbeat expiry / graceful shutdown.
- Re-validate the payload with the queue's Zod schema before doing any work.
- Import heavy dependencies (Drizzle, the S3 SDK, provider SDKs) lazily so the rest of the app's typecheck / test suite doesn't need them.

Failure policy:

- A throw → pg-boss marks the job failed, schedules a retry (default policy).
- A domain-level "business" failure (OCR said no, user data bad) → handler writes a `*_failed` audit + updates the intake/receipt/… row. pg-boss treats the job as succeeded. Retry is a user action, not a pg-boss action.

## Shutdown

The worker entrypoint installs SIGINT/SIGTERM handlers that call `pg-boss.stop({ graceful: true })`. In-flight jobs finish; new ones don't get picked up; the process exits cleanly.

## Running locally

```
# In one terminal, on a docker-compose Postgres:
pnpm dev

# In another terminal:
pnpm worker
```

The worker process is independent. The web process can enqueue jobs without a worker running — they just sit in the queue until one comes up.
