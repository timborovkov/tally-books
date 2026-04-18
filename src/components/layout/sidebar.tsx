import Link from "next/link";
import {
  BookOpen,
  Building2,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Settings,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}

// Most sidebar entries point at routes that don't exist yet (v0.1 is
// scaffold-only). They render as links so keyboard navigation and a11y
// tools see the real structure today; the routes themselves ship in
// later milestones.
//
// Exception: "Entities" and "Settings" route into the live
// `(app)/settings/*` shell (entities/persons/jurisdictions management).
const NAV: readonly NavItem[] = [
  { label: "Dashboard", href: "/", Icon: LayoutDashboard },
  { label: "Entities", href: "/settings/entities", Icon: Building2 },
  { label: "Expenses", href: "/expenses", Icon: Wallet },
  { label: "Receipts", href: "/receipts", Icon: Receipt },
  { label: "Invoices", href: "/invoices", Icon: FileText },
  { label: "Reports", href: "/reports", Icon: BookOpen },
  { label: "Agent", href: "/agent", Icon: MessageSquare },
  { label: "Settings", href: "/settings/entities", Icon: Settings },
] as const;

export function Sidebar(): React.ReactElement {
  return (
    <aside className="bg-background hidden w-56 shrink-0 border-r md:flex md:flex-col">
      <nav aria-label="Primary navigation" className="flex flex-col gap-0.5 p-2">
        {NAV.map(({ label, href, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "text-foreground/80 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
