import { Button } from "@/components/ui/button";

interface EntityOption {
  id: string;
  name: string;
}

interface Props {
  /** Form action — the path of the report page so GET resubmits to itself. */
  action: string;
  entities: readonly EntityOption[];
  selectedEntityId: string;
  fyStartYear: number;
  fyOptions: readonly { startYear: number; label: string }[];
  /** Optional extra hidden inputs (e.g. journal source filter). */
  extra?: React.ReactNode;
}

/**
 * Server-rendered period picker. A plain `<form method="get">` so the
 * URL is the source of truth — no client JS, no router shim, refresh-
 * and bookmark-friendly. Each report page reads the same querystring
 * params back via Next.js `searchParams`.
 */
export function PeriodPicker({
  action,
  entities,
  selectedEntityId,
  fyStartYear,
  fyOptions,
  extra,
}: Props): React.ReactElement {
  return (
    <form
      method="get"
      action={action}
      className="bg-muted/40 flex flex-wrap items-end gap-3 rounded-md border p-3"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Entity</span>
        <select
          name="entityId"
          defaultValue={selectedEntityId}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Fiscal year</span>
        <select
          name="fy"
          defaultValue={String(fyStartYear)}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {fyOptions.map((o) => (
            <option key={o.startYear} value={String(o.startYear)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {extra}
      <Button type="submit" size="sm">
        Update
      </Button>
    </form>
  );
}
