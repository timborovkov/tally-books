import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Tally</h1>
      <p className="text-muted-foreground max-w-md">
        Self-hosted, single-tenant accounting, bookkeeping, and tax tooling for solo entrepreneurs
        across multiple jurisdictions.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
