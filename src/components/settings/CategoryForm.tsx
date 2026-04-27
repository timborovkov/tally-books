"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, Entity } from "@/db/schema";

const KINDS = ["income", "expense", "asset", "liability", "equity"] as const;
const SCOPES = ["entity", "global"] as const; // personal-scope is created elsewhere when the personal pseudo-entity flow lands.

/**
 * Create/edit form for a single category. Client Component because
 * the entity field reveals/hides based on the scope dropdown selection
 * — global-scope rows must NOT pick an entity, and rendering both
 * unconditionally was misleading (cursor review caught this).
 *
 * On edit, scope/kind/entity are read-only (changing them would
 * invalidate every expense pointing at the row). Reparenting is
 * allowed; the domain layer rejects cycles and kind mismatches.
 *
 * Server actions cross the client/server boundary fine — the `action`
 * prop is a stable function reference Next.js handles transparently.
 */
export function CategoryForm(props: {
  entities: Pick<Entity, "id" | "name">[];
  /** Existing categories to pick a parent from. Pre-filtered by scope/kind upstream. */
  parentCandidates: Pick<Category, "id" | "name" | "kind" | "scope">[];
  category: Category | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  const isEdit = props.category !== null;
  const defaultScope = props.category?.scope ?? "entity";
  const defaultKind = props.category?.kind ?? "expense";

  // Scope drives whether the entity picker is shown. Tracked in state
  // so changing the scope dropdown immediately hides/shows the entity
  // field. On edit the scope is locked, so this never changes.
  const [scope, setScope] = useState<(typeof SCOPES)[number] | "personal">(defaultScope);

  return (
    <form action={props.action} className="flex max-w-xl flex-col gap-4">
      {props.category ? <input type="hidden" name="id" value={props.category.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scope">Scope</Label>
        {isEdit ? (
          <>
            <Input id="scope" value={defaultScope} disabled readOnly />
            <input type="hidden" name="scope" value={defaultScope} />
          </>
        ) : (
          <Select
            name="scope"
            defaultValue={defaultScope}
            onValueChange={(v) => setScope(v as (typeof SCOPES)[number])}
          >
            <SelectTrigger id="scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-muted-foreground text-xs">
          Entity-scoped categories are visible only inside one entity. Global categories are
          inherited by every entity read-only.
        </p>
      </div>

      {/*
        Only render the entity picker when scope = 'entity'. Global rows
        must not have an entityId, and the server action / Zod schema
        reject the combination. Hiding the field instead of disabling it
        keeps the form unambiguous: there is nothing to fill in.
      */}
      {scope === "entity" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entityId">Entity</Label>
          {isEdit ? (
            <>
              <Input
                id="entityId"
                value={props.entities.find((e) => e.id === props.category?.entityId)?.name ?? "—"}
                disabled
                readOnly
              />
              {props.category?.entityId ? (
                <input type="hidden" name="entityId" value={props.category.entityId} />
              ) : null}
            </>
          ) : (
            <Select name="entityId" defaultValue={props.entities[0]?.id}>
              <SelectTrigger id="entityId">
                <SelectValue placeholder="Select entity" />
              </SelectTrigger>
              <SelectContent>
                {props.entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kind">Kind</Label>
        {isEdit ? (
          <>
            <Input id="kind" value={defaultKind} disabled readOnly />
            <input type="hidden" name="kind" value={defaultKind} />
          </>
        ) : (
          <Select name="kind" defaultValue={defaultKind}>
            <SelectTrigger id="kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={props.category?.name ?? ""}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parentId">Parent (optional)</Label>
        <select
          id="parentId"
          name="parentId"
          className="border-input bg-background ring-offset-background rounded-md border px-3 py-2 text-sm"
          defaultValue={props.category?.parentId ?? ""}
        >
          <option value="">— None —</option>
          {props.parentCandidates
            .filter((c) => c.id !== props.category?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.kind}
                {c.scope === "global" ? " · global" : ""}
              </option>
            ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Code (chart-of-accounts, optional)</Label>
        <Input
          id="code"
          name="code"
          maxLength={50}
          defaultValue={props.category?.code ?? ""}
          placeholder="e.g. 5400"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit">{props.submitLabel}</Button>
      </div>
    </form>
  );
}
