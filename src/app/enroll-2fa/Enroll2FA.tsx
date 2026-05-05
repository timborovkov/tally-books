"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markBootstrapCompletedAction, markTwoFactorEnabledAction } from "@/lib/auth/actions";
import { twoFactor } from "@/lib/auth/client";

function extractSecret(uri: string): string | null {
  try {
    const params = new URL(uri).searchParams;
    return params.get("secret");
  } catch {
    return null;
  }
}

type Step = "password" | "scan" | "done";

export function Enroll2FA() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");

  const manualSecret = useMemo(() => (totpURI ? extractSecret(totpURI) : null), [totpURI]);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  }

  function downloadBackupCodes() {
    const blob = new Blob([backupCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tally-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Safari has historically canceled downloads when revokeObjectURL fires
    // synchronously after click().
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

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
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-3">
              <p className="text-muted-foreground text-sm">
                Scan this QR code with an authenticator app (1Password, Google Authenticator,
                Authy).
              </p>
              <div className="rounded-md bg-white p-4">
                <QRCode value={totpURI} size={192} />
              </div>
              {manualSecret && (
                <details className="text-muted-foreground w-full text-sm">
                  <summary className="hover:text-foreground cursor-pointer select-none">
                    Can&apos;t scan? Enter manually
                  </summary>
                  <div className="mt-3 flex flex-col gap-2">
                    <Label htmlFor="manual-secret" className="text-xs">
                      Secret
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="manual-secret"
                        readOnly
                        value={manualSecret}
                        className="font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(manualSecret, "Secret")}
                      >
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs">Type: TOTP · Digits: 6 · Period: 30s</p>
                  </div>
                </details>
              )}
            </div>

            {backupCodes.length > 0 && (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>Backup codes</strong>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyText(backupCodes.join("\n"), "Backup codes")}
                    >
                      Copy all
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={downloadBackupCodes}>
                      Download .txt
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Save these somewhere safe. Each works once.
                </p>
                <pre className="bg-muted rounded-md p-3 font-mono text-xs">
                  {backupCodes.join("\n")}
                </pre>
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
                {pending ? "Verifying…" : "Verify and finish"}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
