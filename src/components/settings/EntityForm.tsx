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
  const initialJurisdiction =
    entity !== null ? jurisdictions.find((j) => j.id === entity.jurisdictionId) : jurisdictions[0];
  const initialConfig = initialJurisdiction
    ? parseJurisdictionConfigOrNull(initialJurisdiction.config)
    : null;
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
          <Select name="jurisdictionId" defaultValue={initialJurisdiction?.id ?? ""}>
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
          {initialConfig && initialConfig.entityTypes.length > 0 ? (
            <Select name="entityType" defaultValue={entity?.entityType ?? ""}>
              <SelectTrigger id="entityType">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {initialConfig.entityTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="entityType" name="entityType" defaultValue={entity?.entityType ?? ""} />
          )}
          <FieldHint>
            Allowed types come from the selected jurisdiction&apos;s config. Reload after switching.
          </FieldHint>
        </Field>

        <Field label="Business ID" htmlFor="businessId">
          <Input id="businessId" name="businessId" defaultValue={entity?.businessId ?? ""} />
        </Field>
        <Field label="Base currency (ISO 4217)" htmlFor="baseCurrency" required>
          <Select
            name="baseCurrency"
            defaultValue={entity?.baseCurrency ?? initialConfig?.defaultCurrency ?? "EUR"}
          >
            <SelectTrigger id="baseCurrency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => (
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
