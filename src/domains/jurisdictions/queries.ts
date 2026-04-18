import { asc, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { jurisdictions, type Jurisdiction } from "@/db/schema";

export async function listJurisdictions(db: Db): Promise<Jurisdiction[]> {
  return db.select().from(jurisdictions).orderBy(asc(jurisdictions.name));
}

export async function getJurisdictionByCode(db: Db, code: string): Promise<Jurisdiction | null> {
  const [row] = await db.select().from(jurisdictions).where(eq(jurisdictions.code, code)).limit(1);
  return row ?? null;
}
