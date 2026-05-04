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
import { Textarea } from "@/components/ui/textarea";
import type { Entity, Invoice, Party } from "@/db/schema";
import type { InvoiceDeliveryMethod, InvoiceLineItem } from "@/domains/invoices";

import { InvoiceLineItemsComposer } from "./InvoiceLineItemsComposer";

interface InvoiceFormProps {
  entities: Pick<Entity, "id" | "name" | "baseCurrency">[];
  parties: Pick<Party, "id" | "name" | "kind" | "archivedAt">[];
  invoice: Invoice | null;
  initialLineItems: InvoiceLineItem[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}

const DELIVERY_METHODS: InvoiceDeliveryMethod[] = ["pdf", "email", "manual", "e_invoice"];

function dateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function InvoiceForm({
  entities,
  parties: partyRows,
  invoice,
  initialLineItems,
  action,
  submitLabel,
}: InvoiceFormProps) {
  const isEdit = invoice !== null;
  const defaultEntityId = invoice?.entityId ?? entities[0]?.id ?? "";
  const [entityId, setEntityId] = useState<string>(defaultEntityId);
  const entityCurrency = entities.find((e) => e.id === entityId)?.baseCurrency ?? "EUR";
  const [currency, setCurrency] = useState<string>(invoice?.currency ?? entityCurrency);
  const visibleParties = useMemo(
    () => partyRows.filter((p) => !p.archivedAt || p.id === invoice?.clientId),
    [partyRows, invoice?.clientId],
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {invoice !== null ? <input type="hidden" name="id" value={invoice.id} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entityId">
            Entity<span className="text-destructive ml-0.5">*</span>
          </Label>
          {isEdit ? (
            <>
              <Input
                value={entities.find((e) => e.id === entityId)?.name ?? entityId}
                disabled
                readOnly
              />
              <input type="hidden" name="entityId" value={entityId} />
            </>
          ) : (
            <>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger id="entityId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="entityId" value={entityId} />
            </>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clientId">Client</Label>
          <Select name="clientId" defaultValue={invoice?.clientId ?? "__none"}>
            <SelectTrigger id="clientId">
              <SelectValue placeholder="No client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— No client</SelectItem>
              {visibleParties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.kind})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={dateInput(invoice?.issueDate)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={dateInput(invoice?.dueDate)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">
            Currency<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            pattern="[A-Z]{3}"
            maxLength={3}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deliveryMethod">Delivery method</Label>
          <Select
            name="deliveryMethod"
            defaultValue={invoice?.deliveryMethod ?? "pdf"}
          >
            <SelectTrigger id="deliveryMethod">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELIVERY_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isEdit ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="number">Invoice number</Label>
            <Input
              id="number"
              name="number"
              defaultValue={invoice?.number ?? ""}
              placeholder="Auto-assigned on transition to ready"
              disabled
              readOnly
            />
          </div>
        ) : null}
      </div>

      <InvoiceLineItemsComposer initial={initialLineItems} currency={currency} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Notes / description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={invoice?.description ?? ""}
          placeholder="Free-form note that prints on the PDF (purchase order ref, terms reminder, etc.)."
        />
      </div>

      {isEdit ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Edit reason</Label>
          <Input id="reason" name="reason" placeholder="Why this change?" />
          <p className="text-muted-foreground text-xs">
            Saved on the new version row so the timeline reads cleanly.
          </p>
        </div>
      ) : null}

      <div>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
