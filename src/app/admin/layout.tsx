export const dynamic = "force-dynamic";

import Link from "next/link";

import { requireAdmin } from "@/lib/iam/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <Link href="/" className="font-semibold">
          Tally
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/users" className="hover:underline">
            Users
          </Link>
          <Link href="/admin/invites" className="hover:underline">
            Invites
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
