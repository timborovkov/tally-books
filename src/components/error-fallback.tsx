"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ErrorFallbackProps {
  title?: string;
  message?: string;
  digest?: string;
  onRetry?: () => void;
}

/**
 * Reusable error surface for `error.tsx` files. Keeps the message tone and
 * retry affordance consistent across route segments.
 */
export function ErrorFallback({
  title = "Something went wrong",
  message = "An unexpected error interrupted this page. The error has been reported.",
  digest,
  onRetry,
}: ErrorFallbackProps): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center"
    >
      <AlertTriangle className="text-destructive h-8 w-8" aria-hidden="true" />
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{message}</p>
      {digest ? <p className="text-muted-foreground font-mono text-xs">digest: {digest}</p> : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
