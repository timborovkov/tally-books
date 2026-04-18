import { cn } from "@/lib/utils";

interface DashboardCard {
  title: string;
  description: string;
}

// v0.1 dashboard is pure scaffold. Real data (upcoming filings, receipts,
// open TODOs) lands in v0.3+ — see TODO.md. The cards keep the layout
// realistic so later features drop in without re-templating.
const CARDS: readonly DashboardCard[] = [
  {
    title: "Upcoming filings",
    description: "Deadlines you need to hit this month.",
  },
  {
    title: "Recent receipts",
    description: "Latest uploads awaiting categorisation.",
  },
  {
    title: "Open tasks",
    description: "Things flagged for your review.",
  },
] as const;

export default function DashboardPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Everything that needs your attention, in one place.
        </p>
      </header>
      <section aria-label="Dashboard overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <article
            key={card.title}
            className={cn("bg-card rounded-lg border p-4 shadow-sm", "flex flex-col gap-2")}
          >
            <h2 className="text-sm font-medium">{card.title}</h2>
            <p className="text-muted-foreground text-xs">{card.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
