export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { adminExists } from "@/lib/iam/bootstrap";

import { SetupWizard } from "./SetupWizard";

export default async function SetupPage() {
  if (await adminExists()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 sm:p-12">
      <Logo type="full" orientation="vertical" size="lg" align="center" tagline as="h2" />
      <SetupWizard />
    </main>
  );
}
