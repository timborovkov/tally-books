export const dynamic = "force-dynamic";

import { listActiveUsers } from "@/lib/iam/admin-actions";
import { requireAdmin } from "@/lib/iam/session";

import { RemoveUserButton } from "./RemoveUserButton";

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const rows = await listActiveUsers();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">2FA</th>
            <th className="py-2 pr-4">Joined</th>
            <th className="w-32 py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2 pr-4">{u.email}</td>
              <td className="py-2 pr-4">{u.name ?? "—"}</td>
              <td className="py-2 pr-4 font-mono text-xs">{u.role}</td>
              <td className="py-2 pr-4">{u.twoFactorEnabledAt ? "on" : "off"}</td>
              <td className="py-2 pr-4">{u.createdAt.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">{u.id !== me.id && <RemoveUserButton userId={u.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
