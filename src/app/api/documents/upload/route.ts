/**
 * POST /api/documents/upload
 *
 * Generic document upload — contracts, addenda, scans of legal mail.
 * Accepts a single multipart file plus owner metadata, writes the blob
 * to the `legal-docs` bucket, and creates a `documents` row linking it
 * to the supplied `(ownerType, ownerId)`.
 *
 * Distinct from the intake upload: those rows go through OCR and
 * routing. Documents are filed-and-forget — the user already knows
 * what the file is when they upload it, and we don't run vision over
 * a board resolution.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";

import { getDb } from "@/db/client";
import { entities, parties, persons } from "@/db/schema";
import { createDocument } from "@/domains/documents";
import { assertCan } from "@/lib/iam/permissions";
import { getCurrentUser } from "@/lib/iam/session";
import { BUCKETS, putBlob } from "@/lib/storage";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — contracts run long

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const VALID_OWNER_TYPES = new Set(["party", "person", "entity"]);
const VALID_KINDS = new Set([
  "contract",
  "addendum",
  "invoice_received",
  "filing",
  "government_mail",
  "insurance",
  "guide",
  "identification",
  "other",
]);

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.twoFactorEnabledAt) {
    return NextResponse.json({ error: "2FA enrollment required" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported content type: ${file.type}` }, { status: 400 });
  }

  const ownerType = formData.get("ownerType");
  const ownerId = formData.get("ownerId");
  const kind = formData.get("kind");
  const title = formData.get("title");
  if (typeof ownerType !== "string" || !VALID_OWNER_TYPES.has(ownerType)) {
    return NextResponse.json({ error: "Invalid ownerType" }, { status: 400 });
  }
  if (typeof ownerId !== "string" || ownerId === "") {
    return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });
  }
  if (typeof kind !== "string" || !VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  const description =
    typeof formData.get("description") === "string"
      ? (formData.get("description") as string)
      : null;
  const entityIdRaw = formData.get("entityId");
  const entityId =
    typeof entityIdRaw === "string" && entityIdRaw.trim() !== "" ? entityIdRaw : null;

  const db = getDb();
  const actor = {
    userId: user.id,
    kind: "user" as const,
    user: { id: user.id, role: user.role, removedAt: user.removedAt },
  };

  // Validate owner + IAM BEFORE streaming the blob to storage. Doing
  // the validation after upload (the prior order) leaves orphan blobs
  // in `legal-docs` whenever a request fails owner checks — an attacker
  // can cycle bogus `ownerId`s to fill storage even though `createDocument`
  // later rejects each request.
  if (ownerType === "party") {
    const [row] = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, ownerId));
    if (!row) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  } else if (ownerType === "person") {
    const [row] = await db.select({ id: persons.id }).from(persons).where(eq(persons.id, ownerId));
    if (!row) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  } else if (ownerType === "entity") {
    const [row] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, ownerId));
    if (!row) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }
  await assertCan(db, actor.user, "legal_documents", "write");

  const webStream = file.stream();
  const nodeStream = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);

  const { blob } = await putBlob(db, {
    bucket: BUCKETS.legalDocs,
    stream: nodeStream,
    contentType: file.type,
    filename: file.name,
    uploadedById: user.id,
  });

  const doc = await createDocument(db, actor, {
    entityId,
    kind: kind as Parameters<typeof createDocument>[2]["kind"],
    title: title.trim(),
    description: description ?? undefined,
    blobId: blob.id,
    ownerType: ownerType as Parameters<typeof createDocument>[2]["ownerType"],
    ownerId,
    tags: [],
    metadata: { originalFilename: file.name },
  });

  return NextResponse.json({ documentId: doc.id, blobId: blob.id });
}
