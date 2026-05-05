# Tally

## Business and personal finance, in one private instance

**Self-hosted accounting for solo operators who run multiple entities across borders—company books, invoicing, expenses, budgeting, and business taxes alongside your personal finances, personal taxes, and other mandatory contributions, plus employer benefits, mileage and commute compensation, and jurisdiction-guided employment obligations, with versioned ledgers, tax-aware workflows, and an agent that actually knows the whole picture.**

Multi-entity. Versioned. AI-assisted. Travel, benefits, and guided jurisdiction rules. Single-tenant by design.

[Project brief](./PROJECT_BRIEF.md) · [Roadmap](./TODO.md) · [Issues](https://github.com/timborovkov/tally-books/issues)

---

> ⚠️ **Status: pre-alpha, under active development.** Tally is being built in the open. The core architecture is settled (see [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)) and milestones are tracked in [`TODO.md`](./TODO.md). It is not yet usable. Star the repo to follow along.

> **Not a replacement for professionals or “official” stacks.** Tally is **not** meant to substitute your accounting firm, licensed tax advisors, auditors, or whatever accounting software or filings workflow your jurisdiction or engagement requires. It is built to run **alongside** them—as a **personal navigator**: one private place to keep _your_ books, obligations, receipts, and context organized so you, your advisors, and grounded tools are looking at the same picture. Judgment calls and statutory sign-offs stay with the people and systems responsible for them.

## What is Tally?

Tally is the bookkeeping app the author wanted instead of spreadsheets. It handles personal finances and one or more legal entities (Estonian OÜ, Finnish toiminimi, US LLC, …) in a single unified view, generates tax declarations and annual reports automatically, versions everything like Google Docs, and ships with a built-in AI agent that can read, reason about, and help update your financial state.

It is **single-tenant**: one deployment = one person's books. Not SaaS. Self-hosted via Docker, typically at a private subdomain.

It is **jurisdiction-agnostic**: nothing is hardcoded to a specific country's rules. Tally ships with prefilled configs for Estonia, Finland, and Delaware (US) to validate the abstractions, and adding new jurisdictions is configuration, not code.

## Why does this exist?

**The landscape is wrong-shaped for how micro-entrepreneurs actually live.** Freelance, a small SaaS, holding companies, another project on the side—you are still one person trying to see the **whole picture**: how cash, tax, dividends, contributions, and runway connect **across** entities; how **company and personal investments** and **stock options, RSUs, and similar equity comp** sit beside operating books; and how positions that blur the firm’s balance sheet with your household net worth stay in view together—not a ritual of opening “company A’s stack” in isolation. For this profile, **personal finances are on the same decision surface as the businesses**; they are not a separate hobby or an optional add-on module.

Small-business SaaS (Xero, QuickBooks, FreeAgent, …) still centers **one legal entity**; multi-entity is often shallow or bolted on, and the tooling still behaves as if “personal” lived somewhere else. ERP-style suites are the opposite problem—powerful but heavy, built for teams with accountants, not for one operator stitching a patchwork together. **There is no retained McKinsey or KPMG desk** to integrate it all: holistic planning, research, and tradeoffs are **DIY by default**, usually in spreadsheets and notes, simply because comprehensive advisory is not realistic at micro scale.

**Everything was split across too many places.** One tool or file for one company’s books, another for the next, another lane for personal finance, personal tax and contributions back in spreadsheets, receipts scattered, trip reports living on a laptop and painful to assemble—high friction, low reuse, and no single place that understands how the pieces connect.

**Compensation and capture are a different failure mode.** It is not only “log an expense”: **business trips** and per-diem narratives, **mileage and commute reimbursements** (where the rules change by _why_ you drove and _where_ you pay tax), and **benefits and allowances** (lunch, sports and culture, gear, phone, home office, company car or e-bike, health—whatever each jurisdiction calls normal) all keep asking _business or personal? which legal entity? cash reimbursement, tax-free allowance cap, or taxable in-kind?_ Receipts and approvals still bounce between **parallel inboxes per company** (the same proof uploaded five times, or not at all because you opened the wrong app). Elections and evidence sit in email and half-finished documents **instead of beside the ledger and filings they should drive**—so even when the “big picture” tools exist, the layer that actually moves tax and cash stays brittle.

**A chat LLM isn’t enough on its own.** Even a good model can’t give grounded advice if it doesn’t see your corporate structures, legal entities, jurisdictions, **and the statutory, regulatory, and practical norms that apply in each**—and it can’t _do_ much without tools (e.g. suggest budgets, stress-test payout structures, prefill declarations). Tally is the system of record those answers should attach to, with an agent that can read state and take structured actions.

**There’s no margin for “I’ll remember later.”** Obligations, filings, and one-off tasks slip without a proper calendar of what’s due, what’s blocked on what, and what still needs evidence. Tally is also meant to be that operational backbone—not only storage for numbers.

So: **one private instance** for multi-entity + cross-border + **business and personal in one ledger-shaped model**, versioning, tax-aware workflows, integrations, and an agent that actually knows the whole picture—without shipping your financial life to someone else’s SaaS.

## Highlights

- **Multi-entity, multi-jurisdiction.** One unified view with per-entity drill-down. Personal finances are first-class, not an afterthought.
- **Versioning of everything.** Invoices, expenses, declarations, reports, budgets, balance sheets, trips, benefit enrollments, compliance tasks, and the rest share history with diffs and actor attribution—like Git or Google Docs, for your books.
- **Auto-generated declarations and reports.** Monthly VAT, annual reports, personal income tax filings — Tally generates the drafts from your underlying data, you review and file. "Underlying data changed" flags appear when source data shifts after filing.
- **Period locks and edit safety.** Lock a financial year once it's filed. Editor sessions block background recalculation so your in-progress edits never get overwritten by an auto-refresh.
- **Built-in AI agent.** Scoped tool sets across chat, receipt categorization, budgeting, tax sanity checks, proofreading, proactive nudges—and **rule-grounded** help on benefits, mileage, and pay-structure trade-offs (still not a substitute for your advisor where the law says so). Provider-abstracted (OpenAI today, Ollama possible later).
- **Receipt OCR.** Bulk upload receipts; vision extraction pulls merchant, date, total, VAT.
- **Integrations as plugins.** Catalog-based; add a new invoicing or data-source provider by extending a base interface. Finnish e-invoicing, Paperless-ngx, Clockify on the v1 path.
- **Travel & compensation.** Multi-country **trips** with per diem, narratives, and linked expenses—plus **mileage and commute claims** (e.g. kilometrikorvaukset-style rate tables and other jurisdictions’ equivalents) modeled beside the ledger, not in a side folder.
- **Employer benefits & allowances.** Jurisdiction catalogs (lunch, culture, gear, phone, home office, car or e-bike schemes, health—**whatever each country’s config describes**) with enrollments that **post through** to payroll, books, and tax drafts—not HR-only checkboxes.
- **Jurisdiction-guided employment tasks.** Config-driven checklists when you hire—including **when you’re the employee of your own company** (Tyel-style pension registration, mandatory insurance where applicable, pay-floor pointers, working-time expectations, and similar). Missing evidence surfaces as **tasks** on the dashboard and in reminders—memory aid from rules, not a labour-law guarantee.
- **Tax & compensation scenarios.** What-if **residency** and **company jurisdiction** shifts, salary vs dividends—and **vehicle / mileage vs company car**, **benefit-package toggles**, and other structured comparisons—without writing to real ledgers until you choose.
- **English-only, UTC-everywhere.** No i18n. Times stored and displayed in UTC, explicitly.
- **No search engine indexing.** Self-hosted, private by design.

## Stack

TypeScript, Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, Drizzle, PostgreSQL (with pgvector for embeddings), BetterAuth, Resend, OpenAI (chat + vision + embeddings), Vercel AI SDK, RustFS (S3-compatible blob storage), pg-boss, Sentry, Docker.

See [`PROJECT_BRIEF.md` §3](./PROJECT_BRIEF.md#3-technical-stack) for details on each choice.

## Getting started

> Status: foundation scaffolding (v0.1) is in place — Next.js, strict TypeScript, Tailwind v4, shadcn/ui, ESLint, Prettier, Knip, Vitest, Husky, GitHub Actions CI, Sentry wiring (off by default locally), app shell with top-nav + sidebar + quick-add modal, and the Docker stack for `postgres` (with pgvector) and `rustfs`. Most product features are still on the roadmap; see [`TODO.md`](./TODO.md).

### Prerequisites

- Node.js `>=20.11` (use `.nvmrc` → `nvm use`)
- pnpm `>=10` (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker + Docker Compose v2

### Local development

```bash
git clone https://github.com/timborovkov/tally-books.git
cd tally-books
pnpm install
cp .env.example .env       # fill in OPENAI_API_KEY, RESEND_API_KEY, secrets
docker compose up -d       # starts postgres (with pgvector) and rustfs
pnpm db:migrate            # apply Drizzle migrations
pnpm db:seed               # create the bootstrap admin user
pnpm dev                   # http://localhost:3000
```

Useful scripts (full list in [`CONTRIBUTING.md`](./CONTRIBUTING.md)):

| Command                 | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `pnpm dev`              | Next.js dev server (Turbopack)                        |
| `pnpm build` / `start`  | Production build / serve the build                    |
| `pnpm lint`             | ESLint (zero warnings allowed)                        |
| `pnpm typecheck`        | `tsc --noEmit` against the strict config              |
| `pnpm format`           | Prettier write (`format:check` for CI)                |
| `pnpm knip`             | Dead-code / unused dependency scan                    |
| `pnpm test`             | Vitest unit tests (`test:watch` for watch)            |
| `pnpm test:integration` | Vitest integration tests (require Postgres reachable) |
| `pnpm db:generate`      | Drizzle: generate a migration from the schema diff    |
| `pnpm db:migrate`       | Drizzle: apply pending migrations                     |
| `pnpm db:push`          | Drizzle: push schema (dev only — skips migrations)    |
| `pnpm db:studio`        | Drizzle Studio: browse the database in a UI           |
| `pnpm db:seed`          | Insert the bootstrap admin user (idempotent)          |

Health endpoints once the dev server is up:

- `GET /api/health` — liveness probe (process is up)
- `GET /api/ready` — readiness probe (will check Postgres/RustFS once wired)

### Self-hosting (production)

The local [`docker-compose.yml`](./docker-compose.yml) shows the infra Tally needs: `app`, `postgres` (with pgvector), `rustfs`. Adapt it to your hosting setup — your reverse proxy (Caddy, Traefik, nginx) terminates TLS and forwards to the `app` service; your volumes persist `postgres` and `rustfs` data; the `postgres` and `rustfs` ports stay off the public internet. No opinionated production compose file is provided — deployment shapes vary too much to pretend one works everywhere.

## Observability

Sentry is wired for the browser, Node server, and edge runtimes. It is **off by default** — local dev runs with blank DSNs so your development crashes don't pollute the production issue stream. See [`docs/architecture/sentry.md`](./docs/architecture/sentry.md) for enabling it in a deploy, Docker build-arg + secret wiring for source map upload, and how the error boundaries interact with Sentry.

## Documentation

- [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) — full specification: goals, stack, features, architecture, data model, dependency graph
- [`TODO.md`](./TODO.md) — milestone-based roadmap with checkboxes
- [`docs/architecture/sentry.md`](./docs/architecture/sentry.md) — error reporting setup
- [`docs/architecture/dates.md`](./docs/architecture/dates.md) — UTC-only convention + the date helpers
- [`docs/architecture/ui-conventions.md`](./docs/architecture/ui-conventions.md) — app shell, loading, error boundaries
- [`docs/`](./docs/) — other architecture docs, integration guides, jurisdiction notes, usage docs (in progress)
- [`CHANGELOG.md`](./CHANGELOG.md) — version history once we start cutting releases

## Contributing

Tally is open source and built primarily for the author's own use, but contributions are welcome — especially:

- New jurisdiction configs (Spain, Portugal, Germany, Estonia/Finland refinements)
- New integration adapters (e-invoicing providers, time trackers, banks)
- Bug reports and reproductions
- Documentation improvements

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow. Open an issue first to discuss anything non-trivial.

## Self-hosting

Tally is built to be self-hosted, single-tenant. Anyone running businesses in supported jurisdictions can deploy it for their own use. There will not be a hosted version.

If you deploy Tally for yourself, your data stays on your infrastructure. The only outbound calls are to the third-party services you explicitly configure (OpenAI for AI features, Resend for email, your invoicing provider, etc.).

## License

[MIT](./LICENSE) © 2026 Tim Borovkov.

## Acknowledgments

Built with [Claude](https://claude.ai) as a thinking partner during specification. The architecture, decisions, and code are the author's; Claude helped with structure and pressure-testing the design.

---

Built by [Tim Borovkov](https://timb.dev) · An open-source project
