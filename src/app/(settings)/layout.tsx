import Link from "next/link";

import { cn } from "@/lib/utils";

// TODO(auth): wrap in a session check once BetterAuth lands. Today the
// settings shell is open — there's no real session yet, so it just
// renders for whoever opens the URL. The auth-shim resolves the
// audit_log actor to the bootstrap admin in the meantime.

const NAV = [
  { href: "/settings/entities", label: "Entities" },
  { href: "/settings/persons", label: "Persons" },
  { href: "/settings/jurisdictions", label: "Jurisdictions" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-10">
      <aside className="w-48 shrink-0">
        <div className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
          Settings
        </div>
        <nav className="flex flex-col gap-1">
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
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
