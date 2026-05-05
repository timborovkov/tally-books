import { and, asc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";

import type { Db } from "@/db/client";
import { parties, type Party } from "@/db/schema";
import type { partyKindEnum } from "@/db/schema/enums";
import { escapeLikePattern } from "@/lib/utils";

export type PartyKind = (typeof partyKindEnum.enumValues)[number];

export interface ListPartiesOptions {
  kinds?: readonly PartyKind[];
  search?: string;
  includeArchived?: boolean;
}

export async function listParties(db: Db, opts: ListPartiesOptions = {}): Promise<Party[]> {
  const conditions: SQL[] = [];
  if (opts.kinds && opts.kinds.length > 0) {
    const inList = opts.kinds
      .map((k) => eq(parties.kind, k))
      .reduce<SQL | undefined>((acc, c) => (acc ? or(acc, c) : c), undefined);
    if (inList) conditions.push(inList);
  }
  if (!opts.includeArchived) {
    conditions.push(isNull(parties.archivedAt));
  }
  if (opts.search && opts.search.trim().length > 0) {
    const term = `%${escapeLikePattern(opts.search.trim())}%`;
    const term$ = or(ilike(parties.name, term), ilike(parties.legalEntityId, term));
    if (term$) conditions.push(term$);
  }

  const where = conditions.length === 0 ? undefined : and(...conditions);

  return db.select().from(parties).where(where).orderBy(asc(parties.name));
}

export async function getPartyById(db: Db, id: string): Promise<Party | null> {
  const [row] = await db.select().from(parties).where(eq(parties.id, id)).limit(1);
  return row ?? null;
}

/**
 * Resolves an *active* counterparty by `legal_entity_id`. Used by the
 * internal-invoice mirror flow to find an existing party that
 * represents another tally entity before creating a new one. Archived
 * rows are deliberately excluded — `assertClientUsable` would reject
 * them on the regular create path, and the mirror flow needs the same
 * semantics to avoid silently linking new invoices to a soft-deleted
 * counterparty.
 */
export async function findPartyByLegalEntityId(
  db: Db,
  legalEntityId: string,
  kind: PartyKind,
): Promise<Party | null> {
  const [row] = await db
    .select()
    .from(parties)
    .where(
      and(
        eq(parties.legalEntityId, legalEntityId),
        eq(parties.kind, kind),
        isNull(parties.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
