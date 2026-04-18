import Link from "next/link";

import { EntityForm } from "@/components/settings/EntityForm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listJurisdictions } from "@/domains/jurisdictions";

import { createEntityAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEntityPage() {
  const jurisdictions = await listJurisdictions(getDb());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New entity</h1>
          <p className="text-muted-foreground text-sm">
            Create a legal entity or the personal pseudo-entity.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/settings/entities">Cancel</Link>
        </Button>
      </header>

      <EntityForm
        jurisdictions={jurisdictions}
        entity={null}
        action={createEntityAction}
        submitLabel="Create entity"
      />
    </div>
  );
}
