import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityForm } from "@/components/settings/EntityForm";
import { EntityPeoplePanel } from "@/components/settings/EntityPeoplePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { getEntityById } from "@/domains/entities";
import { listJurisdictions } from "@/domains/jurisdictions";
import { listPersons } from "@/domains/persons";

import {
  archiveEntityAction,
  linkPersonAction,
  unarchiveEntityAction,
  unlinkPersonAction,
  updateEntityAction,
} from "../actions";

export const dynamic = "force-dynamic";

interface EntityDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EntityDetailPage({ params }: EntityDetailPageProps) {
  const { id } = await params;
  const db = getDb();
  const [detail, jurisdictions, persons] = await Promise.all([
    getEntityById(db, id),
    listJurisdictions(db),
    listPersons(db),
  ]);

  if (!detail) notFound();

  const archived = detail.entity.archivedAt !== null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-muted-foreground mb-1 text-xs">
            <Link href="/settings/entities" className="hover:underline">
              Entities
            </Link>{" "}
            · {detail.jurisdiction.code}
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {detail.entity.name}
            {archived ? <Badge variant="secondary">Archived</Badge> : null}
          </h1>
        </div>
        <form action={archived ? unarchiveEntityAction : archiveEntityAction}>
          <input type="hidden" name="id" value={detail.entity.id} />
          <Button type="submit" variant={archived ? "default" : "outline"}>
            {archived ? "Unarchive" : "Archive"}
          </Button>
        </form>
      </header>

      <EntityForm
        jurisdictions={jurisdictions}
        entity={detail.entity}
        action={updateEntityAction}
        submitLabel="Save changes"
      />

      <hr />

      <EntityPeoplePanel
        entityId={detail.entity.id}
        links={detail.links}
        persons={persons}
        linkAction={linkPersonAction}
        unlinkAction={unlinkPersonAction}
      />
    </div>
  );
}
