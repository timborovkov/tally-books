/**
 * GET /api/blobs/:id
 *
 * Issues a redirect to a presigned RustFS URL for the blob with the
 * given id. Authenticated surface — checks session, finds the blob,
 * and defers to RustFS for the actual download.
 *
 * Authorisation: v0.2 simply requires an authenticated user with
 * 2FA. Once intake_items carry rich permission scopes (v0.3+) we
 * can refine to "user has read access to the entity that owns this
 * blob's receipt/invoice/etc.". For now any authed user can read
 * any blob — the app is single-tenant per deployment and uploads
 * come from the same set of trusted users.
 */
import { NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { blobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/iam/session";
import { presignBlobGetUrl, type BucketName } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.twoFactorEnabledAt) {
    return NextResponse.json({ error: "2FA enrollment required" }, { status: 403 });
  }

  const db = getDb();
  const [row] = await db.select().from(blobs).where(eq(blobs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Blob not found" }, { status: 404 });

  const url = await presignBlobGetUrl(row.bucket as BucketName, row.objectKey);
  return NextResponse.redirect(url, 302);
}
