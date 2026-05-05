import Link from "next/link";

import { InvoiceForm } from "@/components/settings/InvoiceForm";
import { InternalInvoiceForm } from "@/components/settings/InternalInvoiceForm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listEntities } from "@/domains/entities";
import { listParties } from "@/domains/parties";

import { createInternalInvoiceAction, createInvoiceAction } from "../actions";

interface NewInvoicePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const sp = await searchParams;
  const internal = (Array.isArray(sp.internal) ? sp.internal[0] : sp.internal) === "1";

  const db = getDb();
  const [entities, parties] = await Promise.all([
    listEntities(db, { includeArchived: false }),
    listParties(db),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {internal ? "New internal invoice" : "New invoice"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {internal
              ? "Bill from one entity to another. Both sides land as a draft, cross-linked via mirror_invoice_id, in one transaction."
              : "Draft an outgoing invoice. Number is assigned when you transition to ready."}
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/settings/invoices">Back</Link>
        </Button>
      </header>

      {internal ? (
        <InternalInvoiceForm entities={entities} action={createInternalInvoiceAction} />
      ) : (
        <InvoiceForm
          entities={entities}
          parties={parties}
          invoice={null}
          initialLineItems={[]}
          action={createInvoiceAction}
          submitLabel="Create draft"
        />
      )}
    </div>
  );
}
