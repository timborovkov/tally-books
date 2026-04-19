export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/iam/session";

import { Enroll2FA } from "./Enroll2FA";

export default async function Enroll2FAPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.twoFactorEnabledAt) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 sm:p-12">
      <Logo type="full" orientation="vertical" size="lg" align="center" as="h2" />
      <Enroll2FA />
    </main>
  );
}
