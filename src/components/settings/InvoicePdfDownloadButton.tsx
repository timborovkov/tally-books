"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

interface InvoicePdfDownloadButtonProps {
  invoiceId: string;
  download: (invoiceId: string) => Promise<{ fileName: string; base64: string }>;
}

/**
 * Triggers a server action that returns the PDF bytes, then turns them
 * into a Blob URL and clicks a synthetic link to start the download.
 *
 * Server actions can't return raw Response objects directly when called
 * from a client component — they're serialised as RSC payloads. We pass
 * bytes as a base64 string and reconstitute on the client.
 */
export function InvoicePdfDownloadButton({
  invoiceId,
  download,
}: InvoicePdfDownloadButtonProps) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const { fileName, base64 } = await download(invoiceId);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? "Rendering…" : "Download PDF"}
    </Button>
  );
}
