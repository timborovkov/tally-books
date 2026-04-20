import { Badge } from "@/components/ui/badge";
import type { ThingState } from "@/lib/versioning";

const VARIANT: Record<ThingState, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  ready: "outline",
  sent: "outline",
  filed: "default",
  amending: "destructive",
  void: "secondary",
};

const LABEL: Record<ThingState, string> = {
  draft: "Draft",
  ready: "Ready",
  sent: "Sent",
  filed: "Filed",
  amending: "Amending",
  void: "Void",
};

/**
 * Renders the lifecycle state with a consistent variant per value so
 * users learn the colour semantics once and read any versioned Thing
 * the same way.
 */
export function StateBadge({ state }: { state: ThingState }) {
  return <Badge variant={VARIANT[state]}>{LABEL[state]}</Badge>;
}
