"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBootstrapAdminAction,
  markBootstrapCompletedAction,
  markTwoFactorEnabledAction,
} from "@/lib/auth/actions";
import { signIn, twoFactor } from "@/lib/auth/client";

type Step = "admin" | "enroll-2fa" | "done";

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("admin");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");

  async function onCreateAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const name = String(form.get("name") ?? "");
    const password = String(form.get("password") ?? "");
    const res = await createBootstrapAdminAction({ email, name, password });
    if (!res.ok) {
      setErr(res.error ?? "Something went wrong.");
      setPending(false);
      return;
    }
    const signInRes = await signIn.email({ email, password });
    if (signInRes.error) {
      setErr(signInRes.error.message ?? "Could not sign in after setup.");
      setPending(false);
      return;
    }
    const enable = await twoFactor.enable({ password });
    if (enable.error || !enable.data) {
      setErr(enable.error?.message ?? "Could not start 2FA enrollment.");
      setPending(false);
      return;
    }
    setTotpURI(enable.data.totpURI);
    setBackupCodes(enable.data.backupCodes);
    setStep("enroll-2fa");
    setPending(false);
  }

  async function onVerifyTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const verify = await twoFactor.verifyTotp({ code });
    if (verify.error) {
      setErr(verify.error.message ?? "Invalid code.");
      setPending(false);
      return;
    }
    // Both server actions enforce server-side guards (real verified 2FA
    // factor, existing session). Surface any failure instead of silently
    // navigating — otherwise the user ends up in a redirect loop between
    // /setup, /enroll-2fa, and / with no hint why.
    const enableRes = await markTwoFactorEnabledAction();
    if (!enableRes.ok) {
      setErr(enableRes.error ?? "Could not enable 2FA.");
      setPending(false);
      return;
    }
    const bootstrapRes = await markBootstrapCompletedAction();
    if (!bootstrapRes.ok) {
      setErr(bootstrapRes.error ?? "Could not complete setup.");
      setPending(false);
      return;
    }
    // No re-auth: signing out + back in here would trigger BetterAuth's
    // twoFactorRedirect response (2FA is now enabled) and leave the user
    // stranded on the login page. The existing session stays valid, and
    // getCurrentUser() reads the updated user row on the next request.
    setStep("done");
    setPending(false);
    router.push("/");
  }

  if (step === "admin") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Tally</CardTitle>
          <CardDescription>
            Create the admin account. No one else can sign up — invite users later from the admin
            panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateAdmin} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required minLength={1} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={12} />
              <p className="text-muted-foreground text-xs">
                At least 12 characters, with upper, lower, digit, and symbol.
              </p>
            </div>
            {err && <p className="text-destructive text-sm">{err}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (step === "enroll-2fa" && totpURI) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enable 2FA</CardTitle>
          <CardDescription>
            Scan the URL below with an authenticator app (1Password, Google Authenticator, Authy),
            then enter the 6-digit code.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <pre className="bg-muted rounded-md p-3 text-xs break-all">{totpURI}</pre>
          {backupCodes.length > 0 && (
            <div className="text-sm">
              <strong>Backup codes</strong> — save these somewhere safe. Each works once.
              <pre className="bg-muted mt-2 rounded-md p-3 text-xs">{backupCodes.join("\n")}</pre>
            </div>
          )}
          <form onSubmit={onVerifyTotp} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {err && <p className="text-destructive text-sm">{err}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Verifying…" : "Verify and finish"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return null;
}
