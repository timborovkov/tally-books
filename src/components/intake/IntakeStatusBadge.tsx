import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  needs_review: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  routed: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  confirmed: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  rejected: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

const LABELS: Record<string, string> = {
  new: "New",
  needs_review: "Needs review",
  routed: "Routed",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

export function IntakeStatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        TONES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
