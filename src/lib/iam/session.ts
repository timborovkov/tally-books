import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";

const db = getDb();
import type { User } from "@/db/schema";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth/auth";

// Returns the full user row from our DB for the current BetterAuth session.
// Reads BetterAuth session first to avoid trusting cookies directly.
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const [row] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!row || row.removedAt) return null;
  return row;
}

// Gate for every authenticated surface. A session without 2FA enrolled is
// not a usable session per spec §5.1.3 — even mid-bootstrap admins must
// finish enrollment before touching /admin or any other protected page.
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.twoFactorEnabledAt) redirect("/enroll-2fa");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== "admin") redirect("/");
  return user;
}
