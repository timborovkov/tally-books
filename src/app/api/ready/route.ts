import { NextResponse } from "next/server";

import { nowUtc, toIsoUtc } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Readiness probe.
 *
 * Once Postgres / RustFS / Qdrant clients are wired up (v0.1 §Database, §Files),
 * extend the `checks` array to ping each dependency and return 503 if any
 * required one is down. For now, returns 200 with an empty checks list so
 * orchestration tooling can be wired in advance.
 */
export function GET(): NextResponse {
  const checks: Record<string, "ok" | "fail" | "skip"> = {
    database: "skip",
    storage: "skip",
    vectors: "skip",
  };
  const allOk = !Object.values(checks).includes("fail");
  return NextResponse.json(
    { status: allOk ? "ready" : "not_ready", checks, timestamp: toIsoUtc(nowUtc()) },
    { status: allOk ? 200 : 503 },
  );
}
