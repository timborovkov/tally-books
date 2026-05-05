import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { nowUtc, toIsoUtc } from "@/lib/dates";
import { BUCKETS } from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Readiness probe.
 *
 * Use this as the orchestrator's readiness check (Railway / Kubernetes /
 * Fly). Liveness stays on `/api/health` — that one only proves the
 * process is alive. This one proves the process can do useful work:
 *
 *   - `database` round-trips a `SELECT 1` against Postgres.
 *   - `storage`  pings the `receipts` bucket via `HeadBucketCommand`.
 *
 * Returns 503 if any required dependency is down. Checks run in parallel
 * so a slow Postgres doesn't serialize behind a slow S3.
 *
 * Failures get logged with the underlying error so ops can grep for the
 * cause (Postgres unreachable, S3 credentials wrong, bucket missing,
 * etc) — the JSON response only carries the verdict.
 */

type CheckStatus = "ok" | "fail";

async function checkDatabase(): Promise<CheckStatus> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return "ok";
  } catch (err) {
    console.error("[ready] database check failed:", err);
    return "fail";
  }
}

async function checkStorage(): Promise<CheckStatus> {
  try {
    await getStorageClient().send(new HeadBucketCommand({ Bucket: BUCKETS.receipts }));
    return "ok";
  } catch (err) {
    console.error("[ready] storage check failed:", err);
    return "fail";
  }
}

export async function GET(): Promise<NextResponse> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const checks: Record<string, CheckStatus> = { database, storage };
  const allOk = !Object.values(checks).includes("fail");
  return NextResponse.json(
    { status: allOk ? "ready" : "not_ready", checks, timestamp: toIsoUtc(nowUtc()) },
    { status: allOk ? 200 : 503 },
  );
}
