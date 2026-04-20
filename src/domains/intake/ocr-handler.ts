/**
 * Bridges the pg-boss `intake.ocr` worker to the intake domain +
 * storage + vision provider.
 *
 * The worker can't directly import domain code without also pulling
 * in Drizzle, MinIO, and the OpenAI SDK at module-load time — which
 * would blow up typecheck or test suites that don't need any of
 * that. So the worker imports THIS module lazily (dynamic import
 * inside the handler callback), and this module wires everything
 * together.
 *
 * Failure is first-class: missing OPENAI_API_KEY, unreachable MinIO,
 * provider schema rejection all land on `intake_items.ocr_error`
 * with a readable message. The inbox UI surfaces that state.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { blobs, intakeItems } from "@/db/schema";
import { getVisionProvider } from "@/lib/ai";
import { env } from "@/lib/env";
import { BUCKETS, getBlobStream, type BucketName } from "@/lib/storage";

import { applyExtraction, markIntakeOcrFailed, markIntakeOcrRunning } from "./mutations";

async function readBlobBytes(bucket: BucketName, objectKey: string): Promise<Buffer> {
  const stream = await getBlobStream(bucket, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export async function processIntakeOcrJob(intakeItemId: string): Promise<void> {
  const db = getDb();

  try {
    // Fail fast if the provider isn't configured. No point
    // downloading bytes just to crash on the provider constructor.
    if (!env.OPENAI_API_KEY) {
      await markIntakeOcrFailed(db, {
        intakeItemId,
        error: "OPENAI_API_KEY is not set — cannot run OCR",
      });
      return;
    }

    // Lookup the blob so we can stream the scan from MinIO.
    const [row] = await db
      .select({ item: intakeItems, blob: blobs })
      .from(intakeItems)
      .innerJoin(blobs, eq(blobs.id, intakeItems.blobId))
      .where(eq(intakeItems.id, intakeItemId))
      .limit(1);
    if (!row) {
      // Probably racing a delete — nothing to do.
      console.warn(`[intake.ocr] intake_item ${intakeItemId} not found`);
      return;
    }

    // Sanity: the bucket must be the receipts bucket for v0.2
    // intake. If someone wired another bucket by accident, prefer
    // an explicit failure over a silent misroute. Check *before*
    // streaming bytes so a misrouted blob doesn't cost us a full
    // MinIO download just to reject.
    if (row.blob.bucket !== BUCKETS.receipts) {
      await markIntakeOcrFailed(db, {
        intakeItemId,
        error: `Intake blob is in unexpected bucket '${row.blob.bucket}'`,
      });
      return;
    }

    await markIntakeOcrRunning(db, intakeItemId);

    const bytes = await readBlobBytes(row.blob.bucket as BucketName, row.blob.objectKey);

    const provider = getVisionProvider();
    const extraction = await provider.extractReceipt({
      bytes,
      contentType: row.blob.contentType,
    });

    await applyExtraction(db, {
      intakeItemId,
      extraction,
      provider: provider.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await markIntakeOcrFailed(db, { intakeItemId, error: message });
    } catch (inner) {
      // If even the failure-marker write fails, surface both so
      // Sentry captures the real story — swallowing either would
      // leave the intake item wedged in 'running' forever.
      console.error("[intake.ocr] failed to mark failure:", inner);
      throw err;
    }
  }
}
