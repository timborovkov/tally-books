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
import type { Entity, Receipt } from "@/db/schema";

// ISO-date string for <input type="date">. Receipts store occurredAt as
// a UTC timestamptz; the form truncates to the date portion.
function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Minimal create/edit form. Kept as a Server Component — no client
 * state is needed; native HTML form validation + the server action
 * handle everything. If we later need jurisdiction-aware currency
 * prefill (like EntityForm has), lift to client then.
 */
export function ReceiptForm(props: {
  entities: Pick<Entity, "id" | "name" | "baseCurrency">[];
  receipt: Receipt | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  const defaultCurrency = props.receipt?.currency ?? props.entities[0]?.baseCurrency ?? "EUR";

  return (
    <form action={props.action} className="flex max-w-2xl flex-col gap-4">
      {props.receipt ? <input type="hidden" name="id" value={props.receipt.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="entityId">Entity</Label>
        <Select name="entityId" defaultValue={props.receipt?.entityId ?? props.entities[0]?.id}>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="occurredAt">Date</Label>
        <Input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={props.receipt ? toDateInput(props.receipt.occurredAt) : ""}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor">Vendor</Label>
        <Input
          id="vendor"
          name="vendor"
          required
          maxLength={200}
          defaultValue={props.receipt?.vendor ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="text"
            inputMode="decimal"
            required
            pattern="^-?\d+(\.\d{1,4})?$"
            defaultValue={props.receipt?.amount ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            required
            pattern="^[A-Za-z]{3}$"
            maxLength={3}
            defaultValue={defaultCurrency}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={props.receipt?.notes ?? ""}
        />
      </div>

      {props.receipt ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Change reason (optional)</Label>
          <Input id="reason" name="reason" maxLength={500} placeholder="e.g. fixed vendor name" />
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit">{props.submitLabel}</Button>
      </div>
    </form>
  );
}
