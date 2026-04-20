/**
 * POST /api/intake/upload
 *
 * Multipart upload endpoint for receipt scans (1..N files per
 * request). For each file: write blob to MinIO → create intake_item
 * → enqueue OCR job.
 *
 * Why a route handler and not a server action: server actions wrap
 * their body in the React server action envelope, which doesn't
 * play well with large multipart payloads or progress reporting.
 * A plain route handler gives us the raw `request.formData()` API
 * and clean HTTP status codes for the dropzone client to render.
 *
 * Size cap: 15 MB per file (enough for high-DPI phone photos and
 * small multi-page PDFs; the outlier of a 50-page legal scan can
 * ride the legal-docs bucket route once that UI lands).
 */
import { NextResponse } from "next/server";
import { Readable } from "node:stream";

import { getDb } from "@/db/client";
import { createIntakeItem } from "@/domains/intake";
import { getCurrentUser } from "@/lib/iam/session";
import { sendJob, QUEUES } from "@/lib/jobs";
import { BUCKETS, putBlob } from "@/lib/storage";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

interface UploadResult {
  filename: string;
  intakeItemId?: string;
  blobId?: string;
  deduplicated?: boolean;
  error?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!user.twoFactorEnabledAt) {
    return NextResponse.json({ error: "2FA enrollment required" }, { status: 403 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided (expect 'files' field)" }, { status: 400 });
  }

  const db = getDb();
  const results: UploadResult[] = [];

  for (const file of files) {
    const result: UploadResult = { filename: file.name };
    try {
      if (file.size > MAX_FILE_BYTES) {
        result.error = `File exceeds ${MAX_FILE_BYTES} byte limit`;
        results.push(result);
        continue;
      }
      if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
        result.error = `Unsupported content type: ${file.type}`;
        results.push(result);
        continue;
      }

      // Convert Web File to Node Readable. The `file.stream()` API
      // returns a Web ReadableStream; `Readable.fromWeb()` adapts
      // it to the Node stream the upload service expects. No
      // intermediate buffer — bytes flow file → sha256 + MinIO.
      const webStream = file.stream();
      const nodeStream = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);

      const { blob, deduplicated } = await putBlob(db, {
        bucket: BUCKETS.receipts,
        stream: nodeStream,
        contentType: file.type,
        filename: file.name,
        uploadedById: user.id,
      });

      const intakeItem = await createIntakeItem(
        db,
        { userId: user.id, kind: "user", user: { id: user.id, role: user.role, removedAt: user.removedAt } },
        { blobId: blob.id, uploadedById: user.id },
      );

      // Enqueue OCR. Failures here don't roll back the upload — the
      // intake item exists, user can trigger a re-extract from the
      // inbox UI.
      try {
        await sendJob(QUEUES.intakeOcr, { intakeItemId: intakeItem.id });
      } catch (err) {
        console.error("[intake.upload] enqueue failed:", err);
      }

      result.intakeItemId = intakeItem.id;
      result.blobId = blob.id;
      result.deduplicated = deduplicated;
    } catch (err) {
      console.error("[intake.upload] failed:", err);
      result.error = err instanceof Error ? err.message : "Upload failed";
    }
    results.push(result);
  }

  return NextResponse.json({ results });
}
