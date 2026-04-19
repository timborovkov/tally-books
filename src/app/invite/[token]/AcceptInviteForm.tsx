"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInviteAction } from "@/lib/auth/actions";
import { signIn } from "@/lib/auth/client";

// The raw token is read from the URL param via useParams instead of
// being passed as a React prop. The browser already has it (it's in the
// address bar), but keeping it out of the serialized prop tree avoids
// the extra surface in RSC payloads, React DevTools, and error reports.
export function AcceptInviteForm({
  email,
  scope,
}: {
  email: string;
  scope: Array<{ resourceType: string; access: string }>;
}) {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "");
    const password = String(form.get("password") ?? "");
    if (!token) {
      setErr("Missing invite token in URL.");
      setPending(false);
      return;
    }
    const res = await acceptInviteAction({ token, name, password });
    if (!res.ok) {
      setErr(res.error ?? "Could not accept invite.");
      setPending(false);
      return;
    }
    const signInRes = await signIn.email({ email, password });
    if (signInRes.error) {
      setErr(signInRes.error.message ?? "Account created but sign-in failed.");
      setPending(false);
      return;
    }
    router.push("/enroll-2fa");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Accept invite</CardTitle>
        <CardDescription>
          You&apos;ve been invited to Tally as <strong>{email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-medium">You&apos;ll receive the following access:</p>
          <ul className="space-y-1 text-sm">
            {scope.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span className="bg-muted rounded px-2 py-0.5 font-mono text-xs">{g.access}</span>
                <span>{g.resourceType}</span>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" required minLength={1} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Choose a password</Label>
            <Input id="password" name="password" type="password" required minLength={12} />
            <p className="text-muted-foreground text-xs">
              At least 12 characters, with upper, lower, digit, and symbol.
            </p>
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Accept and continue"}
          </Button>
          <p className="text-muted-foreground text-xs">
            You&apos;ll be asked to set up 2FA next. No session is usable until 2FA is enrolled.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
