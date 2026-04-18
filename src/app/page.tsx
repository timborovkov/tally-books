import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { adminExists } from "@/lib/iam/bootstrap";
import { getCurrentUser } from "@/lib/iam/session";

// The marketing splash is only reachable when no admin is signed in.
// Otherwise we push through the redirect cascade so returning users
// land on the app shell directly (and mid-bootstrap users complete 2FA
// instead of seeing a "Get started" button that would re-open the
// wizard).
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await adminExists())) redirect("/setup");
  const user = await getCurrentUser();
  if (user) {
    if (!user.twoFactorEnabledAt) redirect("/enroll-2fa");
    redirect("/settings/entities");
  }
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 p-6 text-center sm:p-12">
      <Logo type="full" orientation="vertical" size="xl" align="center" tagline as="h1" />
      <p className="text-muted-foreground max-w-xl text-balance">
        Business and personal finance, in one private instance. Books, taxes, invoices, mileage,
        benefits, and jurisdiction-guided compliance — across every entity you run.
      </p>
      <Button asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </main>
  );
}
