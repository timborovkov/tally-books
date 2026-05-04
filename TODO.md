# Tally — Roadmap & TODO

> Tracking the path from empty repo to v1.0 and beyond.
> Bugs and small tasks live in [GitHub Issues](https://github.com/timborovkov/tally-books/issues). This file is the high-level milestone view.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred / dropped

---

## v0.1 — Foundation

The minimum scaffolding needed to start building features safely.

### Repo & tooling

- [x] Initialize Next.js (App Router) + TypeScript (strict)
- [x] Tailwind + shadcn/ui set up
- [x] Design system: tweakcn LogisticOne theme, ~25 shadcn components, Logo, ThemeProvider, ModeToggle
- [x] `DESIGN.md` + `/design-system-demo` live component reference page
- [x] Dark / light / system mode via `next-themes`
- [x] ESLint (strict config) + Prettier + Knip configured
- [x] Vitest configured for unit tests
- [x] GitHub Actions CI: lint, typecheck, knip, unit, integration
- [x] Husky + lint-staged commit hooks
- [x] `.gitignore` includes `.claude/`, `CLAUDE.md`, `internal-docs/`, `.env`
- [x] `internal-docs/` folder created (gitignored)
- [x] `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` (decide MIT vs AGPL)
- [x] Issue templates (bug, feature) in `.github/ISSUE_TEMPLATE/`
- [x] PR template

### Containers & local dev

- [x] `Dockerfile` (multi-stage: deps → build → runtime)
- [x] `docker-compose.yml` for local dev (`app`, `postgres`, `rustfs`, `qdrant`) — doubles as infra shape reference for self-hosters; no separate prod compose shipped
- [x] `.env.example` with all required env keys documented
- [x] Health + readiness endpoints

### Database & ORM

- [x] Drizzle installed and configured
- [x] Migration tooling working (`drizzle-kit`)
- [x] Versioning primitives schema (the `_version` pattern, edit_sessions, audit_log)
- [x] Core tables: user, session, invite, permission, audit_log
- [x] Seed scripts for dev (admin user, example entities)

### Auth & IAM

- [x] BetterAuth integrated
- [x] 2FA mandatory (TOTP)
- [x] Strong password policy enforced
- [x] No SSO (explicitly disabled)
- [x] First-boot setup wizard: create admin → guided initial config
- [x] Invite flow: admin sends scoped invite → email → accept → account created
- [x] User & invite management UI for admin
- [x] Permission scope model (resource × access) wired into services

### Entities & jurisdictions

- [x] `entity` table + CRUD
- [x] `jurisdiction` table + CRUD
- [x] Prefilled jurisdiction configs: Estonia, Finland, Delaware (US)
- [x] Personal pseudo-entity handling
- [x] Entity ↔ person links (board, CEO, shareholder)
- [x] `person` table + CRUD (legal name, tax residency, country IDs)
- [x] Entity management UI

> Obligation catalogs live with the compliance work that consumes them:
> employment catalog in v0.6 (§"Employment obligations & compliance tasks"),
> tax/payment/reporting catalogs in v0.7 (§"Tax/payment/reporting obligations").
> The JurisdictionConfig Zod schema extends cheaply when those land — no
> v0.1 pre-reservation needed.

### Cross-cutting

- [x] UTC date handling everywhere — no local timezone leaks
- [x] Sentry integrated (client + server)
- [x] `robots.txt` disallow all + `X-Robots-Tag: noindex` headers
- [x] Loading skeleton component conventions established
- [x] Error boundary conventions established
- [x] App-wide layout: nav bar with search, sidebar, dashboard shell
- [x] Quick-add `+` button modal (skeleton, even if entries are stubs)

### Versioning engine

- [x] `versioned<T>.update()` helper with diff computation
- [x] Version timeline UI component (Google Docs-style history)
- [x] State machine helper for `draft → ready → filed → amended`
- [x] Period lock model + enforcement at service layer

> The `auto_refresh_locked` toggle lives with the Editor-safety work in v0.3
> (§"Editor-safety"). The toggle has nothing to gate on until the recalc
> worker lands there — pre-building the UI is scope-creep.

### Docs (started in v0.1, kept current as we build)

- [x] `docs/architecture/overview.md`
- [x] `docs/architecture/versioning.md`
- [x] `docs/architecture/auto-refresh.md`
- [x] `docs/data-model.md` (initial)
- [x] `docs/guides/deployment.md` (initial)
- [x] `docs/jurisdictions/estonia.md`
- [x] `docs/jurisdictions/finland.md`
- [x] `docs/jurisdictions/us-delaware.md`

---

## v0.2 — Source data

Get the inputs in: receipts, expenses, invoices, clients, categories.

### Files & storage

- [x] RustFS client wired up (AWS SDK v3 against `S3_*` env)
- [x] `blob` table + upload service (streaming, no base64 in DB)
- [x] Buckets: `receipts/`, `invoices/`, `legal-docs/`, `exports/`

### Receipts

- [x] `receipt` table with versioning
- [x] Single + bulk upload UI (drag and drop)
- [x] OCR/vision job queued via pg-boss on upload
- [x] OpenAI vision provider with structured output schema
- [x] Confidence highlighting in UI for low-confidence fields
- [x] User review/edit/confirm flow
- [x] Mass actions: bulk re-extract, bulk assign entity/category, bulk delete
- [x] **Unified intake inbox** (cross-entity queue) with status: `new`, `needs_review`, `routed`, `confirmed`, `rejected`
- [x] Routing fields in queue: business vs personal, entity, target flow (expense/trip/mileage/benefit/compliance evidence)
- [x] Bulk triage actions: mass route, mass mark personal, mass attach to trip/claim, mass request missing evidence
- [x] Wrong-route recovery flow with audit trail and downstream re-evaluation signals

### Expenses

- [x] `expense` table with versioning
- [x] CRUD UI with entity column visible across all entities
- [x] Filters: entity, category, date range, paid-by, vendor
- [x] Pagination + global search field
- [x] Mark as "paid by personal card, reimbursable by entity" flow
- [x] Link receipt ↔ expense
- [x] Mass actions on the list page

### Invoices (drafts + PDF)

- [x] `invoice` table with versioning
- [x] Line-item composer
- [x] PDF generation (basic, branded per entity)
- [x] Invoice list with filters, status, drill-down
- [x] Mark as paid → updates books
- [x] Internal invoice shortcut: entity → entity (mirror booking on both sides)
- [x] Drafts versioned, deletable

### Clients & suppliers

- [x] `client`, `supplier`, `contractor`, `employee` tables (one model with kind discriminator)
- [x] CRUD UI
- [x] Contracts attached as documents

### Categories

- [x] `category` table (hierarchical, scoped per jurisdiction or global)
- [x] Category management UI
- [ ] Default category sets shipped with each jurisdiction

### Bookkeeping core (basic)

- [ ] Income statement view (overall + per entity, by month and FY)
- [ ] Expense statement with category breakdowns
- [ ] Cash flow view
- [ ] Basic ledger / transaction journal

### pg-boss

- [x] pg-boss installed and running in dev compose
- [x] Job queue conventions documented
- [x] Worker process boots alongside app

### Tests

- [x] Integration test: upload receipt → OCR → user confirms → expense created
- [x] Integration test: create internal invoice toiminimi → OÜ → both sides booked
- [x] Integration test: cross-entity intake queue routing (business/personal/entity/flow) creates the correct downstream draft artifacts + audit entries

---

## v0.3 — Derivations

Where the system stops being a glorified database and starts being useful: VAT declarations, balance sheets, and the editor-safety rules that keep them sane.

### Event bus

- [ ] In-process event bus + pg_notify cross-worker
- [ ] Domain events emitted from all source-data mutations
- [ ] Dependency registry implemented (which derived artifacts depend on which sources)

### Recalculation worker

- [ ] pg-boss queue for recalc jobs
- [ ] Worker respects: filed lock, period lock, `auto_refresh_locked`, active edit session
- [ ] Sets `underlying_data_changed` flag on filed Things when sources change
- [ ] System actor for auto-refresh writes (clearly attributed in version history)

### Editor-safety

- [ ] `edit_sessions` table + soft lock acquisition on editor entry
- [ ] Heartbeat + TTL garbage collection
- [ ] Controlled refresh on editor entry: diff vs. last save, accept/discard
- [ ] "Refresh from data" button in editors with field-by-field diff
- [ ] `auto_refresh_locked` per-Thing toggle in UI
- [ ] Period lock UI (lock FY 2024, etc.)

### Versioning timeline

- [ ] Timeline panel on every versioned Thing
- [ ] View any prior version
- [ ] Show actor (user vs system), reason, diff
- [ ] Badge system: DRAFT / READY / FILED / UNDERLYING DATA CHANGED / AUTO-REFRESH LOCKED / IN PERIOD LOCK

### VAT declarations

- [ ] `vat_declaration` table with versioning
- [ ] Estonia monthly VAT calculation logic
- [ ] Finland VAT calculation logic (cadence per registration)
- [ ] Auto-generation on schedule (cron in pg-boss)
- [ ] Prefill from expenses + invoices for the period
- [ ] Mark filed flow with filing reference
- [ ] Portal links + guide links visible on the declaration page

### Balance sheets

- [ ] `balance_sheet` table with versioning
- [ ] Per-entity (real) balance sheets
- [ ] Personal balance sheet (informational)
- [ ] Asset/liability/equity entry types
- [ ] Auto-build from underlying data + manual entries

### Tests

- [ ] Integration test: create expense → VAT declaration updates → file → modify expense → flag set
- [ ] Integration test: lock period → mutation rejected
- [ ] Integration test: edit session blocks auto-refresh, controlled refresh on entry shows diff

---

## v0.4 — Integrations wave 1

The integrations highest on the priority list.

### Integration catalog framework

- [ ] `integrations/` folder structure with typed catalogs
- [ ] Base interfaces: `InvoicingProvider`, `DataSourceProvider`, `TimeTrackingProvider`
- [ ] Catalog rendering in settings UI (shows enabled/disabled based on env)

### Finnish e-invoice (P0 integration)

- [ ] Pick provider (Maventa, Apix, or similar — research)
- [ ] Implement `InvoicingProvider` for chosen vendor
- [ ] Send-via-e-invoice button on invoice detail page
- [ ] Status sync (sent, delivered, error)
- [ ] Docs: `docs/integrations/finnish-e-invoice.md`

### Paperless-ngx

- [ ] Implement `DataSourceProvider` for Paperless-ngx
- [ ] Initial bulk import flow
- [ ] Ongoing sync via pg-boss cron job
- [ ] Document → receipt mapping with deduplication
- [ ] Docs: `docs/integrations/paperless-ngx.md`

### Clockify

- [ ] Implement `TimeTrackingProvider` for Clockify
- [ ] `time_entry` table + sync
- [ ] Per-client / per-project breakdown view
- [ ] Docs: `docs/integrations/clockify.md`

---

## v0.5 — AI agent core

The first fully usable agent: chat surface with a useful tool set.

### Provider abstraction

- [ ] `ChatProvider`, `VisionProvider`, `EmbeddingProvider` interfaces
- [ ] OpenAI implementations of all three
- [ ] No OpenAI SDK types leak into app code

### Agent framework

- [ ] Vercel AI SDK integrated (server + UI kit)
- [ ] Agent folder structure: `src/lib/ai/agents/<name>/`
- [ ] `AgentConfig` type + loader
- [ ] First agent: `general-chat` (config, system prompt, README)

### Tools (initial set)

- [ ] `read.queryExpenses`, `read.queryInvoices`, `read.getDeclaration`, `read.listCategories`, …
- [ ] `write.createExpense`, `write.createInvoiceDraft`, `write.suggestCategory`
- [ ] `calc.evaluateExpression` (small expression evaluator, no full sandbox yet)
- [ ] `web.search`, `web.fetch`
- [ ] `rag.query` (gated by `agent.ragCollections`)
- [ ] Tool permission = intersection of agent.tools and user IAM scope
- [ ] Destructive tool calls render a UI confirmation card

### Conversation storage

- [ ] `agent_thread`, `agent_message`, `agent_action` tables
- [ ] Per-agent thread lists
- [ ] Search across threads

### Embeddings & Qdrant (basic)

- [ ] Qdrant in docker-compose
- [ ] Qdrant client + collection definitions in `src/lib/search/`
- [ ] `embedding_index` table
- [ ] First collections wired up: `documents`, `expenses`, `invoices`
- [ ] Ingestion job on relevant domain events
- [ ] ACL filter on every query

### Context injection

- [ ] Big "business structure" markdown field in settings
- [ ] Always injected into agent system prompt
- [ ] Jurisdiction summary auto-built and injected

### Docs

- [ ] `docs/architecture/ai-agents.md` (index, conventions, how to add an agent)
- [ ] `docs/architecture/embeddings-and-search.md`
- [ ] Per-agent README in each agent folder

---

## v0.6 — Payroll, trips, budgets

### Payroll & payouts

- [ ] `payroll_run` table with versioning
- [ ] Calculate net from gross (Estonia, Finland)
- [ ] Calculate gross from net (the "I want €1000 net" flow)
- [ ] Payout kinds: salary, dividend, board comp, yksittäisotto
- [ ] Guided payout flow per jurisdiction
- [ ] Payslip PDF generation
- [ ] Books update on payroll run

### Contractors & employees

- [ ] CRUD with all the metadata fields from §5.4
- [ ] Contract attachments
- [ ] Contractor vs employee scenario comparison

### Trips & per diem

- [ ] `trip` table with versioning
- [ ] Multi-country destination tracking
- [ ] Per-diem calculation per jurisdiction rules
- [ ] Linked expenses
- [ ] Trip narrative / business justification field
- [ ] `trip_report` derived artifact

### Mileage, commute & non–per-diem travel compensation

- [ ] `commute_mileage_claim` (or equivalent) table with versioning
- [ ] Jurisdiction **rate tables** and rule refs (Finnish kilometrikorvaukset-style + hooks for other countries)
- [ ] Distinct flows for **commute** vs **business trip** vs **overnight per diem** where rules diverge
- [ ] Evidence capture (distance log, route export, odometer notes—configurable per jurisdiction)
- [ ] Generated **expense lines** + linkage into declarations / reports where applicable

### Employer benefits & allowances

- [ ] `employer_benefit_enrollment` (or equivalent) table with versioning
- [ ] Jurisdiction **benefit catalogs** (types, caps, taxability, social-charge treatment, carry-forward)—seed EE + FI patterns (lunch, sports/culture, massage, commute subsidy, healthcare, therapy, dental, phone, home office, equipment, company car / e-bike, etc.) as **examples**, not hardcoded logic spread through the app
- [ ] Enrollment UI (who, which entity, effective dates, parameters)
- [ ] **Accounting integration:** posts through payroll lines, expenses, or accruals per rules; updates income statements, annual reports, personal tax drafts, budgets, and `underlying_data_changed` on dependents
- [ ] Agent-readable **rule pack** excerpts (statute / guide URLs + structured fields) for grounded Q&A

### Employment obligations & compliance tasks

- [ ] `compliance_task` (or equivalent) with versioning / audit trail: `open` → `done` | `waived` | `snoozed`, evidence attachments, link to `employment_relation` / `employee` + `jurisdiction_id` + `obligation_key`
- [ ] Jurisdiction config: **employer–employee obligation catalog** (structured checklist items: e.g. health insurance where mandatory, **Tyel** / pension–social registration, minimum pay references, working-time & record-keeping expectations—each with official guide URLs). Seed **FI + EE** as data-driven examples, not scattered conditionals in app code
- [ ] **Evaluator:** on hire / employment update / jurisdiction config change → diff catalog vs stored evidence (enrollments, policy refs, registration flags) → create or reopen tasks (e.g. “no health insurance on file for new employee”)
- [ ] **Founder-as-employee:** same rules when the admin is on payroll of an entity they control (salary, director–employee, etc.)—no “only other hires” blind spot
- [ ] Dashboard surfacing + filters (entity, person, obligation kind); optional due hints from config
- [ ] Minimal **in-app reminders** for open tasks in v0.6 (full email/ICS integration can follow **Reminders & calendar** in v1.0)
- [ ] Agent: list / explain open compliance tasks using jurisdiction rule excerpts (not legal sign-off)

### Obligation engine foundation (shared model)

- [ ] Extend `compliance_task` shape to support **domain-scoped obligations** (`employment`, `tax_payment`, `reporting`, …) and generic `subject_type`/`subject_id` (entity, filing, employment relation, etc.)
- [ ] Shared evaluator framework: declarative rule input + current-state snapshot -> open/reopen/close tasks (idempotent; safe to rerun)
- [ ] Task rationale payload from config (`why_required`, `how_to_satisfy`, guide links) visible in UI and agent responses

### Meetings

- [ ] `meeting` table
- [ ] Link to expenses for justification

### Budgets

- [ ] `budget` table with versioning
- [ ] Business budgets (travel, per diem, **mileage/commute**, **employer benefit costs**, SaaS, hardware, etc.)
- [ ] Personal budgets (rent, food, etc.)
- [ ] Budget vs reality view — uses budget version active in that period
- [ ] Income-based personal budget estimation

### Agents

- [ ] `budget-helper` agent
- [ ] `receipt-categorizer` agent (suggest categories, accept/reject UI pattern)
- [ ] Tools + prompts for **benefit / mileage / commute** comparisons grounded in jurisdiction configs and user enrollments (same disclaimers as tax-advisor: not professional advice)

---

## v0.7 — Annual reports, personal tax, debts

### Annual reports

- [ ] `annual_report` table with versioning
- [ ] Estonia annual report generation
- [ ] Finland annual report (where applicable for toiminimi)
- [ ] Disclaimer banner on every generated report

### Personal income tax

- [ ] `income_tax_return` table with versioning
- [ ] Finland personal income tax prep
- [ ] Estonia personal income tax prep
- [ ] Personal income from external sources (stock options, exits, dividends, etc.)
- [ ] **Taxable benefits & imputed income** from `employer_benefit_enrollment` / payroll flows rolled into personal return drafts where jurisdiction requires

### Tax/payment/reporting obligations (non-employment)

- [ ] Jurisdiction config: **tax/payment/reporting obligation catalogs** keyed by entity type + registration status (examples: periodic remits, prepayments, recurring declarations, supporting reports)
- [ ] Evaluator triggers: period rollover, filing state changes, payment state changes, entity registration changes, and jurisdiction-config updates
- [ ] Required-but-missing checks: compare obligation catalog vs available evidence (`mark filed` refs, payment records, generated declarations/reports, linked docs)
- [ ] Create/reopen `compliance_task` items for non-employment obligations with due hints and rationale text
- [ ] Dashboard grouping/filtering by obligation domain (`employment` vs `tax_payment` vs `reporting`)
- [ ] Agent: summarize open non-employment obligations and explain which state/evidence would close each task (still non-advisory)
- [ ] Configurable obligation `satisfaction_mode` support (`bank_match`, `filing_ref`, `doc_evidence`, manual override-with-reason)
- [ ] Payment-match policy documented + implemented (amount/date tolerance, split payments, partial satisfaction handling)
- [ ] Evaluator idempotency guard (no duplicate active tasks for same obligation subject)

### Tests (obligation engine precision)

- [ ] Integration test: founder-as-employee missing evidence opens task; attaching evidence closes task
- [ ] Integration test: non-employment obligation opens on due period; closes via configured satisfier (`bank_match` or `filing_ref`)
- [ ] Integration test: evaluator rerun does not create duplicate active `compliance_task` rows
- [ ] Integration test: reminder/calendar fan-out dedupes repeated evaluator runs and stops after task close/snooze

### Debt tracking

- [ ] Tax debt tracking
- [ ] Other debts + payoff plans
- [ ] Surfaced on dashboard

### Agents

- [ ] `tax-advisor` agent
- [ ] `proofreader` agent (gaps, missing items, logical errors in reports)

---

## v0.8 — Scenarios & analytics

### Scenarios

- [ ] `scenario` table with versioning
- [ ] Residency switcher (Estonia, Finland, others)
- [ ] Company jurisdiction switcher
- [ ] Income restructuring scenarios
- [ ] **Vehicle & mobility what-ifs:** own car + salary vs company car + entity-paid costs vs mileage reimbursement (kilometrikorvaukset-style) vs gross-up—using stored jurisdiction rules + user distances / enrollments
- [ ] **Benefit package toggles:** turn enrollments on/off and compare employer cost, net cash, and personal tax / social side-by-side
- [ ] **Owner-manager extraction:** side-by-side **dividends (distributions) vs payroll + self-granted benefit enrollments** (and mixes), with **retained earnings / distributable capacity** inputs where configs model them—numerical only, disclaimers for substance / anti-avoidance rules not encoded
- [ ] **Cross-jurisdiction compare:** same facts under two configured countries (e.g. FI vs EE) for “what moves if I move?”—numerical only, with strong non-advice disclaimers in UI
- [ ] Pure: never writes to real artifacts
- [ ] Side-by-side comparison UI

### Analytics

- [ ] Revenue / profit / personal income trends
- [ ] Tax burden trends
- [ ] Predictions (basic — moving averages, simple projections)
- [ ] Category spend analysis
- [ ] Money sink detection

### Currency handling

- [ ] FX rate sync (ECB or similar)
- [ ] Store amounts in original + entity-base currency
- [ ] Backfill historical FX where missing

---

## v0.9 — AI agent full

### Scripting sandbox

- [ ] Decide: Daytona vs vm2 vs containerized Python
- [ ] Implement `calc.runScript` properly
- [ ] Streaming status to chat UI

### Bulk data entry via agent

- [ ] `invoice-composer` agent: text → many invoice draft tool calls
- [ ] Bulk receipt upload with agent-driven categorization

### Proactive recommender

- [ ] Nightly cron job runs `proactive-recommender` agent
- [ ] Outputs surfaced as dashboard cards
- [ ] Suggest/accept/reject UI

### RAG expansion

- [ ] All collections from §6.10 ingested
- [ ] Hybrid search (Qdrant + SQL exact match) on dashboard top-bar
- [ ] Tax guides ingested (Vero, EMTA, PWC summaries)

### Agent UX polish

- [ ] Per-agent invocation surfaces (right place, right agent)
- [ ] Confirmation card design polish
- [ ] Agent suggestion review queue

---

## v1.0 — Polish & hardening

### Exports

- [ ] CSV / XLSX export for any list
- [ ] Receipt ZIP export by period
- [ ] PDF export for reports, declarations, invoices
- [ ] Full-backup export (DB dump + blobs + Qdrant snapshot)

### Reminders & calendar

- [ ] Email reminders for deadlines
- [ ] ICS calendar feed (subscribable)
- [ ] In-app notifications
- [ ] **Compliance tasks** (`compliance_task` from §5.4.2/§5.4.3) included in reminder + calendar streams where `due_at` / obligation hints apply (employment + tax/payment/reporting domains)
- [ ] Reminder dedupe keys for compliance events (avoid notification spam on evaluator reruns)

### Email-forwarding intake

- [ ] Set up dedicated forwarding address
- [ ] Inbound webhook → blob → receipt + expense draft

### Performance

- [ ] DB query review (N+1 hunt)
- [ ] List page virtualization for large datasets
- [ ] Cache strategy for derived artifacts

### Security review

- [ ] Auth flow audit
- [ ] CSP headers
- [ ] Rate limiting on auth endpoints
- [ ] Backup/restore tested end-to-end

### Docs complete

- [ ] All `docs/processes/*.md` written
- [ ] All `docs/usage/*.md` written
- [ ] Screenshots in README
- [ ] Self-hoster getting-started guide complete

---

## Post-v1.0 — Backlog

Lower priority, nice-to-haves, and aspirational items.

### Integrations

- [ ] SaaS receipt auto-sync (OpenAI billing, Anthropic billing, server providers)
- [ ] Stripe income sync
- [ ] Polar income sync
- [ ] Bank sync: Swedbank (low priority)
- [ ] Bank sync: Revolut (low priority)
- [ ] Additional jurisdictions (Spain, Portugal, Germany, etc.)

### Other

- [ ] Mobile-friendly receipt upload (PWA)
- [ ] Tesseract OCR fallback (only if requested by self-hosters)
- [ ] Multi-base-currency reporting consolidation
- [ ] Public API for third-party integrations

---

## Cross-cutting principles (apply throughout)

These are not milestones but ongoing requirements every PR should respect.

- All Things versioned. No exceptions.
- All times stored and displayed in UTC.
- All AI provider calls go through the abstraction layer.
- All async UI surfaces have loading skeletons + error boundaries.
- All list pages support mass actions.
- All filed/locked Things are protected from auto-refresh.
- Every new agent has a folder, a system prompt file, and a README.
- Every new integration extends the catalog and base interface.
- Docs updated in the same PR as the feature, not "later."
- Knip stays green — no dead code.
