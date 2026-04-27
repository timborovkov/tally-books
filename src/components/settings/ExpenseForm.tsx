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
import type { Category, Entity, Expense } from "@/db/schema";

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PAID_BY_OPTIONS = [
  { value: "entity", label: "Entity (business card / account)" },
  { value: "personal_reimbursable", label: "Personal card — reimbursable" },
  { value: "personal_no_reimburse", label: "Personal card — no reimbursement" },
] as const;

/**
 * Mirrors ReceiptForm.tsx — Server Component, native HTML form, server
 * action handles validation. Categories are filtered to `kind='expense'`
 * (and either global or matching the chosen entity) by the page that
 * mounts this component.
 */
export function ExpenseForm(props: {
  entities: Pick<Entity, "id" | "name" | "baseCurrency">[];
  categories: Pick<Category, "id" | "name" | "scope" | "entityId">[];
  expense: Expense | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  const isEdit = props.expense !== null;
  const defaultEntityId = props.expense?.entityId ?? props.entities[0]?.id;
  const defaultCurrency =
    props.expense?.currency ??
    props.entities.find((e) => e.id === defaultEntityId)?.baseCurrency ??
    "EUR";
  const defaultPaidBy = props.expense?.paidBy ?? "entity";

  return (
    <form action={props.action} className="flex max-w-2xl flex-col gap-4">
      {props.expense ? <input type="hidden" name="id" value={props.expense.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="entityId">Entity</Label>
        {isEdit ? (
          <>
            {/* Same rationale as ReceiptForm: moving an expense between
                entities crosses period-lock scope. Out of scope here. */}
            <Input
              id="entityId"
              value={props.entities.find((e) => e.id === props.expense!.entityId)?.name ?? ""}
              disabled
              readOnly
            />
            <input type="hidden" name="entityId" value={props.expense!.entityId} />
          </>
        ) : (
          <Select name="entityId" defaultValue={defaultEntityId}>
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
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="occurredAt">Date</Label>
        <Input
          id="occurredAt"
          name="occurredAt"
          type="date"
          required
          defaultValue={props.expense ? toDateInput(props.expense.occurredAt) : ""}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="vendor">Vendor (optional)</Label>
        <Input
          id="vendor"
          name="vendor"
          maxLength={200}
          defaultValue={props.expense?.vendor ?? ""}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          className="border-input bg-background ring-offset-background rounded-md border px-3 py-2 text-sm"
          defaultValue={props.expense?.categoryId ?? ""}
        >
          <option value="">— Uncategorised —</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.scope === "global" ? " (global)" : ""}
            </option>
          ))}
        </select>
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
            defaultValue={props.expense?.amount ?? ""}
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

      <fieldset className="border-border flex flex-col gap-3 rounded-md border p-3">
        <legend className="text-xs font-semibold">VAT (optional)</legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vatAmount">VAT amount</Label>
            <Input
              id="vatAmount"
              name="vatAmount"
              type="text"
              inputMode="decimal"
              pattern="^-?\d+(\.\d{1,4})?$"
              defaultValue={props.expense?.vatAmount ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vatRate">VAT rate (decimal)</Label>
            <Input
              id="vatRate"
              name="vatRate"
              type="text"
              inputMode="decimal"
              placeholder="0.24"
              pattern="^\d+(\.\d{1,4})?$"
              defaultValue={props.expense?.vatRate ?? ""}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="vatDeductible"
            value="true"
            defaultChecked={props.expense?.vatDeductible ?? true}
          />
          <span>VAT deductible</span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="paidBy">Paid by</Label>
        <Select name="paidBy" defaultValue={defaultPaidBy}>
          <SelectTrigger id="paidBy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAID_BY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={props.expense?.description ?? ""}
        />
      </div>

      {props.expense ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Change reason (optional)</Label>
          <Input id="reason" name="reason" maxLength={500} placeholder="e.g. corrected vendor" />
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit">{props.submitLabel}</Button>
      </div>
    </form>
  );
}
