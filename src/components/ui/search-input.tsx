"use client";

import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Debounced free-text search input that pushes its value into the URL
 * as `?search=…`. Server component re-renders on every change once the
 * debounce settles, so the result list is always the source of truth.
 *
 * Always resets `?page=` to 1 — running a new search would otherwise
 * leave the user on page 5 of an unrelated result set.
 */
export function SearchInput(props: {
  paramName?: string;
  placeholder?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const param = props.paramName ?? "search";
  const debounceMs = props.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const [value, setValue] = useState(sp?.get(param) ?? "");

  // Mirror `sp` into a ref so the debounced timeout can read the
  // *current* URL when it fires — not the stale snapshot captured when
  // it was scheduled. Without this, a filter change made between
  // keystroke and debounce-fire would be silently overwritten by the
  // search push (cursor caught this). Updated in an effect because
  // mutating refs during render is disallowed.
  const spRef = useRef<ReadonlyURLSearchParams | null>(sp);
  useEffect(() => {
    spRef.current = sp;
  }, [sp]);

  // Keep the input in sync if the URL changes from elsewhere (back/
  // forward, filter bar reset). We only re-sync when the URL value
  // actually differs from what's typed — otherwise typing would be
  // overwritten by every router replace.
  const lastUrlValue = useRef(sp?.get(param) ?? "");
  useEffect(() => {
    const current = sp?.get(param) ?? "";
    if (current !== lastUrlValue.current && current !== value) {
      setValue(current);
    }
    lastUrlValue.current = current;
  }, [sp, param, value]);

  // Debounced URL push. Reads the URL via spRef so concurrent filter
  // changes aren't clobbered.
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(spRef.current?.toString() ?? "");
      if (value.trim() === "") next.delete(param);
      else next.set(param, value.trim());
      next.delete("page");
      const qs = next.toString();
      const target = qs ? `?${qs}` : "?";
      router.replace(target, { scroll: false });
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [value, debounceMs, param, router]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={props.placeholder ?? "Search…"}
      className="max-w-xs"
    />
  );
}
