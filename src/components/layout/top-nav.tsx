"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { QuickAddButton } from "@/components/quick-add/quick-add-button";

export function TopNav(): React.ReactElement {
  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4">
      <span className="text-base font-semibold tracking-tight">Tally</span>
      <div className="relative max-w-xl flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search everything…"
          aria-label="Global search"
          className="pl-8"
          // v0.2: wires to hybrid Qdrant + SQL search. For now the input is
          // keyboard-reachable but has no submit handler — deliberately inert.
        />
      </div>
      <QuickAddButton />
    </header>
  );
}
