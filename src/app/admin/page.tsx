export const dynamic = "force-dynamic";

import Link from "next/link";

export default function AdminDashboard() {
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-muted-foreground text-sm">
        Manage users and invites. More admin surfaces land as the rest of v0.1 ships.
      </p>
      <ul className="flex flex-col gap-2">
        <li>
          <Link className="underline" href="/admin/users">
            Users
          </Link>
        </li>
        <li>
          <Link className="underline" href="/admin/invites">
            Invites
          </Link>
        </li>
      </ul>
    </div>
  );
}
