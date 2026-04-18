export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { adminExists } from "@/lib/iam/bootstrap";

import { SetupWizard } from "./SetupWizard";

export default async function SetupPage() {
  if (await adminExists()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SetupWizard />
    </main>
  );
}
