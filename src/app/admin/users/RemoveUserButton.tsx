"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { removeUserAction } from "@/lib/iam/admin-actions";
import type { ActionResult } from "@/lib/server-action";

// React 19's useActionState surfaces the server action's ActionResult in
// `state`, which lets us display last-admin / permission errors inline
// instead of silently reloading the page.
async function run(_prev: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  return removeUserAction(formData);
}

export function RemoveUserButton({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(run, null);
  const error = state && !state.ok ? state.error : null;
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending} formNoValidate>
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </form>
  );
}
