"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BULK_STATES = ["draft", "ready", "filed", "amending", "void"] as const;

export interface ExpenseMassActionsProps {
  selectedIds: string[];
  bulkTransition: (form: FormData) => void | Promise<void>;
  bulkMarkReimbursed: (form: FormData) => void | Promise<void>;
  onClear: () => void;
}

/**
 * Sticky toolbar that appears when at least one expense row is
 * selected. Each action is a tiny `<form>` that POSTs the selected
 * ids (hidden inputs) to the supplied server action.
 *
 * Caller passes pre-bound server actions so this client file never
 * imports from "use server" modules — keeps the bundle clean.
 */
export function ExpenseMassActions(props: ExpenseMassActionsProps) {
  const [transitionTo, setTransitionTo] = useState<(typeof BULK_STATES)[number]>("ready");

  if (props.selectedIds.length === 0) return null;

  const hidden = props.selectedIds.map((id) => (
    <input key={id} type="hidden" name="ids" value={id} />
  ));

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${props.selectedIds.length} selected expense(s)`}
      className="bg-background sticky bottom-4 z-20 mt-3 flex flex-wrap items-center gap-3 rounded-md border p-3 shadow-md"
    >
      <span className="text-sm font-medium">{props.selectedIds.length} selected</span>

      <form action={props.bulkTransition} className="flex items-center gap-1.5">
        {hidden}
        <Select
          value={transitionTo}
          onValueChange={(v) => setTransitionTo(v as (typeof BULK_STATES)[number])}
          name="nextState"
        >
          <SelectTrigger size="sm" className="w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BULK_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" size="sm">
          Transition
        </Button>
      </form>

      <form action={props.bulkMarkReimbursed}>
        {hidden}
        <Button type="submit" variant="outline" size="sm">
          Mark reimbursed
        </Button>
      </form>

      <Button type="button" variant="ghost" size="sm" onClick={props.onClear} className="ml-auto">
        Clear
      </Button>
    </div>
  );
}
