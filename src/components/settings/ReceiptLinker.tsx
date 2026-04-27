"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ReceiptCandidate {
  id: string;
  vendor: string;
  occurredAt: string; // ISO
  amount: string;
  currency: string;
}

export interface ReceiptLinkerProps {
  expenseId: string;
  entityId: string;
  currentLink: { id: string; vendor: string; occurredAt: string | null } | null;
  /**
   * Server action handle. Form posts `expenseId`, `receiptId` (or
   * empty for unlink), and optional `reason`.
   */
  linkAction: (form: FormData) => void | Promise<void>;
  /** Server-action wrapper around searchReceiptsForExpense — called from this client. */
  searchAction: (input: { entityId: string; query: string }) => Promise<ReceiptCandidate[]>;
}

/**
 * Combobox-style picker. Native `<input>` for search; results render
 * in a Popover; clicking a result fires the link form (with the
 * receipt id) and closes the popover. Unlink is a separate form.
 *
 * No dedicated combobox library — Popover + Input is plenty for the
 * v0.2 surface, and matches the project's "no extra deps" stance.
 */
export function ReceiptLinker(props: ReceiptLinkerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReceiptCandidate[]>([]);
  const [, startTransition] = useTransition();
  const linkFormRef = useRef<HTMLFormElement>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const r = await props.searchAction({ entityId: props.entityId, query });
        setResults(r);
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [open, query, props]);

  // When a candidate is picked, submit the form. Done in a useEffect so
  // we wait for React to commit the hidden-input value before requestSubmit.
  useEffect(() => {
    if (picked && linkFormRef.current) {
      linkFormRef.current.requestSubmit();
      setPicked(null);
      setOpen(false);
    }
  }, [picked]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm">Linked receipt</Label>
        {props.currentLink ? (
          <span className="text-muted-foreground text-xs">
            {props.currentLink.vendor}
            {props.currentLink.occurredAt ? ` · ${props.currentLink.occurredAt.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">No receipt linked</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              {props.currentLink ? "Change…" : "Link receipt…"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <Input
              placeholder="Search vendor…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="mt-2 max-h-64 overflow-y-auto">
              {results.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">No matching receipts.</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="hover:bg-accent flex w-full items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-sm"
                        onClick={() => setPicked(r.id)}
                      >
                        <span>
                          <span className="font-medium">{r.vendor}</span>
                          <span className="text-muted-foreground block text-xs">
                            {r.occurredAt.slice(0, 10)}
                          </span>
                        </span>
                        <span className="font-mono text-xs">
                          {r.amount} {r.currency}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {props.currentLink ? (
          <form action={props.linkAction}>
            <input type="hidden" name="expenseId" value={props.expenseId} />
            <input type="hidden" name="receiptId" value="" />
            <Button type="submit" variant="ghost" size="sm">
              Unlink
            </Button>
          </form>
        ) : null}
      </div>

      {/* Hidden link form — populated when a candidate is picked. */}
      <form ref={linkFormRef} action={props.linkAction} className="hidden">
        <input type="hidden" name="expenseId" value={props.expenseId} />
        <input type="hidden" name="receiptId" value={picked ?? ""} />
      </form>
    </div>
  );
}
