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

const BULK_STATES = ["draft", "ready", "sent", "filed", "amending", "void"] as const;

export interface InvoiceMassActionsProps {
  selectedIds: string[];
  bulkTransition: (form: FormData) => void | Promise<void>;
  bulkMarkPaid: (form: FormData) => void | Promise<void>;
  onClear: () => void;
}

export function InvoiceMassActions(props: InvoiceMassActionsProps) {
  const [transitionTo, setTransitionTo] = useState<(typeof BULK_STATES)[number]>("sent");

  if (props.selectedIds.length === 0) return null;

  const hidden = props.selectedIds.map((id) => (
    <input key={id} type="hidden" name="ids" value={id} />
  ));

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${props.selectedIds.length} selected invoice(s)`}
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

      <form action={props.bulkMarkPaid}>
        {hidden}
        <Button type="submit" variant="outline" size="sm">
          Mark paid
        </Button>
      </form>

      <Button type="button" variant="ghost" size="sm" onClick={props.onClear} className="ml-auto">
        Clear
      </Button>
    </div>
  );
}
