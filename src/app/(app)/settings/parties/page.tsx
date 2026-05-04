import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { listParties, type PartyKind } from "@/domains/parties";

interface PartiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_KINDS = ["client", "supplier", "contractor", "employee"] as const;

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asKindArray(v: string | string[] | undefined): PartyKind[] | undefined {
  const raw = Array.isArray(v) ? v : v ? [v] : [];
  const kinds = raw.filter((k): k is PartyKind => (VALID_KINDS as readonly string[]).includes(k));
  return kinds.length > 0 ? kinds : undefined;
}

export const dynamic = "force-dynamic";

export default async function PartiesPage({ searchParams }: PartiesPageProps) {
  const sp = await searchParams;
  const search = asString(sp.q);
  const kinds = asKindArray(sp.kind);
  const includeArchived = asString(sp.includeArchived) === "1";

  const parties = await listParties(getDb(), { search, kinds, includeArchived });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clients & suppliers</h1>
          <p className="text-muted-foreground text-sm">
            Counterparties: clients we bill, suppliers we buy from, contractors we engage, employees
            on payroll.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/parties/new">New party</Link>
        </Button>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" htmlFor="party-search">
            Search
          </label>
          <Input
            id="party-search"
            name="q"
            placeholder="Name or business id"
            defaultValue={search ?? ""}
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Kind</span>
          <div className="flex flex-wrap gap-3">
            {VALID_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name="kind"
                  value={k}
                  defaultChecked={kinds?.includes(k) ?? false}
                />
                {k}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeArchived"
            value="1"
            defaultChecked={includeArchived}
          />
          Show archived
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Business id</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parties.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                No parties yet.
              </TableCell>
            </TableRow>
          ) : (
            parties.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/settings/parties/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{p.kind}</Badge>
                </TableCell>
                <TableCell>{p.legalEntityId ?? "—"}</TableCell>
                <TableCell>
                  {p.archivedAt ? <Badge variant="outline">archived</Badge> : <Badge>active</Badge>}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
