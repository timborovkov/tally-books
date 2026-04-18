"use client";

import { useMemo, useState } from "react";

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
import type { Entity, Jurisdiction } from "@/db/schema";
import { jurisdictionConfigSchema, type JurisdictionConfig } from "@/lib/jurisdictions/types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Baseline convenience options — rendered on top of whatever the
// jurisdictions expose. Not authoritative: the final option list also
// includes every jurisdiction's default currency and the currently
// selected value, so nothing can render as a blank trigger.
const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "SEK", "NOK", "DKK", "CHF"];

interface EntityFormProps {
  jurisdictions: Jurisdiction[];
  entity: Entity | null;
  /** When set, the form posts to this server action. */
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}

function parseJurisdictionConfigOrNull(value: unknown): JurisdictionConfig | null {
  const parsed = jurisdictionConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function EntityForm({ jurisdictions, entity, action, submitLabel }: EntityFormProps) {
  const isNew = entity === null;
  const initialJurisdictionId = entity?.jurisdictionId ?? jurisdictions[0]?.id ?? "";

  // Track jurisdiction client-side so the entity-type dropdown stays in
  // sync when the user picks a different jurisdiction. The server still
  // validates `entityType ∈ jurisdiction.config.entityTypes` in
  // createEntity/updateEntity — this client behaviour is just UX.
  const [jurisdictionId, setJurisdictionId] = useState<string>(initialJurisdictionId);
  const [entityType, setEntityType] = useState<string>(entity?.entityType ?? "");

  const selectedJurisdiction = useMemo(
    () => jurisdictions.find((j) => j.id === jurisdictionId),
    [jurisdictions, jurisdictionId],
  );
  const selectedConfig = useMemo(
    () =>
      selectedJurisdiction ? parseJurisdictionConfigOrNull(selectedJurisdiction.config) : null,
    [selectedJurisdiction],
  );

  // baseCurrency is controlled so the default tracks the selected
  // jurisdiction. `defaultValue` wouldn't re-render — the user would
  // silently carry the prior jurisdiction's currency into a new one.
  // Initial value: saved entity currency (edit), else jurisdiction
  // default, else EUR as a last resort.
  const [baseCurrency, setBaseCurrency] = useState<string>(
    entity?.baseCurrency ?? selectedConfig?.defaultCurrency ?? "EUR",
  );

  const entityTypeOptions = selectedConfig?.entityTypes ?? [];
  // If the saved entityType isn't valid for the selected jurisdiction's
  // config, the Select shows nothing selected — the server's validator
  // catches a stale value if the user submits without picking a new one.
  const entityTypeValueIsValid = entityType === "" || entityTypeOptions.includes(entityType);

  // Currency options are the union of: the hardcoded commons, every
  // jurisdiction's default currency (so auto-switch always has a matching
  // option), and the currently-selected value (so editing an entity whose
  // baseCurrency is outside the hardcoded list doesn't render a blank
  // trigger). De-duplicated and sorted for a stable list order.
  const currencyOptions = useMemo(() => {
    const set = new Set<string>(COMMON_CURRENCIES);
    for (const j of jurisdictions) {
      const cfg = parseJurisdictionConfigOrNull(j.config);
      if (cfg?.defaultCurrency) set.add(cfg.defaultCurrency);
    }
    if (baseCurrency) set.add(baseCurrency);
    return [...set].sort();
  }, [jurisdictions, baseCurrency]);

  const address: Record<string, string | undefined> =
    (entity?.address as Record<string, string | undefined>) ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      {!isNew && entity ? <input type="hidden" name="id" value={entity.id} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" required defaultValue={entity?.name ?? ""} />
        </Field>
        {isNew ? (
          <Field label="Kind" htmlFor="kind" required>
            <Select name="kind" defaultValue="legal">
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="legal">Legal entity</SelectItem>
                <SelectItem value="personal">Personal (pseudo-entity)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Kind" htmlFor="kind">
            <Input id="kind" disabled defaultValue={entity.kind} />
          </Field>
        )}

        <Field label="Jurisdiction" htmlFor="jurisdictionId" required>
          <Select
            name="jurisdictionId"
            value={jurisdictionId}
            onValueChange={(v) => {
              setJurisdictionId(v);
              const next = jurisdictions.find((j) => j.id === v);
              const nextConfig = next ? parseJurisdictionConfigOrNull(next.config) : null;
              // Reset entity type if it isn't valid for the new jurisdiction.
              if (entityType && !nextConfig?.entityTypes.includes(entityType)) {
                setEntityType("");
              }
              // If the user is currently on the old jurisdiction's
              // default currency (i.e., they haven't manually picked
              // something else), switch to the new jurisdiction's
              // default. Keep the user's manual choice otherwise.
              const oldDefault = selectedConfig?.defaultCurrency;
              const nextDefault = nextConfig?.defaultCurrency;
              if (nextDefault && baseCurrency === oldDefault) {
                setBaseCurrency(nextDefault);
              }
            }}
          >
            <SelectTrigger id="jurisdictionId">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {jurisdictions.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.name} ({j.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Entity type" htmlFor="entityType">
          {/* Authoritative source for what gets submitted. Radix Select
              only emits its own hidden input when an item is selected,
              so an empty Select would silently drop entityType from
              FormData; this hidden input ensures the field is always
              present (as "" when nothing is picked) regardless of which
              UI variant renders below. */}
          <input type="hidden" name="entityType" value={entityType} />
          {entityTypeOptions.length > 0 ? (
            <Select value={entityTypeValueIsValid ? entityType : ""} onValueChange={setEntityType}>
              <SelectTrigger id="entityType">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {entityTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="entityType"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          )}
          <FieldHint>
            Allowed types come from the selected jurisdiction&apos;s config. Switching jurisdictions
            clears this field if the value isn&apos;t allowed in the new one.
          </FieldHint>
        </Field>

        <Field label="Business ID" htmlFor="businessId">
          <Input id="businessId" name="businessId" defaultValue={entity?.businessId ?? ""} />
        </Field>
        <Field label="Base currency (ISO 4217)" htmlFor="baseCurrency" required>
          <Select name="baseCurrency" value={baseCurrency} onValueChange={setBaseCurrency}>
            <SelectTrigger id="baseCurrency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Financial year start month" htmlFor="financialYearStartMonth" required>
          <Select
            name="financialYearStartMonth"
            defaultValue={String(entity?.financialYearStartMonth ?? 1)}
          >
            <SelectTrigger id="financialYearStartMonth">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((label, idx) => (
                <SelectItem key={label} value={String(idx + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="VAT number" htmlFor="vatNumber">
          <Input id="vatNumber" name="vatNumber" defaultValue={entity?.vatNumber ?? ""} />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="vatRegistered"
              defaultChecked={entity?.vatRegistered ?? false}
              className="size-4"
            />
            VAT registered
          </label>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="text-sm font-medium">Address</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Line 1" htmlFor="address_line1">
            <Input id="address_line1" name="address_line1" defaultValue={address.line1 ?? ""} />
          </Field>
          <Field label="Line 2" htmlFor="address_line2">
            <Input id="address_line2" name="address_line2" defaultValue={address.line2 ?? ""} />
          </Field>
          <Field label="City" htmlFor="address_city">
            <Input id="address_city" name="address_city" defaultValue={address.city ?? ""} />
          </Field>
          <Field label="Region" htmlFor="address_region">
            <Input id="address_region" name="address_region" defaultValue={address.region ?? ""} />
          </Field>
          <Field label="Postcode" htmlFor="address_postcode">
            <Input
              id="address_postcode"
              name="address_postcode"
              defaultValue={address.postcode ?? ""}
            />
          </Field>
          <Field label="Country" htmlFor="address_country">
            <Input
              id="address_country"
              name="address_country"
              defaultValue={address.country ?? ""}
            />
          </Field>
        </div>
      </fieldset>

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}
