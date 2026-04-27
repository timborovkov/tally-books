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

  // Pull all entities so the list view can show entity-scoped rows
  // beside global ones. The cross-entity scan here mirrors the
  // expense list page's "all entities by default" behaviour.
  const entities = await listEntities(db, { includeArchived: false });
  // Fetch global rows once + per-entity rows in parallel. Could be one
  // query with a fat WHERE; this is clearer and the list is small.
  const categoryGroups = await Promise.all([
    listCategories(db),
    ...entities.map((e) => listCategories(db, { entityId: e.id })),
  ]);

  // Deduplicate by id — the same global row appears in every per-entity
  // result. Using a Map keeps the first occurrence's order.
  const seen = new Map<string, (typeof categoryGroups)[number][number]>();
  for (const group of categoryGroups) {
    for (const c of group) {
      seen.set(c.id, c);
    }
  }
  const allCategories = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
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
