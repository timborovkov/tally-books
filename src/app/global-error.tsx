"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort error boundary. Renders when the root layout itself throws,
 * which means the app shell is unavailable — no nav, no sidebar. Route-level
 * `error.tsx` handles the common case (segment-scoped error) and preserves
 * the shell. See `docs/architecture/ui-conventions.md`.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}): React.ReactElement {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 p-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          An unexpected error broke the page. The error has been reported. Try reloading — if it
          keeps happening, check the server logs.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">digest: {error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
