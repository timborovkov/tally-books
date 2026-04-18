export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { adminExists } from "@/lib/iam/bootstrap";

import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (!(await adminExists())) redirect("/setup");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
