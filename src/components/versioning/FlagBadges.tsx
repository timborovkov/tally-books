import { Badge } from "@/components/ui/badge";

/**
 * Renders the side-channel flags a versioned Thing can carry (data-
 * structure.md §3.1). These sit next to the state badge — state is
 * what it *is*, flags are what's *happening around it*.
 *
 * `inPeriodLock` is derived at render time (parent row's entity/
 * occurredAt tested against financialPeriods) — not a column on the
 * Thing itself.
 */
export function FlagBadges(props: {
  underlyingDataChanged?: boolean;
  autoRefreshLocked?: boolean;
  refreshPending?: boolean;
  inPeriodLock?: boolean;
}) {
  const flags: Array<{ label: string; variant: "destructive" | "outline" | "secondary" }> = [];
  if (props.underlyingDataChanged) {
    flags.push({ label: "Underlying data changed", variant: "destructive" });
  }
  if (props.inPeriodLock) {
    flags.push({ label: "In period lock", variant: "destructive" });
  }
  if (props.autoRefreshLocked) {
    flags.push({ label: "Auto-refresh locked", variant: "outline" });
  }
  if (props.refreshPending) {
    flags.push({ label: "Refresh pending", variant: "secondary" });
  }
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <Badge key={f.label} variant={f.variant}>
          {f.label}
        </Badge>
      ))}
    </div>
  );
}
