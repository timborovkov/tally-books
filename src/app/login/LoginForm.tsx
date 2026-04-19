"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, twoFactor } from "@/lib/auth/client";

type Step = "creds" | "totp";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("creds");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onCreds(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const res = await signIn.email({ email, password });
    if (res.error) {
      setErr(res.error.message ?? "Invalid credentials.");
      setPending(false);
      return;
    }
    // BetterAuth's twoFactor plugin sets `twoFactorRedirect: true` when a
    // second factor is required. We branch on that.
    const twoFactorRequired =
      typeof res.data === "object" && res.data !== null && "twoFactorRedirect" in res.data;
    if (twoFactorRequired) {
      setStep("totp");
      setPending(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function onTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const verify = await twoFactor.verifyTotp({ code });
    if (verify.error) {
      setErr(verify.error.message ?? "Invalid code.");
      setPending(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {step === "creds" ? "Enter your email and password." : "Enter your 6-digit code."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "creds" ? (
          <form onSubmit={onCreds} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
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
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onTotp} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
              />
            </div>
            {err && <p className="text-destructive text-sm">{err}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Verifying…" : "Verify"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
