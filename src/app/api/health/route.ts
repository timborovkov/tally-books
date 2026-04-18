import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
