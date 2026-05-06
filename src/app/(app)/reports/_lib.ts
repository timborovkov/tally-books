import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import { getCurrentActor } from "@/lib/auth-shim";
import {
  fiscalYearForDate,
  fiscalYearFromStartYear,
  listFiscalYears,
  type FiscalYear,
} from "@/lib/fiscal-year";
import { can } from "@/lib/iam/permissions";

export interface ResolvedReportContext {
  entities: { id: string; name: string; financialYearStartMonth: number }[];
  selectedEntity: { id: string; name: string; financialYearStartMonth: number };
  fy: FiscalYear;
  fyOptions: { startYear: number; label: string }[];
}

// Bound `?fy=` to a sane range. The lower bound predates any plausible
// business; the upper bound prevents `Date.UTC` overflow into Invalid
// Date (which makes downstream `toISOString()` throw).
const FY_MIN = 1900;
const FY_MAX = 3000;

/**
 * Each report page calls this with its own searchParams. Picks the
 * entity (defaults to first the user can read reports on), resolves
 * the FY from `?fy=<startYear>` (defaults to the FY containing today),
 * and produces a 5-year FY dropdown around the selected year.
 *
 * Filters the entity list down to those the actor has `reports:read`
 * permission on so the picker doesn't leak names of entities they
 * can't actually report on, and so the page doesn't default to an
 * unauthorized entity and 500 on the downstream IAM gate.
 *
 * Returns 404 when the user has zero report-readable entities — the
 * report shells would render with empty dropdowns otherwise.
 */
export async function resolveReportContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ResolvedReportContext> {
  const db = getDb();
  const actor = await getCurrentActor(db);
  const allEntities = await listEntities(db, { includeArchived: false });

  // Filter by reports:read up front. Sequential await is fine — entity
  // lists are small (typically <10) and `can()` is a single indexed
  // query against `permissions`. Admins short-circuit inside `can()`.
  const allowed: typeof allEntities = [];
  for (const e of allEntities) {
    if (await can(db, actor.user, "reports", "read", { entityId: e.id })) {
      allowed.push(e);
    }
  }
  if (allowed.length === 0) notFound();

  const entityId = readParam(searchParams.entityId);
  const selectedEntity = (entityId && allowed.find((e) => e.id === entityId)) || allowed[0]!;

  const today = new Date();
  const currentFy = fiscalYearForDate(today, selectedEntity.financialYearStartMonth);
  const fyParam = readParam(searchParams.fy);
  const fy = parseFyParam(fyParam, selectedEntity.financialYearStartMonth) ?? currentFy;

  const baseYear = currentFy.startUtc.getUTCFullYear();
  const fyOptions = listFiscalYears(
    selectedEntity.financialYearStartMonth,
    baseYear - 4,
    baseYear + 1,
  ).map((f) => ({ startYear: f.startUtc.getUTCFullYear(), label: f.label }));

  return {
    entities: allowed.map((e) => ({
      id: e.id,
      name: e.name,
      financialYearStartMonth: e.financialYearStartMonth,
    })),
    selectedEntity: {
      id: selectedEntity.id,
      name: selectedEntity.name,
      financialYearStartMonth: selectedEntity.financialYearStartMonth,
    },
    fy,
    fyOptions,
  };
}

function parseFyParam(raw: string | undefined, fyStartMonth: number): FiscalYear | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < FY_MIN || n > FY_MAX) return null;
  return fiscalYearFromStartYear(n, fyStartMonth);
}

/**
 * Pull a single string out of Next.js's `searchParams` shape, which
 * delivers values as `string | string[] | undefined` because URLs can
 * repeat keys. Reports treat repeats as "first wins".
 */
export function readParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Format a numeric(20,4) string for display. Always 2 decimal places
 * with US thousands separators (commas). The lint rule bans `toLocale*`
 * because it can pull in host timezone behavior, so we format manually.
 * Currency goes alongside, not embedded — the table column carries it.
 */
export function formatAmount(decimal: string): string {
  const n = Number(decimal);
  if (!Number.isFinite(n)) return decimal;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withSeparators = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withSeparators}.${decPart}`;
}
