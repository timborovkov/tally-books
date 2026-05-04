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
import { Textarea } from "@/components/ui/textarea";
import type { Party } from "@/db/schema";
import type { PartyKind } from "@/domains/parties";

const KIND_LABELS: Record<PartyKind, string> = {
  client: "Client",
  supplier: "Supplier",
  contractor: "Contractor",
  employee: "Employee",
};

interface PartyFormProps {
  party: Party | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}

export function PartyForm({ party, action, submitLabel }: PartyFormProps) {
  const [kind, setKind] = useState<PartyKind>((party?.kind as PartyKind) ?? "client");
  const contact = (party?.contact as Record<string, unknown>) ?? {};
  const taxIds = (party?.taxIds as Record<string, string>) ?? {};
  const taxIdEntries = Object.entries(taxIds);
  const taxIdRows: ReadonlyArray<[string, string]> = [...taxIdEntries, ["", ""]];
  const address = (contact.address as Record<string, string> | undefined) ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      {party !== null ? <input type="hidden" name="id" value={party.id} /> : null}
      <input type="hidden" name="kind" value={kind} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kind">
            Kind<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PartyKind)}>
            <SelectTrigger id="kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as PartyKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">
            Name<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input id="name" name="name" required defaultValue={party?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="legalEntityId">Business / VAT id</Label>
          <Input
            id="legalEntityId"
            name="legalEntityId"
            defaultValue={party?.legalEntityId ?? ""}
            placeholder="EE123456789, FI12345678, …"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact_email">Email</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            defaultValue={(contact.email as string) ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact_phone">Phone</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            defaultValue={(contact.phone as string) ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact_website">Website</Label>
          <Input
            id="contact_website"
            name="contact_website"
            defaultValue={(contact.website as string) ?? ""}
          />
        </div>
      </div>

      <fieldset className="border-border flex flex-col gap-3 rounded-md border p-3">
        <legend className="text-xs font-semibold">Address</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_line1">Line 1</Label>
            <Input id="address_line1" name="address_line1" defaultValue={address.line1 ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_line2">Line 2</Label>
            <Input id="address_line2" name="address_line2" defaultValue={address.line2 ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_city">City</Label>
            <Input id="address_city" name="address_city" defaultValue={address.city ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_postcode">Postcode</Label>
            <Input
              id="address_postcode"
              name="address_postcode"
              defaultValue={address.postcode ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_region">Region</Label>
            <Input id="address_region" name="address_region" defaultValue={address.region ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address_country">Country (ISO 2/3)</Label>
            <Input
              id="address_country"
              name="address_country"
              defaultValue={address.country ?? ""}
              maxLength={3}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="border-border flex flex-col gap-3 rounded-md border p-3">
        <legend className="text-xs font-semibold">Tax IDs</legend>
        <p className="text-muted-foreground text-xs">
          Common keys: <code>vat</code>, <code>ein</code>, <code>businessId</code>. Empty rows are
          ignored.
        </p>
        {taxIdRows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-3">
            <Input name="taxIds_key" placeholder="key" defaultValue={row[0]} />
            <Input name="taxIds_value" placeholder="value" defaultValue={row[1]} />
          </div>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_notes">Notes</Label>
        <Textarea
          id="contact_notes"
          name="contact_notes"
          defaultValue={(contact.notes as string) ?? ""}
          rows={3}
        />
      </div>

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
