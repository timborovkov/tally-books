import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonForm } from "@/components/settings/PersonForm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listJurisdictions } from "@/domains/jurisdictions";
import { getPersonById } from "@/domains/persons";

import { deletePersonAction, updatePersonAction } from "../actions";

export const dynamic = "force-dynamic";

interface PersonDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { id } = await params;
  const db = getDb();
  const [person, jurisdictions] = await Promise.all([getPersonById(db, id), listJurisdictions(db)]);

  if (!person) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            <Link href="/settings/persons" className="hover:underline">
              Persons
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">{person.legalName}</h1>
        </div>
        <form action={deletePersonAction}>
          <input type="hidden" name="id" value={person.id} />
          <Button type="submit" variant="outline">
            Delete
          </Button>
        </form>
      </header>

      <PersonForm
        jurisdictions={jurisdictions}
        person={person}
        action={updatePersonAction}
        submitLabel="Save changes"
      />
    </div>
  );
}
