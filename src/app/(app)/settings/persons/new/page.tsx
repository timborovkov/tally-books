import Link from "next/link";

import { PersonForm } from "@/components/settings/PersonForm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listJurisdictions } from "@/domains/jurisdictions";

import { createPersonAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPersonPage() {
  const jurisdictions = await listJurisdictions(getDb());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New person</h1>
        </div>
        <Button asChild variant="ghost">
          <Link href="/settings/persons">Cancel</Link>
        </Button>
      </header>

      <PersonForm
        jurisdictions={jurisdictions}
        person={null}
        action={createPersonAction}
        submitLabel="Create person"
      />
    </div>
  );
}
