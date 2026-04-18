import { cn } from "@/lib/utils";

/**
 * Tally's logo system.
 *
 * Three renderings available via the `type` prop:
 *   - `"wordmark"` — the TALLY text only (default; used in sidebar + auth headers).
 *   - `"icon"`     — the tally-marks glyph only (||||/ stroked in `currentColor`).
 *   - `"full"`     — icon + wordmark together, laid out `horizontal` or `vertical`.
 *
 * All variants respect the active theme by default. Pass `invert` to render against
 * a surface that's the opposite theme (e.g. a dark hero inside a light-mode app, or
 * a light card inside a dark-mode sidebar) — the wordmark + icon will flip to stay
 * legible without needing to toggle `.dark` on an ancestor.
 *
 * The favicon at [`src/app/icon.svg`](../app/icon.svg) is a separate asset: same
 * geometry, but on a solid navy tile (browser tabs sit on unknown chrome colors).
 * Keep the two in visual sync when editing either.
 */

/** Which parts of the mark to render. */
export type LogoType = "wordmark" | "icon" | "full";

/** Layout for `type="full"`. Ignored for `wordmark` and `icon`. */
export type LogoOrientation = "horizontal" | "vertical";

/** Overall size — scales wordmark text, icon glyph, and spacing together. */
export type LogoSize = "sm" | "md" | "lg" | "xl";

/** Horizontal alignment inside the logo's own box (affects stacked children). */
export type LogoAlign = "start" | "center";

/** Semantic element for the wordmark text. `h1` only for landing / auth hero. */
export type LogoAs = "h1" | "h2" | "span" | "div";

export const LOGO_TAGLINE = "Self-hosted finance for solo operators.";

const wordmarkTextSize: Record<LogoSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-6xl",
};

const taglineTextSize: Record<LogoSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
};

const iconPixelSize: Record<LogoSize, number> = {
  sm: 16,
  md: 22,
  lg: 32,
  xl: 48,
};

/** Gap between icon and wordmark when `type="full"`, per orientation + size. */
const fullGap: Record<LogoOrientation, Record<LogoSize, string>> = {
  horizontal: { sm: "gap-2", md: "gap-2.5", lg: "gap-3", xl: "gap-4" },
  vertical: { sm: "gap-1.5", md: "gap-2", lg: "gap-3", xl: "gap-4" },
};

interface LogoProps {
  /** @default "wordmark" */
  type?: LogoType;
  /** @default "horizontal" — only used when `type="full"`. */
  orientation?: LogoOrientation;
  /** @default "md" */
  size?: LogoSize;
  /** @default "start" */
  align?: LogoAlign;
  /**
   * Show tagline under wordmark. Pass `true` for the default tagline or a string
   * to override. Ignored when `type="icon"` (no text to pair it with).
   */
  tagline?: boolean | string;
  /**
   * Flip colors to read on an opposite-theme surface.
   *
   * Uses the theme's `background` token (which itself flips between light/dark),
   * so an inverted logo in light mode renders near-white, and in dark mode
   * renders near-black — correct for whichever surface it sits on.
   */
  invert?: boolean;
  /**
   * Semantic element for the wordmark.
   * - `"h1"` — landing page hero (one per document).
   * - `"h2"` — auth pages, major section leads.
   * - `"span"` *(default)* — sidebar, nav, loading splash.
   * - `"div"` — when the parent already carries heading semantics.
   */
  as?: LogoAs;
  className?: string;
}

/**
 * Tally brand logo.
 *
 * @example Wordmark only (default) — sidebar, nav
 * ```tsx
 * <Logo size="md" />
 * ```
 *
 * @example Full lockup on the landing hero
 * ```tsx
 * <Logo type="full" orientation="vertical" size="xl" align="center" tagline as="h1" />
 * ```
 *
 * @example Icon-only on a compact toolbar
 * ```tsx
 * <Logo type="icon" size="sm" />
 * ```
 *
 * @example Inverted — dark hero inside a light-theme app
 * ```tsx
 * <div className="bg-foreground p-12"><Logo type="full" invert /></div>
 * ```
 */
export function Logo({
  type = "wordmark",
  orientation = "horizontal",
  size = "md",
  align = "start",
  tagline = false,
  invert = false,
  as = "span",
  className,
}: LogoProps) {
  const showIcon = type === "icon" || type === "full";
  const showWordmark = type === "wordmark" || type === "full";

  const taglineText = showWordmark && tagline === true ? LOGO_TAGLINE : tagline || null;

  const wordmarkColor = invert ? "text-background" : "text-foreground";
  const taglineColor = invert ? "text-background/70" : "text-muted-foreground";
  const iconColor = invert ? "text-background" : "text-foreground";

  const alignCls = align === "center" ? "items-center" : "items-start";

  // "full" + horizontal: icon beside a stacked (wordmark + tagline) column.
  // Everything else: a single column (wordmark on top, tagline below, icon above if present).
  if (type === "full" && orientation === "horizontal") {
    return (
      <div
        className={cn(
          "flex flex-row items-center",
          fullGap.horizontal[size],
          className,
        )}
      >
        <TallyIcon size={iconPixelSize[size]} className={iconColor} />
        <div className={cn("flex flex-col", alignCls, "gap-1")}>
          <Wordmark as={as} sizeClass={wordmarkTextSize[size]} colorClass={wordmarkColor} />
          {taglineText ? (
            <Tagline sizeClass={taglineTextSize[size]} colorClass={taglineColor}>
              {taglineText}
            </Tagline>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        alignCls,
        type === "full" ? fullGap.vertical[size] : "gap-1",
        className,
      )}
    >
      {showIcon ? (
        <TallyIcon size={iconPixelSize[size]} className={iconColor} />
      ) : null}
      {showWordmark ? (
        <Wordmark as={as} sizeClass={wordmarkTextSize[size]} colorClass={wordmarkColor} />
      ) : null}
      {taglineText ? (
        <Tagline sizeClass={taglineTextSize[size]} colorClass={taglineColor}>
          {taglineText}
        </Tagline>
      ) : null}
    </div>
  );
}

/**
 * Tally-marks glyph — four verticals crossed by one diagonal, the traditional
 * group-of-five count. Renders in `currentColor` so parent `text-*` utilities
 * (or the `invert` prop on `<Logo />`) drive its color.
 */
function TallyIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <line x1="10" y1="8" x2="10" y2="24" />
      <line x1="14" y1="8" x2="14" y2="24" />
      <line x1="18" y1="8" x2="18" y2="24" />
      <line x1="22" y1="8" x2="22" y2="24" />
      <line x1="7" y1="23" x2="25" y2="9" />
    </svg>
  );
}

function Wordmark({
  as,
  sizeClass,
  colorClass,
}: {
  as: LogoAs;
  sizeClass: string;
  colorClass: string;
}) {
  const Tag = as as "h1" | "h2" | "span" | "div";
  return (
    <Tag
      translate="no"
      className={cn(
        "font-display font-extrabold uppercase leading-none tracking-[-0.02em] m-0",
        sizeClass,
        colorClass,
      )}
    >
      Tally
    </Tag>
  );
}

function Tagline({
  children,
  sizeClass,
  colorClass,
}: {
  children: React.ReactNode;
  sizeClass: string;
  colorClass: string;
}) {
  return (
    <span className={cn("font-sans leading-none tracking-wide", sizeClass, colorClass)}>
      {children}
    </span>
  );
}
