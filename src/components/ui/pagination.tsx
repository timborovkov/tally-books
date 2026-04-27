"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

/**
 * URL-driven pagination control. Reads `page` and `pageSize` from the
 * search params, writes them with `router.replace` so the server
 * component re-renders. Stays server-rendered-by-default — only this
 * tiny client island handles the click.
 *
 * Why not just `<Link>` to the next page?
 *   - Page-size select needs an onChange handler.
 *   - Bouncing the URL through the router preserves all other
 *     filters/search params without us having to re-encode them by
 *     hand (`URLSearchParams` does it).
 */
export function Pagination(props: {
  page: number;
  pageSize: number;
  totalCount: number;
  pageSizes?: number[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(props.totalCount / props.pageSize));
  const sizes = props.pageSizes ?? DEFAULT_PAGE_SIZES;

  const update = useCallback(
    (patch: { page?: number; pageSize?: number }) => {
      const next = new URLSearchParams(sp?.toString() ?? "");
      if (patch.page !== undefined) {
        if (patch.page <= 1) next.delete("page");
        else next.set("page", String(patch.page));
      }
      if (patch.pageSize !== undefined) {
        next.set("pageSize", String(patch.pageSize));
        next.delete("page"); // pageSize change resets to page 1.
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, sp],
  );

  const start = props.totalCount === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const end = Math.min(props.page * props.pageSize, props.totalCount);

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-muted-foreground">
        {props.totalCount === 0 ? "No results" : `${start}–${end} of ${props.totalCount}`}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground text-xs">
          Rows per page&nbsp;
          <select
            className="border-input bg-background rounded border px-1.5 py-0.5 text-xs"
            value={props.pageSize}
            onChange={(e) => update({ pageSize: Number(e.target.value) })}
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground text-xs">
          Page {props.page} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.page <= 1}
          onClick={() => update({ page: props.page - 1 })}
        >
          Prev
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={props.page >= totalPages}
          onClick={() => update({ page: props.page + 1 })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
