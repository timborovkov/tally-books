import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the real dashboard layout so route transitions don't jump when
 * the real data streams in. Keep the shape in sync with `(app)/page.tsx`.
 */
export function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </section>
    </div>
  );
}
