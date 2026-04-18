import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <Logo size="xl" tagline />
      <p className="text-muted-foreground max-w-md">
        Self-hosted, single-tenant accounting, bookkeeping, and tax tooling for solo entrepreneurs
        across multiple jurisdictions.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
