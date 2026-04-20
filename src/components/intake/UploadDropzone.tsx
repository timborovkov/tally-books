"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "application/pdf": [".pdf"],
};

interface UploadDropzoneProps {
  /**
   * Called after the upload response comes back so containers can
   * close a dialog or scroll the inbox. Optional — the dropzone
   * already triggers a `router.refresh()` to re-render server data.
   */
  onUploaded?: () => void;
  /** Visual variant. `inline` is the inbox-page header affordance;
   * `card` is used in the quick-add dialog where the dropzone owns
   * the whole panel. */
  variant?: "inline" | "card";
}

interface UploadResultItem {
  filename: string;
  intakeItemId?: string;
  error?: string;
  deduplicated?: boolean;
}

export function UploadDropzone({
  onUploaded,
  variant = "inline",
}: UploadDropzoneProps): React.ReactElement {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      setUploading(true);
      try {
        const form = new FormData();
        for (const file of accepted) form.append("files", file);

        const res = await fetch("/api/intake/upload", { method: "POST", body: form });
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText);
          throw new Error(msg || `Upload failed with ${res.status}`);
        }
        const json = (await res.json()) as { results: UploadResultItem[] };

        const ok = json.results.filter((r) => r.intakeItemId && !r.error);
        const dupes = ok.filter((r) => r.deduplicated);
        const failed = json.results.filter((r) => r.error);

        if (ok.length > 0) {
          const suffix = dupes.length > 0 ? ` (${dupes.length} already seen)` : "";
          toast.success(`Uploaded ${ok.length} file${ok.length === 1 ? "" : "s"}${suffix}`);
        }
        for (const f of failed) {
          toast.error(`${f.filename}: ${f.error ?? "upload failed"}`);
        }

        router.refresh();
        onUploaded?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, router],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    disabled: uploading,
    multiple: true,
  });

  const padding = variant === "card" ? "p-10" : "p-6";

  return (
    <div
      {...getRootProps()}
      className={cn(
        "cursor-pointer rounded-md border-2 border-dashed transition-colors",
        padding,
        "flex flex-col items-center justify-center gap-2 text-center",
        isDragActive
          ? "border-primary bg-accent/50"
          : "border-input hover:border-primary/50 hover:bg-accent/20",
        uploading && "opacity-60",
      )}
    >
      <input {...getInputProps()} />
      <Upload className="text-muted-foreground h-6 w-6" aria-hidden="true" />
      <div className="text-sm font-medium">
        {uploading
          ? "Uploading…"
          : isDragActive
            ? "Drop the files here"
            : "Drop receipts here or click to pick"}
      </div>
      <div className="text-muted-foreground text-xs">
        JPEG, PNG, WebP, HEIC, PDF · up to 15 MB each
      </div>
    </div>
  );
}
