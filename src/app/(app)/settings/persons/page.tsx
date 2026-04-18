import Link from "next/link";

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
import { listPersons } from "@/domains/persons";

export const dynamic = "force-dynamic";

export default async function PersonsPage() {
  const persons = await listPersons(getDb());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Persons</h1>
          <p className="text-muted-foreground text-sm">
            Real humans linked to entities — board members, shareholders, contractors.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings/persons/new">New person</Link>
        </Button>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Legal name</TableHead>
            <TableHead>Tax residency</TableHead>
            <TableHead>Linked user?</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {persons.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                No persons yet.
              </TableCell>
            </TableRow>
          ) : (
            persons.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/settings/persons/${p.id}`} className="font-medium hover:underline">
                    {p.legalName}
                  </Link>
                </TableCell>
                <TableCell>{p.taxResidency ?? "—"}</TableCell>
                <TableCell>{p.userId === null ? "—" : "Yes"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
