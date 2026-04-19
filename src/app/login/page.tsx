export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { adminExists } from "@/lib/iam/bootstrap";

import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (!(await adminExists())) redirect("/setup");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 sm:p-12">
      <Logo type="full" orientation="vertical" size="lg" align="center" as="h2" />
      <LoginForm />
    </main>
  );
}
