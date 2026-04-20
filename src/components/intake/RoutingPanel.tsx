import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IntakeListRow } from "@/domains/intake";

export interface RoutingPanelEntity {
  id: string;
  name: string;
  kind: string;
}

export interface RoutingPanelProps {
  item: IntakeListRow;
  entities: RoutingPanelEntity[];
  /**
   * When `isTerminal` is true the panel renders read-only (no
   * submit, disabled inputs). Used on confirmed / rejected items
   * in the body of the detail page.
   */
  isTerminal?: boolean;
  /**
   * When set, the panel renders a re-route form bound to this
   * server action instead of the route-or-confirm one. Used in the
   * "Wrong route?" block on confirmed items.
   */
  reRouteAction?: (formData: FormData) => void | Promise<void>;
}

/**
 * Render the three-axis routing widget: personal-vs-business,
 * entity (when business), target flow.
 *
 * v0.2 caveat: only `targetFlow='expense'` has a downstream Thing
 * (receipt). The other choices are wired through the form so bulk
 * triage can tag them now, but the confirm flow won't create a
 * downstream artifact for them — the intake item just lands in
 * `confirmed` with no `receiptId` until the trip / mileage /
 * benefit / compliance domains land in v0.6+.
 */
export function RoutingPanel({
  item,
  entities,
  isTerminal,
  reRouteAction,
}: RoutingPanelProps): React.ReactElement {
  const defaultIsPersonal = item.isPersonal ?? "";
  const defaultEntityId = item.entityId ?? "";
  const defaultTargetFlow = item.targetFlow ?? "expense";

  const disabled = isTerminal && !reRouteAction;

  const form = (
    <div className="grid gap-3">
      <input type="hidden" name="id" value={item.id} />

      <div className="flex flex-col gap-1 text-sm">
        <Label htmlFor={`routing-scope-${item.id}`}>Scope</Label>
        <Select
          name="isPersonal"
          defaultValue={defaultIsPersonal}
          disabled={disabled}
        >
          <SelectTrigger id={`routing-scope-${item.id}`}>
            <SelectValue placeholder="Choose business or personal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Business (pick entity)</SelectItem>
            <SelectItem value="true">Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <Label htmlFor={`routing-entity-${item.id}`}>Entity</Label>
        <Select
          name="entityId"
          defaultValue={defaultEntityId}
          disabled={disabled}
        >
          <SelectTrigger id={`routing-entity-${item.id}`}>
            <SelectValue placeholder="Select entity" />
          </SelectTrigger>
          <SelectContent>
            {entities.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} {e.kind === "personal" ? "· personal" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">
          Leave blank when routing to Personal.
        </span>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <Label htmlFor={`routing-flow-${item.id}`}>Target flow</Label>
        <Select
          name="targetFlow"
          defaultValue={defaultTargetFlow}
          disabled={disabled}
        >
          <SelectTrigger id={`routing-flow-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Expense · creates a receipt</SelectItem>
            <SelectItem value="trip">Trip evidence · not yet wired</SelectItem>
            <SelectItem value="mileage">Mileage claim · not yet wired</SelectItem>
            <SelectItem value="benefit">Employer benefit · not yet wired</SelectItem>
            <SelectItem value="compliance_evidence">
              Compliance evidence · not yet wired
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {reRouteAction && (
        <div className="flex justify-end">
          <Button type="submit" variant="outline">
            Re-route
          </Button>
        </div>
      )}
    </div>
  );

  if (reRouteAction) {
    return <form action={reRouteAction}>{form}</form>;
  }
  return (
    <div className="border-border flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-sm font-semibold">Routing</h2>
      {form}
    </div>
  );
}
