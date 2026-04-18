import { NextResponse } from "next/server";

import { nowUtc, toIsoUtc } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", uptime: process.uptime(), timestamp: toIsoUtc(nowUtc()) },
    { status: 200 },
  );
}
