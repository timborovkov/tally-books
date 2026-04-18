# Tally — Design System

This document is the canonical reference for Tally's visual language. The **live** reference lives at [`/design-system-demo`](src/app/design-system-demo/page.tsx) — keep it in sync when adding anything that introduces a new pattern.

- **Tokens:** [`src/app/globals.css`](src/app/globals.css)
- **shadcn config:** [`components.json`](components.json)
- **Components:** [`src/components/ui/`](src/components/ui/) (shadcn) · [`src/components/`](src/components/) (Tally-specific)

---

## 1. Principles

1. **Clarity over density.** Accounting data is already dense — the chrome shouldn't be. Generous spacing, strong hierarchy, muted backgrounds.
2. **Neutral first, accent sparingly.** The palette is cool-neutral (tweakcn _LogisticOne_). Primary-colored surfaces signal intent (a CTA, a selected nav item) — never decoration.
3. **Tokens, not hex.** Never hardcode colors. Use semantic utilities (`bg-background`, `text-muted-foreground`) so dark mode and future theme swaps are free.
4. **Reuse before building.** Check [`components/ui/`](src/components/ui/) and the demo page first. If it's not there, install with `pnpm dlx shadcn@latest add <name>` before writing from scratch.
5. **State is visible.** Every versioned entity renders its state as a badge (DRAFT, READY, FILED, etc.). Loading and error states are part of the component, not an afterthought.
6. **Accessible by default.** AA minimum contrast, visible focus rings (`ring-ring`), labeled controls, semantic HTML.

---

## 2. Brand

### Wordmark

- Text: `TALLY` — always uppercase.
- Font: **Space Grotesk**, weight `600`, `tracking-tight`.
- Shipped as the reusable [`<Logo />`](src/components/logo.tsx) component. Sizes: `sm` · `md` · `lg` · `xl`.
- No icon mark. Do not pair the wordmark with a lockup mark.

### Tagline

- Copy: `Self-hosted finance for solo operators.`
- Rendered below the wordmark via `<Logo tagline />`. Uses body font, `text-muted-foreground`.
- Use on auth screens, the unauthenticated landing surface, and the loading splash — **not** inside the app chrome.

### Icon (favicon / app icon)

- [`src/app/icon.svg`](src/app/icon.svg) — a stylized scale (lucide `Scale`) inside a deep-navy rounded square. Next.js picks this up automatically via the App Router file convention.

---

## 3. Typography

| Role               | Token                             | Font          | Usage                                                                        |
| ------------------ | --------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| Body / UI          | `--font-sans` → `font-sans`       | Geist Sans    | Everything prose and UI by default                                           |
| Numeric / tabular  | `--font-mono` → `font-mono`       | Geist Mono    | Currency, IDs, dates in tables (`tabular-nums` helper when aligning columns) |
| Display / wordmark | `--font-display` → `font-display` | Space Grotesk | `<Logo />`, marketing-y headlines only                                       |

**Scale** (Tailwind defaults, no custom overrides): `text-xs` (0.75rem) → `text-6xl` (3.75rem). Pairings:

- Page title: `text-3xl font-semibold tracking-tight`
- Section heading (card): `text-lg font-semibold`
- Metric (big numbers): `font-mono text-3xl font-semibold tabular-nums`
- Helper / metadata: `text-xs text-muted-foreground` or `text-sm text-muted-foreground`

---

## 4. Color

Theme: **tweakcn LogisticOne** (`https://tweakcn.com/themes/cmlrqe6vc000104lbcjpo6cv0`). All values live in [`src/app/globals.css`](src/app/globals.css) as oklch CSS variables, exposed to Tailwind via `@theme inline`.

### Semantic tokens

Use these — never raw colors.

| Token                                    | Role                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| `background` / `foreground`              | Page surface + primary text                            |
| `card` / `card-foreground`               | Elevated content surface                               |
| `popover` / `popover-foreground`         | Floating overlays (dropdown, popover, tooltip)         |
| `primary` / `primary-foreground`         | Primary CTA, active state                              |
| `secondary` / `secondary-foreground`     | Secondary button, muted CTA                            |
| `muted` / `muted-foreground`             | Deemphasized text, subtle backgrounds                  |
| `accent` / `accent-foreground`           | Hover state, highlighted item                          |
| `destructive` / `destructive-foreground` | Delete, error, danger                                  |
| `border` / `input` / `ring`              | Separators · form fields · focus rings                 |
| `chart-1` … `chart-5`                    | Data-viz series                                        |
| `sidebar-*`                              | Dedicated sidebar palette (distinct from main surface) |

### Dark mode

- Implemented via `next-themes` with `attribute="class"` — adds/removes `.dark` on `<html>`.
- Default is `system` (follow OS). Toggled via [`<ModeToggle />`](src/components/mode-toggle.tsx).
- Every token has a dark-mode counterpart. When authoring new components, verify both modes at `/design-system-demo`.
- Never rely on `prefers-color-scheme` directly — go through `useTheme()` so the user's explicit choice wins.

---

## 5. Spacing, radius, shadow

