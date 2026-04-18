"use client";

import { Fragment, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInviteAction } from "@/lib/iam/admin-actions";
import { RESOURCE_TYPES } from "@/lib/iam/types";

export function CreateInviteForm() {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function onSubmit(formData: FormData) {
    setErr(null);
    setOk(false);
    startTransition(async () => {
      const res = await createInviteAction(formData);
      if (res.ok) setOk(true);
      else setErr(res.error ?? "Something went wrong.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a user</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Access</legend>
            <div className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">Read</span>
              <span className="font-medium">Write</span>
              <span className="font-medium">Resource</span>
              {RESOURCE_TYPES.map((rt) => (
                <Fragment key={rt}>
                  <input
                    type="checkbox"
                    name="scope"
                    value={`${rt}:read`}
                    aria-label={`read ${rt}`}
                  />
                  <input
                    type="checkbox"
                    name="scope"
                    value={`${rt}:write`}
                    aria-label={`write ${rt}`}
                  />
                  <span>{rt}</span>
                </Fragment>
              ))}
            </div>
          </fieldset>
          {err && <p className="text-destructive text-sm">{err}</p>}
          {ok && <p className="text-sm text-emerald-600">Invite sent.</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
