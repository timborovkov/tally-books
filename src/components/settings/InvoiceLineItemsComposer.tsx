"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvoiceLineItem } from "@/domains/invoices";

interface InvoiceLineItemsComposerProps {
  initial: InvoiceLineItem[];
  currency: string;
}

interface RowState {
  description: string;
  quantity: string;
  unitPrice: string;
  unit: string;
  vatRate: string;
}

function emptyRow(): RowState {
  return { description: "", quantity: "1", unitPrice: "0", unit: "", vatRate: "0" };
}

function toRow(item: InvoiceLineItem): RowState {
  return {
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unit: item.unit ?? "",
    vatRate: item.vatRate ?? "0",
  };
}

function rowSubtotal(r: RowState): number {
  const qty = Number.parseFloat(r.quantity);
  const unit = Number.parseFloat(r.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(unit)) return 0;
  return qty * unit;
}

function rowVat(r: RowState): number {
  const sub = rowSubtotal(r);
  const rate = Number.parseFloat(r.vatRate);
  if (!Number.isFinite(rate)) return 0;
  return sub * rate;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * Client component. Holds the line-items array in local state, renders
 * a live total preview, and serialises the array as a hidden
 * `lineItems` field so the surrounding `<form>` posts a single JSON
 * blob to the server action. The action layer decodes it back through
 * `parseLineItems` so the same Zod schema validates both the composer
 * UI and any future programmatic callers.
 */
export function InvoiceLineItemsComposer({ initial, currency }: InvoiceLineItemsComposerProps) {
  const [rows, setRows] = useState<RowState[]>(
    initial.length > 0 ? initial.map(toRow) : [emptyRow()],
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const r of rows) {
      subtotal += rowSubtotal(r);
      vat += rowVat(r);
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [rows]);

  const serialised = useMemo<InvoiceLineItem[]>(
    () =>
      rows
        .filter((r) => r.description.trim() !== "")
        .map((r) => ({
          description: r.description.trim(),
          quantity: r.quantity || "0",
          unitPrice: r.unitPrice || "0",
          ...(r.unit ? { unit: r.unit } : {}),
          ...(r.vatRate && r.vatRate !== "0" ? { vatRate: r.vatRate } : {}),
        })),
    [rows],
  );

  return (
    <fieldset className="border-border flex flex-col gap-3 rounded-md border p-3">
      <legend className="text-sm font-semibold">Line items</legend>
      <input type="hidden" name="lineItems" value={JSON.stringify(serialised)} />

      <div className="flex flex-col gap-3">
        {rows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_5rem_7rem_5rem_5rem_2rem] items-end gap-2">
            <div className="flex flex-col gap-1">
              {idx === 0 ? <Label className="text-xs">Description</Label> : null}
              <Input
                value={row.description}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)),
                  )
                }
                placeholder="What was billed"
              />
            </div>
            <div className="flex flex-col gap-1">
              {idx === 0 ? <Label className="text-xs">Qty</Label> : null}
              <Input
                value={row.quantity}
                inputMode="decimal"
                pattern="\d+(\.\d+)?"
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)),
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              {idx === 0 ? <Label className="text-xs">Unit price ({currency})</Label> : null}
              <Input
                value={row.unitPrice}
                inputMode="decimal"
                pattern="-?\d+(\.\d+)?"
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === idx ? { ...r, unitPrice: e.target.value } : r)),
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              {idx === 0 ? <Label className="text-xs">Unit</Label> : null}
              <Input
                value={row.unit}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)),
                  )
                }
                placeholder="hour"
              />
            </div>
            <div className="flex flex-col gap-1">
              {idx === 0 ? <Label className="text-xs">VAT rate</Label> : null}
              <Input
                value={row.vatRate}
                inputMode="decimal"
                pattern="\d+(\.\d+)?"
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) => (i === idx ? { ...r, vatRate: e.target.value } : r)),
                  )
                }
                placeholder="0.24"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove line"
                onClick={() =>
                  setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== idx)))
                }
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setRows((rs) => [...rs, emptyRow()])}
      >
        Add line
      </Button>

      <div className="border-t pt-2 text-sm">
        <div className="flex justify-end gap-8">
          <span>Subtotal</span>
          <span className="w-24 text-right">
            {fmt(totals.subtotal)} {currency}
          </span>
        </div>
        <div className="flex justify-end gap-8">
          <span>VAT</span>
          <span className="w-24 text-right">
            {fmt(totals.vat)} {currency}
          </span>
        </div>
        <div className="flex justify-end gap-8 font-semibold">
          <span>Total</span>
          <span className="w-24 text-right">
            {fmt(totals.total)} {currency}
          </span>
        </div>
      </div>
    </fieldset>
  );
}
