import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { adminExists } from "@/lib/iam/bootstrap";
import { getCurrentUser } from "@/lib/iam/session";

// Every route inside the (app) shell is authenticated. The gating lives
// here so each page doesn't repeat the check, and so the redirect cascade
// (no admin → /setup, no session → /login, no 2FA → /enroll-2fa) runs
// before any page component loads.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  if (!(await adminExists())) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.twoFactorEnabledAt) redirect("/enroll-2fa");
  return <AppShell>{children}</AppShell>;
}
