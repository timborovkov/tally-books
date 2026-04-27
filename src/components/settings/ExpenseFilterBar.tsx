"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";

const PAID_BY_OPTIONS = [
  { value: "entity", label: "Entity" },
  { value: "personal_reimbursable", label: "Personal · reimbursable" },
  { value: "personal_no_reimburse", label: "Personal" },
] as const;

const REIMB_OPTIONS = [
  { value: "not_applicable", label: "—" },
  { value: "pending", label: "Pending" },
  { value: "paid_back", label: "Paid back" },
] as const;

export interface ExpenseFilterBarProps {
  entities: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

/**
 * Client-side filter bar. URL is the source of truth — every change
 * pushes search params via `router.replace` and the server-rendered
 * list reflects them on the next render.
 *
 * Multi-selects are native `<select multiple>` to avoid pulling in a
 * combobox library for this PR. They render as a small scrollable
 * box in browsers, which is good enough for a few-dozen-option list.
 */
export function ExpenseFilterBar({ entities, categories }: ExpenseFilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const setMulti = useCallback(
    (key: string, values: string[]) => {
      const next = new URLSearchParams(sp?.toString() ?? "");
      next.delete(key);
      for (const v of values) next.append(key, v);
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, sp],
  );

  const setSingle = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp?.toString() ?? "");
      if (value && value.trim() !== "") next.set(key, value);
      else next.delete(key);
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, sp],
  );

  const reset = useCallback(() => {
    router.replace("?", { scroll: false });
  }, [router]);

  const get = (key: string) => sp?.getAll(key) ?? [];
  const single = (key: string) => sp?.get(key) ?? "";

  const onMultiChange = (key: string) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(e.target.selectedOptions)
      .map((o) => o.value)
      .filter(Boolean);
    setMulti(key, values);
  };

  return (
    <div className="border-border flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Search</Label>
          <SearchInput placeholder="Vendor, description, or id…" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-entity">
            Entities
          </Label>
          <select
            id="filter-entity"
            multiple
            size={Math.min(4, Math.max(2, entities.length))}
            className="border-input bg-background min-w-[160px] rounded-md border px-2 py-1 text-xs"
            value={get("entityId")}
            onChange={onMultiChange("entityId")}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-category">
            Categories
          </Label>
          <select
            id="filter-category"
            multiple
            size={Math.min(4, Math.max(2, categories.length))}
            className="border-input bg-background min-w-[160px] rounded-md border px-2 py-1 text-xs"
            value={get("categoryId")}
            onChange={onMultiChange("categoryId")}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-paidby">
            Paid by
          </Label>
          <select
            id="filter-paidby"
            multiple
            size={3}
            className="border-input bg-background min-w-[160px] rounded-md border px-2 py-1 text-xs"
            value={get("paidBy")}
            onChange={onMultiChange("paidBy")}
          >
            {PAID_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-reimb">
            Reimbursement
          </Label>
          <select
            id="filter-reimb"
            multiple
            size={3}
            className="border-input bg-background min-w-[140px] rounded-md border px-2 py-1 text-xs"
            value={get("reimbursementStatus")}
            onChange={onMultiChange("reimbursementStatus")}
          >
            {REIMB_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-vendor">
            Vendor (contains)
          </Label>
          <Input
            id="filter-vendor"
            type="search"
            defaultValue={single("vendor")}
            onBlur={(e) => setSingle("vendor", e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-from">
            From
          </Label>
          <Input
            id="filter-from"
            type="date"
            defaultValue={single("dateFrom")}
            onChange={(e) => setSingle("dateFrom", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor="filter-to">
            To
          </Label>
          <Input
            id="filter-to"
            type="date"
            defaultValue={single("dateTo")}
            onChange={(e) => setSingle("dateTo", e.target.value)}
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={reset} className="ml-auto">
          Reset
        </Button>
      </div>
    </div>
  );
}
