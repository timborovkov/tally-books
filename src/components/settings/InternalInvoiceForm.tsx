"use client";

import { useState } from "react";

import { InvoiceLineItemsComposer } from "@/components/settings/InvoiceLineItemsComposer";
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
import type { Entity } from "@/db/schema";

interface InternalInvoiceFormProps {
  entities: Pick<Entity, "id" | "name" | "baseCurrency">[];
  action: (formData: FormData) => void | Promise<void>;
}

export function InternalInvoiceForm({ entities, action }: InternalInvoiceFormProps) {
  const [sellerId, setSellerId] = useState<string>(entities[0]?.id ?? "");
  const [buyerId, setBuyerId] = useState<string>(entities[1]?.id ?? entities[0]?.id ?? "");
  const sellerCurrency = entities.find((e) => e.id === sellerId)?.baseCurrency ?? "EUR";
  const [currency, setCurrency] = useState<string>(sellerCurrency);

  const sameEntity = sellerId === buyerId;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sellerEntityId">
            Seller entity<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger id="sellerEntityId">
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
          <input type="hidden" name="sellerEntityId" value={sellerId} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="buyerEntityId">
            Buyer entity<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Select value={buyerId} onValueChange={setBuyerId}>
            <SelectTrigger id="buyerEntityId">
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
          <input type="hidden" name="buyerEntityId" value={buyerId} />
          {sameEntity ? (
            <p className="text-destructive text-xs">Seller and buyer must differ.</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" name="issueDate" type="date" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" name="dueDate" type="date" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Currency</Label>
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
      </div>

      <InvoiceLineItemsComposer initial={[]} currency={currency} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>

      <div>
        <Button type="submit" disabled={sameEntity}>
          Create both sides
        </Button>
      </div>
    </form>
  );
}
