import Link from "next/link";

import { PartyForm } from "@/components/settings/PartyForm";
import { Button } from "@/components/ui/button";

import { createPartyAction } from "../actions";

export default function NewPartyPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New party</h1>
          <p className="text-muted-foreground text-sm">
            Add a client, supplier, contractor, or employee. Counterparties are shared across all
            entities.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/settings/parties">Back</Link>
        </Button>
      </header>
      <PartyForm party={null} action={createPartyAction} submitLabel="Create" />
    </div>
  );
}
