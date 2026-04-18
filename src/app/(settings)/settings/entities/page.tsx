import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";

export const dynamic = "force-dynamic";

interface EntitiesPageProps {
  searchParams: Promise<{ archived?: string }>;
}

export default async function EntitiesPage({ searchParams }: EntitiesPageProps) {
  const { archived } = await searchParams;
  const includeArchived = archived === "1";
  const rows = await listEntities(getDb(), { includeArchived });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entities</h1>
          <p className="text-muted-foreground text-sm">
            Legal entities and the personal pseudo-entity that every Thing in Tally points at.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/entities/new">New entity</Link>
        </Button>
      </header>

      <div className="text-muted-foreground flex items-center gap-3 text-sm">
        <Link
          href="/settings/entities"
          className={includeArchived ? "" : "text-foreground font-medium"}
        >
          Active
        </Link>
        <span>·</span>
        <Link
          href="/settings/entities?archived=1"
          className={includeArchived ? "text-foreground font-medium" : ""}
        >
          Include archived
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Jurisdiction</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                No entities yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/settings/entities/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={row.kind === "personal" ? "secondary" : "default"}>
                    {row.kind}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.jurisdiction.name}{" "}
                  <span className="text-muted-foreground">({row.jurisdiction.code})</span>
                </TableCell>
                <TableCell>{row.entityType ?? "—"}</TableCell>
                <TableCell>{row.baseCurrency}</TableCell>
                <TableCell>
                  {row.archivedAt === null ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Archived</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
