import { cn } from "@/lib/utils";

/**
 * Standard loading skeleton primitive. Use inline for small placeholder
 * blocks (avatar, title row). For route-level loading, prefer composing
 * skeletons inside a `loading.tsx` file — see `docs/architecture/ui-conventions.md`.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}
