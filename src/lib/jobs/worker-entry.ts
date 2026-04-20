/**
 * Worker process entry point. Run via `pnpm worker` (or
 * `tsx src/lib/jobs/worker-entry.ts` directly).
 *
 * Registers every pg-boss handler defined under `./workers/`. One
 * worker process can host many handlers because pg-boss polls per
 * queue — adding another queue is a line in this file plus a handler
 * module.
 *
 * The web process never imports this file. Workers aren't needed to
 * serve HTTP requests; they're needed to drain work the HTTP
 * handlers enqueued. Separating entry points keeps Next.js cold-
 * start time untouched and makes horizontal scaling the worker
 * independent of the web tier.
 */
import { getBoss, stopBoss } from "./boss";
import { QUEUES } from "./queues";
import { registerIntakeOcrWorker } from "./workers/intake-ocr";

async function main(): Promise<void> {
  const boss = await getBoss();

  // pg-boss requires queues to exist before work() can attach. These
  // are the same createQueue calls the send path makes lazily — in
  // the worker we do them upfront so the polling loop starts
  // immediately instead of waiting for the first successful send.
  await boss.createQueue(QUEUES.intakeOcr);

  await registerIntakeOcrWorker(boss);

  console.warn("[worker] started");

  // Drain cleanly on signal so in-flight jobs aren't killed mid-flight.
  const shutdown = async (signal: string): Promise<void> => {
    console.warn(`[worker] received ${signal}, shutting down`);
    try {
      await stopBoss();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
