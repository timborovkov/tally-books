import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentAttachUploader } from "@/components/settings/DocumentAttachUploader";
import { PartyForm } from "@/components/settings/PartyForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listDocuments } from "@/domains/documents";
import { getPartyById } from "@/domains/parties";

import { archivePartyAction, unarchivePartyAction, updatePartyAction } from "../actions";

interface PartyDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function PartyDetailPage({ params }: PartyDetailPageProps) {
  const { id } = await params;
  const db = getDb();

  const [party, documents] = await Promise.all([
    getPartyById(db, id),
    listDocuments(db, { ownerType: "party", ownerId: id }),
  ]);

  if (!party) notFound();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{party.name}</h1>
            <Badge variant="secondary">{party.kind}</Badge>
            {party.archivedAt ? <Badge variant="outline">archived</Badge> : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Updated {new Date(party.updatedAt).toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {party.archivedAt ? (
            <form action={unarchivePartyAction}>
              <input type="hidden" name="id" value={party.id} />
              <Button type="submit" variant="outline">
                Unarchive
              </Button>
            </form>
          ) : (
            <form action={archivePartyAction}>
              <input type="hidden" name="id" value={party.id} />
              <Button type="submit" variant="outline">
                Archive
              </Button>
            </form>
          )}
          <Button variant="ghost" asChild>
            <Link href="/settings/parties">Back</Link>
          </Button>
        </div>
      </header>

      <PartyForm party={party} action={updatePartyAction} submitLabel="Save" />

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documents</h2>
          <span className="text-muted-foreground text-xs">
            Contracts and other paperwork attached to this party.
          </span>
        </div>
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">No documents attached.</p>
        ) : (
          <ul className="text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between border-t py-2">
                <span>
                  <span className="font-medium">{d.title}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{d.kind}</span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(d.createdAt).toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DocumentAttachUploader ownerType="party" ownerId={party.id} />
      </section>
    </div>
  );
}
