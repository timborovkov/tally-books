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

export interface MassActionsBarEntity {
  id: string;
  name: string;
  kind: string;
}

export interface MassActionsBarProps {
  selectedIds: string[];
  entities: MassActionsBarEntity[];
  /** Server action factories — pre-bound on the server page so this
   * client file doesn't import server-action modules directly. */
  bulkRoute: (formData: FormData) => void | Promise<void>;
  bulkMarkPersonal: (formData: FormData) => void | Promise<void>;
  bulkReExtract: (formData: FormData) => void | Promise<void>;
  bulkReject: (formData: FormData) => void | Promise<void>;
  bulkAttach: (formData: FormData) => void | Promise<void>;
  bulkRequestEvidence: (formData: FormData) => void | Promise<void>;
  onClear: () => void;
}

/**
 * Floating action bar for bulk operations on inbox rows. Appears
 * only when at least one row is selected. Each action is a form
 * that POSTs the selected ids (hidden inputs) to a server action.
 *
 * The route + attach actions need an entity + target flow choice;
 * those render a small inline picker so the user doesn't have to
 * leave the bar to set them.
 */
export function MassActionsBar(props: MassActionsBarProps): React.ReactElement | null {
  const [routeEntityId, setRouteEntityId] = useState<string>("");
  const [routeFlow, setRouteFlow] = useState<string>("expense");
  const [attachEntityId, setAttachEntityId] = useState<string>("");
  const [attachFlow, setAttachFlow] = useState<string>("trip");

  if (props.selectedIds.length === 0) return null;

  const hidden = props.selectedIds.map((id) => (
    <input key={id} type="hidden" name="ids" value={id} />
  ));

  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${props.selectedIds.length} selected item(s)`}
      className="bg-background sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-md border p-3 shadow-md"
    >
      <span className="text-sm font-medium">
        {props.selectedIds.length} selected
      </span>

      {/* Bulk route: entity + flow + submit */}
      <form action={props.bulkRoute} className="flex items-center gap-1.5">
        {hidden}
        <Select value={routeEntityId} onValueChange={setRouteEntityId} name="entityId">
          <SelectTrigger size="sm" className="w-[160px] text-xs">
            <SelectValue placeholder="Route to…" />
          </SelectTrigger>
          <SelectContent>
            {props.entities.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={routeFlow} onValueChange={setRouteFlow} name="targetFlow">
          <SelectTrigger size="sm" className="w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="trip">Trip</SelectItem>
            <SelectItem value="mileage">Mileage</SelectItem>
            <SelectItem value="benefit">Benefit</SelectItem>
            <SelectItem value="compliance_evidence">Compliance</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!routeEntityId}
        >
          Route
        </Button>
      </form>

      <form action={props.bulkMarkPersonal}>
        {hidden}
        <Button type="submit" variant="outline" size="sm">
          Mark personal
        </Button>
      </form>

      <form action={props.bulkReExtract}>
        {hidden}
        <Button type="submit" variant="outline" size="sm">
          Re-run OCR
        </Button>
      </form>

      <form action={props.bulkAttach} className="flex items-center gap-1.5">
        {hidden}
        <Select value={attachEntityId} onValueChange={setAttachEntityId} name="entityId">
          <SelectTrigger size="sm" className="w-[140px] text-xs">
            <SelectValue placeholder="Attach to…" />
          </SelectTrigger>
          <SelectContent>
            {props.entities.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={attachFlow} onValueChange={setAttachFlow} name="targetFlow">
          <SelectTrigger size="sm" className="w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trip">Trip</SelectItem>
            <SelectItem value="mileage">Mileage</SelectItem>
            <SelectItem value="benefit">Benefit</SelectItem>
            <SelectItem value="compliance_evidence">Compliance</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!attachEntityId}
        >
          Attach
        </Button>
      </form>

      <form action={props.bulkRequestEvidence}>
        {hidden}
        <Button type="submit" variant="outline" size="sm">
          Request evidence
        </Button>
      </form>

      <form action={props.bulkReject}>
        {hidden}
        <Button type="submit" variant="destructive" size="sm">
          Reject
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={props.onClear}
        className="ml-auto"
      >
        Clear
      </Button>
    </div>
  );
}
