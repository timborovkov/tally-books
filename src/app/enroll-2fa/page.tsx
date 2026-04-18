export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/iam/session";

import { Enroll2FA } from "./Enroll2FA";

export default async function Enroll2FAPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.twoFactorEnabledAt) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Enroll2FA />
    </main>
  );
}
