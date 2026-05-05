/**
 * Start every pg-boss worker handler defined under `./workers/`.
 *
 * Called once per Node process during server boot (from
 * `src/instrumentation.ts`). The web process and the worker process
 * are merged today: the same Node runtime serves HTTP and drains
 * jobs. pg-boss handles concurrency safely across multiple instances
 * via `FOR UPDATE SKIP LOCKED`, so horizontal-scaling the web tier
 * doesn't duplicate work.
 *
 * Adding a new queue: declare it in `./queues.ts`, write a handler in
 * `./workers/<name>.ts` exporting a `register*Worker(boss)` function,
 * then add a `createQueue` + `register*Worker` call below.
 */
import { getBoss } from "./boss";
import { QUEUES } from "./queues";
import { registerIntakeOcrWorker } from "./workers/intake-ocr";

// Cache the in-flight promise rather than a boolean flag so a transient
// failure (Postgres briefly unreachable, etc.) doesn't permanently lock
// workers out for this process's lifetime. Concurrent callers dedup onto
// the same promise; on rejection the slot is cleared so the next caller
// can retry. Same pattern `boss.ts` uses for its own start.
let startPromise: Promise<void> | null = null;

export function startWorkers(): Promise<void> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    try {
      const boss = await getBoss();

      // pg-boss requires queues to exist before `work()` can attach.
      // The send path also lazily creates them, but doing it upfront
      // here means the polling loop starts immediately on boot
      // instead of waiting for the first successful send.
      await boss.createQueue(QUEUES.intakeOcr);

      await registerIntakeOcrWorker(boss);
    } catch (err) {
      startPromise = null;
      throw err;
    }
  })();

  return startPromise;
}
