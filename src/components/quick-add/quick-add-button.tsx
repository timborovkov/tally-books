"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuickAddDialog } from "@/components/quick-add/quick-add-dialog";

export function QuickAddButton(): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="icon"
        aria-label="Quick add"
        onClick={() => setOpen(true)}
        data-testid="quick-add-button"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <QuickAddDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
