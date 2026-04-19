"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markBootstrapCompletedAction, markTwoFactorEnabledAction } from "@/lib/auth/actions";
import { twoFactor } from "@/lib/auth/client";

type Step = "password" | "scan" | "done";

export function Enroll2FA() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");

  async function onStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const res = await twoFactor.enable({ password });
    if (res.error || !res.data) {
      setErr(res.error?.message ?? "Could not start 2FA enrollment.");
      setPending(false);
      return;
    }
    setTotpURI(res.data.totpURI);
    setBackupCodes(res.data.backupCodes);
    setStep("scan");
    setPending(false);
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
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
    // factor, existing session). Silently navigating on failure would
    // leave the gate un-flipped and trap the user in a redirect loop, so
    // surface any error and halt before redirect.
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
    setStep("done");
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set up 2FA</CardTitle>
        <CardDescription>
          Two-factor authentication is required before you can use Tally.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "password" && (
          <form onSubmit={onStart} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Confirm your password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {err && <p className="text-destructive text-sm">{err}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Starting…" : "Begin enrollment"}
            </Button>
          </form>
        )}
        {step === "scan" && totpURI && (
          <div className="flex flex-col gap-4">
            <pre className="bg-muted rounded-md p-3 text-xs break-all">{totpURI}</pre>
            {backupCodes.length > 0 && (
              <div className="text-sm">
                <strong>Backup codes</strong> — save these somewhere safe.
                <pre className="bg-muted mt-2 rounded-md p-3 text-xs">{backupCodes.join("\n")}</pre>
              </div>
            )}
            <form onSubmit={onVerify} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {err && <p className="text-destructive text-sm">{err}</p>}
              <Button type="submit" disabled={pending}>
                {pending ? "Verifying…" : "Verify"}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
