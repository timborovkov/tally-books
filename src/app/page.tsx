import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 p-6 text-center sm:p-12">
      <Logo type="full" orientation="vertical" size="xl" align="center" tagline as="h1" />
      <p className="text-muted-foreground max-w-xl text-balance">
        Business and personal finance, in one private instance. Books, taxes, invoices, mileage,
        benefits, and jurisdiction-guided compliance — across every entity you run.
      </p>
      <Button asChild>
        <Link href="/sign-in">Get started</Link>
      </Button>
    </main>
  );
}
