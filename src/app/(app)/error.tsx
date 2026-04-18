"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { ErrorFallback } from "@/components/error-fallback";

/**
 * Route-segment boundary. Catches errors from the (app) subtree while the
 * app shell (TopNav + Sidebar, rendered by the layout) stays mounted so
 * the user can still navigate away or retry.
 *
 * Nested `error.tsx` files in deeper segments will take precedence — add
 * one when a segment owns significant data fetching.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ErrorFallback digest={error.digest} onRetry={reset} />;
}
