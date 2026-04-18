import { asc, eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { persons, type Person } from "@/db/schema";

export async function listPersons(db: Db): Promise<Person[]> {
  return db.select().from(persons).orderBy(asc(persons.legalName));
}

export async function getPersonById(db: Db, id: string): Promise<Person | null> {
  const [row] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
  return row ?? null;
}
