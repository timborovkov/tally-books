"use client";

import { useState } from "react";
import { FileText, Plane, Receipt, Wallet } from "lucide-react";

import { UploadDropzone } from "@/components/intake/UploadDropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface QuickAddAction {
  key: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}

// Actions are intentionally stubs for v0.1 — the modal shell exists so later
// milestones can wire real routes without touching the shell. Each action
// logs and closes the dialog, making this modal genuinely navigable today.
const ACTIONS: readonly QuickAddAction[] = [
  {
    key: "expense",
    label: "New expense",
    description: "Record a new expense against an entity.",
    Icon: Wallet,
  },
  {
    key: "receipt",
    label: "Upload receipt",
    description: "Drop a receipt for OCR and categorisation.",
    Icon: Receipt,
  },
  {
    key: "invoice",
    label: "New invoice draft",
    description: "Start a new invoice for a client.",
    Icon: FileText,
  },
  {
    key: "trip",
    label: "New trip",
    description: "Log a business trip with per-diem.",
    Icon: Plane,
  },
] as const;

export interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps): React.ReactElement {
  const [mode, setMode] = useState<"menu" | "receipt">("menu");

  const handleSelect = (key: string): void => {
    if (key === "receipt") {
      setMode("receipt");
      return;
    }
    // TODO(v0.2+): route to the corresponding create flow for other
    // actions as they land. Console-log stubs the non-wired ones.
    // eslint-disable-next-line no-console -- stub surface
    console.info(`[quick-add] selected action: ${key}`);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) setMode("menu");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {mode === "menu" ? (
          <>
            <DialogHeader>
              <DialogTitle>Quick add</DialogTitle>
              <DialogDescription>
                Create a new record. You can always edit or expand it later.
              </DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2">
              {ACTIONS.map(({ key, label, description, Icon }) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => handleSelect(key)}
                    className={cn(
                      "border-input bg-background flex w-full items-start gap-3 rounded-md border p-3 text-left shadow-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
                    )}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-muted-foreground text-xs">{description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Upload receipt</DialogTitle>
              <DialogDescription>
                Drop one or many scans. OCR runs in the background; review in the Inbox.
              </DialogDescription>
            </DialogHeader>
            <UploadDropzone variant="card" onUploaded={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