- **Spacing:** Tailwind default 0.25rem scale. Common rhythm: `gap-2` inside, `gap-4` between groups, `gap-8` between sections.
- **Radius:** base `--radius: 0.5rem`. Scale: `rounded-sm` · `rounded-md` · `rounded-lg` · `rounded-xl` — pick by surface size, not decoration.
- **Shadow:** use semantic `shadow-sm` / `shadow-md` etc. (tweakcn ships a full 2xs→2xl ramp). Elevate overlays (`popover`, `dialog`) only — app content stays flat.
- **Container:** `max-w-7xl` for app content, `max-w-2xl` for settings forms, `max-w-md` for auth.

---

## 6. Motion

- Theme swap uses `disableTransitionOnChange` to avoid a visible flash.
- Interactive surfaces: `transition-colors` on hover, `transition-all` for size/opacity changes.
- Animations are subtle — state changes, not decoration. Avoid ambient motion.
- Always respect `prefers-reduced-motion` (shadcn primitives already do).

---

## 7. Components

See the live catalog at [`/design-system-demo`](src/app/design-system-demo/page.tsx) for every component in use. Notes:

- **Button** — 6 variants (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`) × 8 sizes. `default` is the CTA — at most one per screen.
- **Input / Textarea / Select** — always paired with a `<Label>`. Error state: `aria-invalid` on the input + small `text-destructive` helper below.
- **Card** — grouping container. Prefer `Card` over ad-hoc `div` wrappers for every listing block.
- **Badge** — Status vocabulary is reserved (see §8). Don't repurpose badge variants as generic accents.
- **Dialog / Sheet** — Dialog for confirmations and short forms; Sheet for longer edit flows (think: "edit invoice").
- **Sonner (Toaster)** — mounted once in `app/layout.tsx`. Use `toast.success`, `toast.error`, or `toast(title, { description })`.
- **Sidebar** — uses dedicated `sidebar-*` palette tokens so it can feel distinct. Provider must wrap the entire shell. Canonical nav groups: **Workspace** (Dashboard, Intake, Obligations) · **Books** (Invoices, Expenses, Declarations) · **Compensation** (Trips, Mileage, Benefits) · **Personal** (Personal finance) · **Account** (Settings, Members).
- **Skeleton** — render table-shaped skeletons on list pages and card-shaped on detail pages. Never use a spinner for page-level loads. Sets `role="status"` + `aria-busy="true"` for screen readers.

### 7.1 Canonical patterns

These aren't single components — they're compositions that recur across features. Live examples at `/design-system-demo#patterns`.

- **OCR confidence highlighting** — low-confidence extracted fields wear `ring-2 ring-amber-500/40` + a sibling `text-xs text-amber-700` helper. High-confidence fields look like any other input. Required on every OCR / vision surface per `PROJECT_BRIEF §3.6`, `§5.2`.
- **Mass-action toolbar** — every list page supports multi-select. Toolbar docks above the list when rows are selected, shows `n selected of N`, bulk actions (route, mark personal, request evidence, delete). Surface on the list container with `bg-accent/30`. Required on every list page per `PROJECT_BRIEF §3.6`.
- **Intake triage decision** — three routing dimensions per intake item: **scope** (business/personal radio), **entity** (select), **target flow** (select: expense / mileage_claim / trip_evidence / benefit_evidence / compliance_evidence). See `PROJECT_BRIEF §5.1.5.1`.
- **Evidence chip list** — attached evidence renders as `inline-flex rounded-md border bg-muted px-2 py-1 text-xs` with a leading lucide icon (`Paperclip`, `FileText`, `CircleCheck`). Followed by a small "Confirmed by" avatar row and an outline `+ Attach evidence` button. Used on compliance tasks, filings, mileage claims, benefit enrollments.
- **Rationale popover** — compliance tasks carry a `rationale` JSON from jurisdiction config (why · how to satisfy · guide link). Render as a `HelpCircle` icon `icon-xs ghost` button that opens a `Popover` with the rationale text + "Read the full guide →" link.

---

## 8. Status & versioning affordances

Three independent status taxonomies. **Don't mix their palettes** — each family owns its own semantic meaning.

### 8.1 Thing state (versioned entities)

Applies to every versioned Thing — invoices, expenses, declarations, trips, mileage claims, benefit enrollments, compliance tasks, etc. From `PROJECT_BRIEF.md §7.3`:

| Label                     | Meaning                                   | Tailwind classes                                                                 |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `DRAFT`                   | Editable, not yet ready                   | `bg-muted text-muted-foreground border-border`                                   |
| `READY`                   | Review-complete, pending filing           | `bg-primary/10 text-primary border-primary/30`                                   |
| `FILED`                   | Submitted to authority, locked            | `bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400` |
| `UNDERLYING DATA CHANGED` | Source entity mutated post-filing         | `bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400`         |
| `AUTO-REFRESH LOCKED`     | User opted out of automatic re-derivation | `bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400`                 |
| `IN PERIOD LOCK`          | Period closed, edits rejected             | `bg-destructive/10 text-destructive border-destructive/30`                       |

Always render uppercase, `text-[11px] font-medium tracking-wide`, with a leading lucide icon (`FileText`, `CircleCheck`, `RefreshCw`, `Lock`).

### 8.2 Intake queue (unified cross-entity inbox)

Status of each item in the unified intake inbox (`intake_items`) before it routes into a downstream flow (expense / mileage claim / benefit evidence / trip evidence / compliance evidence). See `PROJECT_BRIEF.md §5.1.5.1` and `data-structure.md §8.2.1`.

| Label          | Meaning                                    | Tailwind classes                                                                 |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `NEW`          | Fresh intake, not yet triaged              | `bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400`                 |
| `NEEDS REVIEW` | Low-confidence extraction or missing route | `bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400`         |
| `ROUTED`       | Triage decided — awaiting confirmation     | `bg-primary/10 text-primary border-primary/30`                                   |
| `CONFIRMED`    | User confirmed downstream artifact created | `bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400` |
| `REJECTED`     | Discarded by triage (not relevant)         | `bg-muted text-muted-foreground border-border`                                   |

Leading icons: `Inbox`, `CircleAlert`, `MoveRight`, `CheckCircle2`, `CircleSlash`.

### 8.3 Compliance task (obligation tracker)

Status of the jurisdiction-driven employment / tax / reporting tasks generated by the obligation evaluator (`compliance_tasks`). See `PROJECT_BRIEF.md §5.4.2` and `data-structure.md §9.8.3`.

| Label     | Meaning                                          | Tailwind classes                                                                 |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `OPEN`    | Active obligation — evidence not yet satisfied   | `bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400`         |
| `DONE`    | Satisfied (by bank match, filing ref, doc, etc.) | `bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400` |
| `SNOOZED` | Paused until `snooze_until`                      | `bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400`                 |
| `WAIVED`  | Manually dismissed with rationale                | `bg-muted text-muted-foreground border-border`                                   |

Leading icons: `CircleAlert`, `CheckCircle2`, `AlarmClock`, `Archive`.

Obligation **domain** (`employment` / `tax_payment` / `reporting` / `other`) renders as a separate secondary badge next to the status, using `variant="outline"`.

### 8.4 Notes

Timeline panel + edit-session indicator: documented TBD in a future revision once those screens ship.

---

## 9. Accessibility

- **Focus:** all interactive elements get a visible `ring-ring` focus ring (shadcn defaults handle this).
- **Hit target:** minimum `h-9` / `size-9` for clickable controls.
- **Labels:** every `Input`, `Select`, `Checkbox`, `Switch`, `RadioGroupItem` gets a `<Label htmlFor>`. Never rely on placeholder-as-label.
- **Errors:** set `aria-invalid` on inputs in error state; provide a text description in an adjacent node.
- **Semantic HTML:** `<main>`, `<nav>`, `<section>`, `<header>`. Heading levels reflect structure.
- **Color-blind safe:** status is always label + icon + color — never color alone.

---

## 10. Adding a new component

1. Check [`/design-system-demo`](src/app/design-system-demo/page.tsx) — is it already there?
2. If it's a shadcn primitive: `pnpm dlx shadcn@latest add <name>`.
3. If it's Tally-specific: add it under [`src/components/`](src/components/), import from there.
4. Add an example section to the demo page.
5. If it introduces a new pattern (new token, new motion, new status), document it here.
6. If knip flags it as unused (because it's pre-built), add its path to `knip.json` `entry` array.
7. Before building a bespoke pattern, check §7.1 — many patterns (triage, mass actions, evidence chips, rationale popovers) are already canonical. Reuse them.

---

## 11. Non-goals / deliberately not designed (yet)

Things intentionally outside the v0.1–v1.0 design system scope, to keep the surface honest:

- **Email notifications / ICS calendar feeds** — `PROJECT_BRIEF.md §5.13` and `TODO.md` defer these to post-v1.0. The v0.6 reminder pattern is dashboard + in-app only.
- **Bank reconciliation UI** — P3 feature (`PROJECT_BRIEF.md §5.14`). Don't design this until the spec lands.
- **Mobile PWA receipt capture** — post-v1.0. Responsive web works; no separate mobile design.
- **Agent chat sidebar** — the AI agent surface (`§5.2`) arrives in v0.5. Patterns TBD once that work starts.
- **Version-diff rendering** — versioning exists in the DB (`§5.3`), but the Google-Docs-style timeline UI is a v0.3 deliverable. Until then, DESIGN.md §8.4 stays a stub.
- **Public marketing site** — Tally is self-hosted; there's no sign-up funnel, no indexed pages. `robots.txt` disallows all.

If a PR proposes designing one of these, it's either scope creep or the roadmap has moved. Check `TODO.md` before committing.

---

## 12. Route isolation

The demo page has its own nested [`layout.tsx`](src/app/design-system-demo/layout.tsx). When we add navbar / sidebar / auth gating to the root `app/layout.tsx`, the demo page stays untouched — it remains a pristine visual reference as the app evolves.
