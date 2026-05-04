"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KINDS = [
  "contract",
  "addendum",
  "invoice_received",
  "filing",
  "government_mail",
  "insurance",
  "guide",
  "identification",
  "other",
] as const;

interface DocumentAttachUploaderProps {
  ownerType: "party" | "person" | "entity";
  ownerId: string;
  defaultKind?: (typeof KINDS)[number];
}

export function DocumentAttachUploader({
  ownerType,
  ownerId,
  defaultKind = "contract",
}: DocumentAttachUploaderProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set("ownerType", ownerType);
      fd.set("ownerId", ownerId);
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-title">Title</Label>
          <Input id="doc-title" name="title" required placeholder="Service contract 2026" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-kind">Kind</Label>
          <Select name="kind" defaultValue={defaultKind}>
            <SelectTrigger id="doc-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="doc-file">File</Label>
          <Input
            id="doc-file"
            name="file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,.doc,.docx"
            required
          />
        </div>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload document"}
        </Button>
      </div>
    </form>
  );
}
