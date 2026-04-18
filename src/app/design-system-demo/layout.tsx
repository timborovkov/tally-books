import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design System — Tally",
  description: "Live reference for Tally's design tokens, typography, and UI components.",
  robots: { index: false, follow: false },
};

/**
 * Standalone layout — intentionally does NOT render any future app chrome
 * (navbar, sidebar, auth gate). This page must stay visually stable as
 * the rest of the app evolves.
 */
export default function DesignSystemDemoLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-background text-foreground min-h-full">{children}</div>;
}
