import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return <AppShell>{children}</AppShell>;
}
