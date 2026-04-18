"use client";

import {
  AlarmClock,
  Archive,
  Bell,
  Briefcase,
  Calendar,
  Car,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  CircleSlash,
  FileText,
  Gift,
  HelpCircle,
  Info,
  Inbox,
  Lock,
  MoveRight,
  Paperclip,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Logo, LOGO_TAGLINE } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const sections = [
  { id: "brand", label: "Brand" },
  { id: "typography", label: "Typography" },
  { id: "color", label: "Color tokens" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Form controls" },
  { id: "data", label: "Data display" },
  { id: "overlays", label: "Overlays" },
  { id: "feedback", label: "Feedback" },
  { id: "navigation", label: "Navigation" },
  { id: "sidebar", label: "Sidebar" },
  { id: "status", label: "Status badges" },
  { id: "patterns", label: "Primitives & patterns" },
  { id: "icons", label: "Icon library" },
];

const semanticTokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-accent",
  "sidebar-border",
];

type StatusBadge = { label: string; className: string; icon: React.ReactNode };

const thingStateBadges: StatusBadge[] = [
  {
    label: "DRAFT",
    className: "bg-muted text-muted-foreground border-border",
    icon: <FileText className="size-3" />,
  },
  {
    label: "READY",
    className: "bg-primary/10 text-primary border-primary/30",
    icon: <CircleCheck className="size-3" />,
  },
  {
    label: "FILED",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    icon: <CircleCheck className="size-3" />,
  },
  {
    label: "UNDERLYING DATA CHANGED",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    icon: <RefreshCw className="size-3" />,
  },
  {
    label: "AUTO-REFRESH LOCKED",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
    icon: <Lock className="size-3" />,
  },
  {
    label: "IN PERIOD LOCK",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: <Lock className="size-3" />,
  },
];

const intakeStatusBadges: StatusBadge[] = [
  {
    label: "NEW",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
    icon: <Inbox className="size-3" />,
  },
  {
    label: "NEEDS REVIEW",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    icon: <CircleAlert className="size-3" />,
  },
  {
    label: "ROUTED",
    className: "bg-primary/10 text-primary border-primary/30",
    icon: <MoveRight className="size-3" />,
  },
  {
    label: "CONFIRMED",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    icon: <CheckCircle2 className="size-3" />,
  },
  {
    label: "REJECTED",
    className: "bg-muted text-muted-foreground border-border",
    icon: <CircleSlash className="size-3" />,
  },
];

const complianceStatusBadges: StatusBadge[] = [
  {
    label: "OPEN",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    icon: <CircleAlert className="size-3" />,
  },
  {
    label: "DONE",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    icon: <CheckCircle2 className="size-3" />,
  },
  {
    label: "SNOOZED",
    className: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
    icon: <AlarmClock className="size-3" />,
  },
  {
    label: "WAIVED",
    className: "bg-muted text-muted-foreground border-border",
    icon: <Archive className="size-3" />,
  },
];

const demoIcons = [
  { icon: Plus, name: "Plus" },
  { icon: Search, name: "Search" },
  { icon: Settings, name: "Settings" },
  { icon: User, name: "User" },
  { icon: Bell, name: "Bell" },
  { icon: ChevronDown, name: "ChevronDown" },
  { icon: Scale, name: "Scale" },
  { icon: FileText, name: "FileText" },
  { icon: CircleDollarSign, name: "CircleDollarSign" },
  { icon: Calendar, name: "Calendar" },
  { icon: Sparkles, name: "Sparkles" },
  { icon: RefreshCw, name: "RefreshCw" },
  { icon: Inbox, name: "Inbox" },
  { icon: ShieldCheck, name: "ShieldCheck" },
  { icon: Briefcase, name: "Briefcase" },
  { icon: Car, name: "Car" },
  { icon: Gift, name: "Gift" },
  { icon: Wallet, name: "Wallet" },
];

function subscribeToHtmlClass(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function ColorSwatch({ token }: { token: string }) {
  const getSnapshot = useCallback(
    () => getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim(),
    [token],
  );
  const value = useSyncExternalStore(subscribeToHtmlClass, getSnapshot, () => "");

  return (
    <div className="border-border bg-card flex flex-col overflow-hidden rounded-md border">
      <div
        className="border-border h-14 w-full border-b"
        style={{ backgroundColor: `var(--${token})` }}
      />
      <div className="flex flex-col gap-0.5 p-2.5">
        <code className="text-foreground text-xs font-medium">--{token}</code>
        <code className="text-muted-foreground font-mono text-[10px] break-all">
          {value || "—"}
        </code>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24 space-y-1">
      <h2 className="font-display text-foreground text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
      ) : null}
    </div>
  );
}

