import { ReceiptForm } from "@/components/settings/ReceiptForm";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";

import { createReceiptAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  const entities = await listEntities(getDb(), { includeArchived: false });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">New receipt</h1>
        <p className="text-muted-foreground text-sm">
          Drafts can be edited freely. Transition to <code>ready</code> and <code>filed</code> from
          the detail page.
        </p>
      </header>

      <ReceiptForm
        entities={entities.map((e) => ({
          id: e.id,
          name: e.name,
          baseCurrency: e.baseCurrency,
        }))}
        receipt={null}
        action={createReceiptAction}
        submitLabel="Create receipt"
      />
    </div>
  );
}
