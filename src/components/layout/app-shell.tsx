import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";

export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex min-h-full flex-col">
      <TopNav />
      <div className="flex flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