export default function DesignSystemDemoPage() {
  return (
    <TooltipProvider>
      <div className="bg-background text-foreground relative min-h-screen">
        <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <Logo type="full" orientation="horizontal" size="sm" />
              <Separator orientation="vertical" className="hidden h-6 md:block" />
              <span className="text-muted-foreground hidden text-sm md:inline">
                Design system reference
              </span>
            </div>
            <ModeToggle />
          </div>
        </header>

        <div className="mx-auto flex max-w-7xl gap-8 px-6 py-10">
          <aside className="hidden w-56 shrink-0 lg:block">
            <nav className="sticky top-24 space-y-1">
              <p className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                On this page
              </p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent/40 block rounded-md px-2 py-1.5 text-sm transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 space-y-16">
            {/* BRAND */}
            <section className="space-y-6">
              <SectionHeading
                id="brand"
                title="Brand"
                description="Wordmark (Unbounded 800), tally-marks icon, and the full lockup — all rendered by the same <Logo /> component. Tagline appears only on auth and landing surfaces."
              />
              <Card>
                <CardContent className="grid gap-10 py-8 md:grid-cols-2">
                  <div className="flex flex-col items-start gap-8">
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">
                      Wordmark · sizes
                    </span>
                    <Logo type="wordmark" size="sm" />
                    <Logo type="wordmark" size="md" />
                    <Logo type="wordmark" size="lg" />
                    <Logo type="wordmark" size="xl" />
                  </div>
                  <div className="flex flex-col items-start justify-start gap-8">
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">
                      Icon · sizes
                    </span>
                    <div className="flex items-end gap-6">
                      <Logo type="icon" size="sm" />
                      <Logo type="icon" size="md" />
                      <Logo type="icon" size="lg" />
                      <Logo type="icon" size="xl" />
                    </div>
                  </div>
                </CardContent>
                <CardContent className="grid gap-10 border-t py-8 md:grid-cols-2">
                  <div className="flex flex-col items-start gap-6">
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">
                      Full · horizontal
                    </span>
                    <Logo type="full" orientation="horizontal" size="sm" />
                    <Logo type="full" orientation="horizontal" size="md" />
                    <Logo type="full" orientation="horizontal" size="lg" />
                    <Logo type="full" orientation="horizontal" size="md" tagline />
                  </div>
                  <div className="flex flex-col items-start gap-6">
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">
                      Full · vertical
                    </span>
                    <Logo type="full" orientation="vertical" size="md" align="start" />
                    <Logo type="full" orientation="vertical" size="lg" align="start" tagline />
                  </div>
                </CardContent>
                <CardContent className="grid gap-10 border-t py-8 md:grid-cols-2">
                  <div className="flex flex-col items-start gap-4">
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">
                      Default · on page surface
                    </span>
                    <div className="bg-background w-full rounded-md border p-6">
                      <Logo type="full" orientation="horizontal" size="md" tagline />
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-4">
                    <span className="text-muted-foreground text-xs tracking-wide uppercase">
                      Inverted · on opposite-theme surface
                    </span>
                    <div className="bg-foreground w-full rounded-md p-6">
                      <Logo type="full" orientation="horizontal" size="md" tagline invert />
                    </div>
                  </div>
                </CardContent>
                <CardContent className="border-t py-6">
                  <div className="text-muted-foreground text-sm">
                    Tagline copy: <code className="font-mono">{LOGO_TAGLINE}</code>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* TYPOGRAPHY */}
            <section className="space-y-6">
              <SectionHeading
                id="typography"
                title="Typography"
                description="Geist Sans for body, Geist Mono for numerics and code, Unbounded 800 reserved for the Tally wordmark."
              />
              <Card>
                <CardContent className="space-y-6 py-8">
                  <div className="space-y-3">
                    <h1 className="text-5xl leading-tight font-semibold tracking-tight">
                      Display headings use Geist Sans 600
                    </h1>
                    <p className="text-muted-foreground text-xs">
                      (The <code className="font-mono">font-display</code> utility is reserved for
                      the <code className="font-mono">&lt;Logo /&gt;</code> wordmark only.)
                    </p>
                    <h2 className="text-3xl font-semibold tracking-tight">
                      Heading 2 — Geist Sans 600
                    </h2>
                    <h3 className="text-xl font-semibold">Heading 3 — Geist Sans 600</h3>
                    <p className="text-foreground text-base">
                      Body — Geist Sans, regular weight. The quick brown fox jumps over the lazy
                      dog.
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Small — Geist Sans, muted foreground, used for metadata and helper text.
                    </p>
                    <p className="font-mono text-sm tabular-nums">
                      Mono — $12,345.67 · 2026-04-18 · invoice_42_final
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* COLOR */}
            <section className="space-y-6">
              <SectionHeading
                id="color"
                title="Color tokens"
                description="Every surface uses semantic tokens — never hardcoded hex values. Flip the theme toggle to verify both modes."
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {semanticTokens.map((t) => (
                  <ColorSwatch key={t} token={t} />
                ))}
              </div>
            </section>

            {/* BUTTONS */}
            <section className="space-y-6">
              <SectionHeading id="buttons" title="Buttons" />
              <Card>
                <CardContent className="space-y-6 py-8">
                  <div className="flex flex-wrap gap-3">
                    <Button>Default</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="link">Link</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="xs">Extra small</Button>
                    <Button size="sm">Small</Button>
                    <Button size="default">Default</Button>
                    <Button size="lg">Large</Button>
                    <Button size="icon" aria-label="Add">
                      <Plus />
                    </Button>
                    <Button size="icon-sm" variant="outline" aria-label="Search">
                      <Search />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button>
                      <Plus /> With icon
                    </Button>
                    <Button variant="secondary" disabled>
                      Disabled
                    </Button>
                    <Button variant="outline" disabled>
                      <RefreshCw className="animate-spin" /> Loading
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* FORMS */}
            <section className="space-y-6">
              <SectionHeading id="forms" title="Form controls" />
              <Card>
                <CardContent className="grid gap-6 py-8 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="you@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0.00"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invalid">With error</Label>
                    <Input id="invalid" aria-invalid placeholder="Required field" />
                    <p className="text-destructive text-xs">This field is required.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jurisdiction">Jurisdiction</Label>
                    <Select>
                      <SelectTrigger id="jurisdiction">
                        <SelectValue placeholder="Select jurisdiction" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ee">Estonia</SelectItem>
                        <SelectItem value="de">Germany</SelectItem>
                        <SelectItem value="fr">France</SelectItem>
                        <SelectItem value="us">United States</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" placeholder="Add internal notes…" rows={3} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox id="tax" defaultChecked />
                    <Label htmlFor="tax">Include tax in totals</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch id="auto" defaultChecked />
                    <Label htmlFor="auto">Auto-refresh on source change</Label>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Filing method</Label>
                    <RadioGroup defaultValue="electronic" className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="electronic" id="r1" />
                        <Label htmlFor="r1" className="font-normal">
                          Electronic
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="paper" id="r2" />
                        <Label htmlFor="r2" className="font-normal">
                          Paper
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="hybrid" id="r3" />
                        <Label htmlFor="r3" className="font-normal">
                          Hybrid
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* DATA DISPLAY */}
            <section className="space-y-6">
              <SectionHeading id="data" title="Data display" />
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Intake pending</CardTitle>
                    <CardDescription>3 new · 1 needs review</CardDescription>
                    <CardAction>
                      <Inbox className="text-muted-foreground size-4" />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-3xl font-semibold tabular-nums">4</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">
                      Triage
                    </Button>
                  </CardFooter>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Obligations due</CardTitle>
                    <CardDescription>2 employment · 1 reporting</CardDescription>
                    <CardAction>
                      <ShieldCheck className="text-muted-foreground size-4" />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-3xl font-semibold tabular-nums">3</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">
                      Resolve
                    </Button>
                  </CardFooter>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Q1 VAT liability</CardTitle>
                    <CardDescription>2026-01-01 → 2026-03-31</CardDescription>
                    <CardAction>
                      <Badge variant="outline">DRAFT</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-3xl font-semibold tabular-nums">€4,217.80</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </CardFooter>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Mileage to reimburse</CardTitle>
                    <CardDescription>2 claims · this month</CardDescription>
                    <CardAction>
                      <Car className="text-muted-foreground size-4" />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-3xl font-semibold tabular-nums">€312.40</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm" variant="outline">
                      Review
                    </Button>
                  </CardFooter>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableCaption>Last 5 transactions</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ["2026-04-12", "Hetzner Online GmbH", "Hosting", "READY", 52.41],
                        ["2026-04-10", "Notion Labs", "Software", "FILED", 12.0],
                        ["2026-04-08", "Lufthansa", "Travel", "DRAFT", 418.7],
                        ["2026-04-05", "Apple Store", "Hardware", "READY", 2199.0],
                        ["2026-04-01", "Tallinn Coffee Co.", "Meals", "DRAFT", 8.9],
                      ].map(([date, vendor, category, status, amount]) => (
                        <TableRow key={date as string}>
                          <TableCell className="font-mono text-xs">{date}</TableCell>
                          <TableCell>{vendor}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{category}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={status === "FILED" ? "default" : "secondary"}>
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            €{(amount as number).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Loading state</CardTitle>
                  <CardDescription>
                    List-page skeleton pattern. Show table-shaped skeletons during initial load —
                    never a spinner.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* OVERLAYS */}
            <section className="space-y-6">
              <SectionHeading id="overlays" title="Overlays" />
              <Card>
                <CardContent className="flex flex-wrap gap-3 py-8">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">Open dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirm filing</DialogTitle>
                        <DialogDescription>
                          This VAT declaration will be locked and marked as FILED.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline">Cancel</Button>
                        <Button>File declaration</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline">Open sheet</Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Edit invoice</SheetTitle>
                        <SheetDescription>
                          Changes are versioned. Prior versions remain viewable on the timeline.
                        </SheetDescription>
                      </SheetHeader>
                    </SheetContent>
                  </Sheet>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Actions <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Menu</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem>Export PDF</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline">Popover</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <p className="text-sm font-medium">Version history</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        3 revisions · last edited 2h ago
                      </p>
                    </PopoverContent>
                  </Popover>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline">Hover me</Button>
                    </TooltipTrigger>
                    <TooltipContent>Tooltip content</TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>
            </section>

            {/* FEEDBACK */}
            <section className="space-y-6">
              <SectionHeading id="feedback" title="Feedback" />
              <div className="space-y-4">
                <Alert>
                  <Info />
                  <AlertTitle>New tax year rolled over.</AlertTitle>
                  <AlertDescription>
                    We archived 2025 and opened 2026. Prior periods remain queryable in read-only
                    mode.
                  </AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Underlying data changed.</AlertTitle>
                  <AlertDescription>
                    Filed declaration references an expense that was subsequently edited. Review the
                    diff.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => toast.success("Invoice saved as DRAFT")}>
                    Success toast
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toast.error("OCR failed for receipt_042.pdf")}
                  >
                    Error toast
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast("Period locked", {
                        description: "2026-Q1 is closed. Reopen from Settings.",
                      })
                    }
                  >
                    Info toast
                  </Button>
                </div>
              </div>
            </section>

            {/* NAVIGATION */}
            <section className="space-y-6">
              <SectionHeading id="navigation" title="Navigation" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Home</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#">Entities</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Acme OÜ</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="declarations">Declarations</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-muted-foreground text-sm">
                        Overview surface — dashboard metrics, deadlines, quick actions.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="transactions">
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-muted-foreground text-sm">Transactions tab.</p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="declarations">
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-muted-foreground text-sm">Declarations tab.</p>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="settings">
                  <Card>
                    <CardContent className="py-6">
                      <p className="text-muted-foreground text-sm">Settings tab.</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <Card>
                <CardHeader>
                  <CardTitle>Scroll area</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-40 w-full rounded-md border p-3">
                    <ul className="space-y-1 text-sm">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <li key={i} className="font-mono tabular-nums">
                          INV-{String(1000 + i).padStart(5, "0")} · €
                          {(((i * 137) % 900) + 50).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </CardContent>
              </Card>
            </section>

            {/* SIDEBAR */}
            <section className="space-y-6">
              <SectionHeading
                id="sidebar"
                title="Sidebar shell"
                description="Embedded in a constrained frame so it doesn't hijack the page layout."
              />
              <div className="border-border h-[380px] overflow-hidden rounded-lg border">
                <SidebarProvider>
                  <Sidebar collapsible="none" className="h-full">
                    <SidebarHeader>
                      <Logo type="full" orientation="horizontal" size="sm" />
                    </SidebarHeader>
                    <SidebarContent>
                      <SidebarGroup>
                        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <SidebarMenuItem>
                              <SidebarMenuButton isActive>
                                <Scale /> Dashboard
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Inbox /> Intake
                                <Badge variant="secondary" className="ml-auto">
                                  3
                                </Badge>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <ShieldCheck /> Obligations
                                <Badge variant="secondary" className="ml-auto">
                                  2
                                </Badge>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Books</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <FileText /> Invoices
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <CircleDollarSign /> Expenses
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Calendar /> Declarations
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Compensation</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Briefcase /> Trips &amp; per diem
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Car /> Mileage claims
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Gift /> Benefits
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Personal</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Wallet /> Personal finance
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Account</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <Settings /> Settings
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            <SidebarMenuItem>
                              <SidebarMenuButton>
                                <User /> Members
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter>
                      <p className="text-sidebar-foreground/60 px-2 text-xs">v0.1.0</p>
                    </SidebarFooter>
                    <SidebarRail />
                  </Sidebar>
                  <main className="bg-background flex-1 p-6">
                    <h3 className="text-lg font-semibold">Workspace content</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      The sidebar uses its own palette tokens (sidebar, sidebar-foreground, …) so it
                      can feel distinct from the main surface.
                    </p>
                  </main>
                </SidebarProvider>
              </div>
            </section>

            {/* STATUS */}
            <section className="space-y-6">
              <SectionHeading
                id="status"
                title="Status badges"
                description="Reserved state vocabularies. Three independent taxonomies — don't mix their palettes."
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Thing state · versioned entities</CardTitle>
                  <CardDescription>
                    Applies to invoices, expenses, declarations, trips, mileage claims, benefit
                    enrollments, etc. Per PROJECT_BRIEF §7.3.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {thingStateBadges.map((b) => (
                    <span
                      key={b.label}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${b.className}`}
                    >
                      {b.icon}
                      {b.label}
                    </span>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Intake queue · cross-entity inbox</CardTitle>
                  <CardDescription>
                    Status of each item in the unified intake inbox before it routes into a
                    downstream flow (expense / mileage claim / benefit evidence / …).
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {intakeStatusBadges.map((b) => (
                    <span
                      key={b.label}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${b.className}`}
                    >
                      {b.icon}
                      {b.label}
                    </span>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Compliance task · obligation tracker</CardTitle>
                  <CardDescription>
                    Status of jurisdiction-driven employment / tax / reporting tasks generated by
                    the obligation evaluator. Render the <code className="font-mono">domain</code>{" "}
                    alongside the status as a secondary outline badge.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    {complianceStatusBadges.map((b) => (
                      <span
                        key={b.label}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${b.className}`}
                      >
                        {b.icon}
                        {b.label}
                      </span>
                    ))}
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Paired with domain
                    </p>
                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
                          <CircleAlert className="size-3" /> OPEN
                        </span>
                        <Badge variant="outline">employment</Badge>
                        <span className="text-muted-foreground">
                          Health insurance registration for new hire
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> DONE
                        </span>
                        <Badge variant="outline">tax_payment</Badge>
                        <span className="text-muted-foreground">Q1 VAT remit · bank match</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-sky-700 uppercase dark:text-sky-400">
                          <AlarmClock className="size-3" /> SNOOZED
                        </span>
                        <Badge variant="outline">reporting</Badge>
                        <span className="text-muted-foreground">
                          Annual report · snoozed until 2026-06-01
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* PATTERNS */}
            <section className="space-y-6">
              <SectionHeading
                id="patterns"
                title="Primitives & patterns"
                description="Reusable UI patterns that show up across features: OCR confidence highlighting, mass-action toolbars, evidence attachment, rationale popovers, and intake triage decisions."
              />

              {/* Confidence highlighting */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">OCR confidence highlighting</CardTitle>
                  <CardDescription>
                    Low-confidence extracted fields get an amber ring + helper text so the user
                    knows what to verify. High-confidence fields look like any other input.
                    PROJECT_BRIEF §3.6, §5.2.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="merchant-high">Merchant (high confidence)</Label>
                    <Input id="merchant-high" defaultValue="Lufthansa AG" />
                    <p className="text-muted-foreground text-xs">Extracted with 98% confidence.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="merchant-low">Merchant (low confidence)</Label>
                    <Input
                      id="merchant-low"
                      defaultValue="Lufthansa"
                      className="ring-2 ring-amber-500/40 focus-visible:ring-amber-500/60"
                    />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Extracted with 47% confidence. Verify before confirming.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Mass-action toolbar */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Mass-action toolbar</CardTitle>
                  <CardDescription>
                    Every list page supports multi-select + bulk actions. The toolbar docks to the
                    top of the list when rows are selected. PROJECT_BRIEF §3.6.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border-border bg-accent/30 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Checkbox defaultChecked aria-label="Select all" />
                      <span className="text-foreground font-medium">3 selected</span>
                      <span className="text-muted-foreground">of 48</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline">
                        <MoveRight /> Route to entity
                      </Button>
                      <Button size="sm" variant="outline">
                        <User /> Mark personal
                      </Button>
                      <Button size="sm" variant="outline">
                        <Paperclip /> Request evidence
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive">
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Intake triage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Intake triage decision</CardTitle>
                  <CardDescription>
                    Three routing dimensions per intake item: scope, entity, target flow.
                    PROJECT_BRIEF §5.1.5.1.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Scope</Label>
                    <RadioGroup defaultValue="business" className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="business" id="scope-biz" />
                        <Label htmlFor="scope-biz" className="font-normal">
                          Business
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="personal" id="scope-personal" />
                        <Label htmlFor="scope-personal" className="font-normal">
                          Personal
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="triage-entity">Entity</Label>
                    <Select defaultValue="acme">
                      <SelectTrigger id="triage-entity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acme">Acme OÜ</SelectItem>
                        <SelectItem value="tecci">Tecci OY</SelectItem>
                        <SelectItem value="personal">— Personal —</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="triage-target">Target flow</Label>
                    <Select defaultValue="expense">
                      <SelectTrigger id="triage-target">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="mileage_claim">Mileage claim</SelectItem>
                        <SelectItem value="trip_evidence">Trip evidence</SelectItem>
                        <SelectItem value="benefit_evidence">Benefit evidence</SelectItem>
                        <SelectItem value="compliance_evidence">Compliance evidence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button variant="outline">Reject</Button>
                  <Button>Confirm routing</Button>
                </CardFooter>
              </Card>

              {/* Evidence chips + rationale popover */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Evidence attachments</CardTitle>
                    <CardDescription>
                      Used on compliance tasks, filings, mileage claims, benefit enrollments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="bg-muted text-foreground border-border inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                        <Paperclip className="size-3" />
                        health-policy-2026.pdf
                      </span>
                      <span className="bg-muted text-foreground border-border inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                        <FileText className="size-3" />
                        bank-match: TRX-77821
                      </span>
                      <span className="bg-muted text-foreground border-border inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                        <CircleCheck className="size-3" />
                        filing-ref: VATQ1-A928
                      </span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Avatar className="size-5">
                        <AvatarFallback className="text-[10px]">TB</AvatarFallback>
                      </Avatar>
                      Confirmed by Tim Borovkov · 2026-04-12
                    </div>
                    <Button size="sm" variant="outline">
                      <Plus /> Attach evidence
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rationale popover</CardTitle>
                    <CardDescription>
                      Every compliance task carries a <code className="font-mono">rationale</code>{" "}
                      from its jurisdiction config (why required · how to satisfy · guide link).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
                        <CircleAlert className="size-3" /> OPEN
                      </span>
                      <Badge variant="outline">employment</Badge>
                      <span className="text-foreground">Tyel registration</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon-xs" variant="ghost" aria-label="Why is this required?">
                            <HelpCircle />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 text-sm">
                          <p className="font-medium">Tyel (Finnish pension) registration</p>
                          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                            Required within 30 days of the first payroll run for any employee
                            earning above the monthly threshold. Applies to founder-employees too.
                          </p>
                          <a
                            href="#"
                            className="text-primary mt-3 inline-block text-xs underline underline-offset-4"
                          >
                            Read the full guide →
                          </a>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* ICONS */}
            <section className="space-y-6">
              <SectionHeading
                id="icons"
                title="Icon library"
                description="Lucide React. Always render at size-4 unless inside a button."
              />
              <Card>
                <CardContent className="grid grid-cols-3 gap-4 py-8 sm:grid-cols-4 md:grid-cols-6">
                  {demoIcons.map(({ icon: Icon, name }) => (
                    <div
                      key={name}
                      className="border-border flex flex-col items-center gap-2 rounded-md border p-4"
                    >
                      <Icon className="text-foreground size-6" />
                      <code className="text-muted-foreground text-[10px]">{name}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
