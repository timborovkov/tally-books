/**
 * Queue registry + typed payload schemas.
 *
 * Every queue name is defined once here so a send-site typo becomes a
 * TS error rather than a silently-dropped job (pg-boss accepts any
 * string queue name — a misspelled queue becomes a no-op). Payloads
 * are Zod-validated at send time and again at work time so the worker
 * never runs against a shape it can't handle.
 */
import { z } from "zod";

export const QUEUES = {
  intakeOcr: "intake.ocr",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ── intake.ocr ──────────────────────────────────────────────────────
// Kick off OCR + structured extraction on a freshly-uploaded intake
// item. The worker reads the blob from RustFS, calls the configured
// VisionProvider, and writes the result back onto `intake_items`.
export const intakeOcrPayload = z.object({
  intakeItemId: z.string().min(1),
});
export type IntakeOcrPayload = z.infer<typeof intakeOcrPayload>;

export const PAYLOAD_SCHEMAS = {
  [QUEUES.intakeOcr]: intakeOcrPayload,
} as const;
