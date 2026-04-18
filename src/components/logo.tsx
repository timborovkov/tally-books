import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg" | "xl";

const wordmarkSizes: Record<LogoSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
};

const taglineSizes: Record<LogoSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
};

export const LOGO_TAGLINE = "Self-hosted finance for solo operators.";

interface LogoProps {
  size?: LogoSize;
  tagline?: boolean | string;
  className?: string;
}

export function Logo({ size = "md", tagline = false, className }: LogoProps) {
  const taglineText = tagline === true ? LOGO_TAGLINE : tagline || null;

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <span
        className={cn(
          "font-display text-foreground leading-none font-semibold tracking-tight uppercase",
          wordmarkSizes[size],
        )}
      >
        Tally
      </span>
      {taglineText ? (
        <span
          className={cn(
            "text-muted-foreground font-sans leading-none tracking-wide",
            taglineSizes[size],
          )}
        >
          {taglineText}
        </span>
      ) : null}
    </div>
  );
}
