import Link from "next/link";

import { cn } from "@/lib/utils";

// Auth is enforced by `(app)/layout.tsx` (the redirect cascade there
// gates every route in this group on admin-exists, session, and 2FA).
// Server actions in this subtree resolve the actor via auth-shim, which
// reads the same BetterAuth session.

const NAV = [
  { href: "/settings/entities", label: "Entities" },
  { href: "/settings/persons", label: "Persons" },
  { href: "/settings/jurisdictions", label: "Jurisdictions" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/receipts", label: "Receipts" },
  { href: "/settings/expenses", label: "Expenses" },
] as const;

// Wrapped in AppShell (`(app)/layout.tsx`) — that layout renders the
// outer <main>. This file is just the in-page split between the
// settings sub-nav and the section content.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-10">
      <nav aria-label="Settings sections" className="w-48 shrink-0">
        <div className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
          Settings
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
