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
import type { Jurisdiction, Person } from "@/db/schema";

interface PersonFormProps {
  jurisdictions: Jurisdiction[];
  person: Person | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}

export function PersonForm({ jurisdictions, person, action, submitLabel }: PersonFormProps) {
  const ids = (person?.ids as Record<string, string>) ?? {};
  const idEntries = Object.entries(ids);
  // Always render an extra empty row so the user can add a new ID.
  const rows: ReadonlyArray<[string, string]> = [...idEntries, ["", ""]];
  const contact = (person?.contact as Record<string, string>) ?? {};

  // Tax residency is optional. Radix Select can't hold an empty string
  // as a value (no SelectItem matches), so we keep it in state and
  // carry the submitted value via an explicit hidden input below —
  // same pattern as entityType in EntityForm.
  const [taxResidency, setTaxResidency] = useState<string>(person?.taxResidency ?? "");

  return (
    <form action={action} className="flex flex-col gap-6">
      {person !== null ? <input type="hidden" name="id" value={person.id} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="legalName">
            Legal name<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input id="legalName" name="legalName" required defaultValue={person?.legalName ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxResidency">Tax residency</Label>
          {/* Authoritative source for the submitted value; the Select
              below is display-only so the empty-string initial state
              stays valid for Radix (which rejects an empty-string
              value as a SelectItem match). */}
          <input type="hidden" name="taxResidency" value={taxResidency} />
          <Select value={taxResidency} onValueChange={setTaxResidency}>
            <SelectTrigger id="taxResidency">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {jurisdictions.map((j) => (
                <SelectItem key={j.code} value={j.code}>
                  {j.name} ({j.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact_email">Email</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            defaultValue={contact.email ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact_phone">Phone</Label>
          <Input id="contact_phone" name="contact_phone" defaultValue={contact.phone ?? ""} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="text-sm font-medium">Country IDs</legend>
        <p className="text-muted-foreground text-xs">
          E.g. <code>henkilotunnus</code>, <code>isikukood</code>, <code>NIE</code>,{" "}
          <code>SSN</code>. Empty rows are ignored.
        </p>
        {rows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-3">
            <Input name="ids_key" placeholder="key" defaultValue={row[0]} />
            <Input name="ids_value" placeholder="value" defaultValue={row[1]} />
          </div>
        ))}
      </fieldset>

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
