/**
 * OCR handler — bridge between the pg-boss worker and the intake
 * domain's `applyExtraction` mutation.
 *
 * This module is imported lazily from the worker (see
 * `src/lib/jobs/workers/intake-ocr.ts`) so tests and web code can
 * touch the job layer without pulling in vision / domain code.
 *
 * The real implementation wires up in Commits 3 (vision provider) +
 * 5 (intake domain). Today it is a placeholder that proves the
 * worker can reach app code end-to-end.
 */
export async function processIntakeOcrJob(intakeItemId: string): Promise<void> {
  // Intentional stub: replaced when the intake domain lands. A worker
  // that hits this path before the full wiring logs and returns —
  // pg-boss treats the job as successful, the intake item sits at its
  // initial `ocrStatus` until then.
  console.warn(`[intake.ocr] stub handler invoked for ${intakeItemId}`);
}
