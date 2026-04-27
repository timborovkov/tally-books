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
import { listCategories } from "@/domains/categories";
import { listEntities } from "@/domains/entities";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const db = getDb();

  // listCategories with no entityId returns every non-archived row
  // (entity-scoped, personal, and global). One query is enough — the
  // earlier per-entity fan-out was redundant N+1 (cursor review caught
  // this).
  const [entities, allCategoriesRaw] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listCategories(db),
  ]);
  const allCategories = [...allCategoriesRaw].sort((a, b) => a.name.localeCompare(b.name));
  const entityName = new Map(entities.map((e) => [e.id, e.name]));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-muted-foreground text-sm">
            Chart-of-accounts categories used by expenses (and, eventually, invoices and bank
            transactions).
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/categories/new">New category</Link>
        </Button>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allCategories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                No categories yet.
              </TableCell>
            </TableRow>
          ) : (
            allCategories.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/settings/categories/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-xs uppercase">{c.kind}</TableCell>
                <TableCell className="text-xs uppercase">{c.scope}</TableCell>
                <TableCell>{c.entityId ? (entityName.get(c.entityId) ?? "—") : "—"}</TableCell>
                <TableCell className="font-mono text-xs">{c.code ?? "—"}</TableCell>
                <TableCell>
                  {c.archivedAt ? (
                    <Badge variant="secondary">Archived</Badge>
                  ) : (
                    <Badge>Active</Badge>
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
