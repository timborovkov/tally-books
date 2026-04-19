"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { revokeInviteAction } from "@/lib/iam/admin-actions";
import type { ActionResult } from "@/lib/server-action";

// React 19's useActionState wraps a server action and exposes its return
// value in `state`. We use it to surface `ActionResult.error` inline next
// to the button — otherwise the admin would click "Revoke", see no
// change, and have no idea the action was rejected.
async function run(_prev: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  return revokeInviteAction(formData);
}

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(run, null);
  const error = state && !state.ok ? state.error : null;
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </form>
  );
}
