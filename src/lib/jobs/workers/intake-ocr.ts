/**
 * Worker: intake.ocr.
 *
 * Consumes an `intakeItemId`, reads its blob from RustFS, asks the
 * configured VisionProvider for structured receipt data, and writes
 * the result back onto `intake_items`. Runs one job at a time per
 * local worker slot — vision calls are slow and expensive so
 * batching delivers no wins, but a small local concurrency lets a
 * single worker process keep several extractions in flight.
 *
 * The handler is resilient to partial failure: missing blob, missing
 * OPENAI_API_KEY, provider error, or schema rejection all land on
 * the intake item as `ocrStatus='failed' + ocrError=<message>`. The
 * intake UI surfaces that state; the job itself is not retried from
 * here (pg-boss retry for a genuine transient, user-initiated
 * bulk-reextract for everything else).
 */
import { type PgBoss } from "pg-boss";

import { intakeOcrPayload, QUEUES, type IntakeOcrPayload } from "../queues";

/**
 * Register the intake.ocr worker on the provided pg-boss instance.
 * Called from the worker process entry point. Exported as a function
 * (rather than running at import time) so tests can import the
 * module without spinning up pg-boss.
 */
export async function registerIntakeOcrWorker(boss: PgBoss): Promise<string> {
  return boss.work<IntakeOcrPayload>(QUEUES.intakeOcr, { localConcurrency: 3 }, async ([job]) => {
    if (!job) return;
    const { intakeItemId } = intakeOcrPayload.parse(job.data);

    // Deferred until the intake domain + vision provider land in
    // the next two commits. Splitting the wiring from the handler
    // logic keeps commits reviewable — this commit proves pg-boss
    // is reachable; the next ones wire the business logic.
    const { processIntakeOcrJob } = await import("@/domains/intake/ocr-handler");
    await processIntakeOcrJob(intakeItemId);
  });
}
