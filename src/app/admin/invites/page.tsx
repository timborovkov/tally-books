export const dynamic = "force-dynamic";

import { listOutstandingInvites } from "@/lib/iam/admin-actions";

import { CreateInviteForm } from "./CreateInviteForm";
import { RevokeInviteButton } from "./RevokeInviteButton";

export default async function AdminInvitesPage() {
  const rows = await listOutstandingInvites();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Outstanding invites</h1>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No outstanding invites.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Scope</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="w-32 py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-b align-top">
                  <td className="py-2 pr-4">{inv.email}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {inv.scope.map((g, i) => (
                      <div key={i}>
                        {g.access} {g.resourceType}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-4">
                    {inv.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4">
                    <RevokeInviteButton inviteId={inv.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CreateInviteForm />
    </div>
  );
}
