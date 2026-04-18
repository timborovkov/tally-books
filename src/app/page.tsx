import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <Logo size="xl" tagline />
      <p className="text-muted-foreground max-w-xl">
        Business and personal finance, in one private instance. Books, taxes, invoices, mileage,
        benefits, and jurisdiction-guided compliance — across every entity you run.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
