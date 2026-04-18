# Tally — Project Brief & Specification

> **Repository:** [github.com/timborovkov/tally-books](https://github.com/timborovkov/tally-books)
> **Default deployment:** `tally.timb.dev` (single-tenant, self-hosted)
> **License:** TBD (MIT or AGPL — see §12.2)

---

## 1. Introduction

**Tally** is a self-hosted, single-tenant accounting, bookkeeping, finance, and tax management application for solo entrepreneurs who run one or more legal entities across multiple jurisdictions. It is designed to replace spreadsheet-based bookkeeping with a system that understands multi-entity structures, cross-border tax obligations, personal and business finance side-by-side, versioning of all financial artifacts, and an integrated AI agent that can read, reason about, and help modify the user's financial state.

At micro scale, **expense capture and trip reporting** are often harder than they look: the same receipt may be ambiguously business or personal, a trip may touch multiple entities or jurisdictions, and “which company does this belong to?” collides with **parallel receipt workflows per legal entity** instead of one coherent inbox. Tally treats that attribution and evidence problem as first-class, not a bolt-on after single-entity bookkeeping.

The app is built primarily to serve the author's own needs — an Estonian OÜ and a Finnish toiminimi, with cross-invoicing between them — but **nothing in the code is hardcoded to that setup**. All jurisdiction-specific behavior (entity types, tax rates, declaration schedules, per diem and other travel-compensation rules, mileage and commute schemes, employer benefit and allowance catalogs, **jurisdiction obligation checklists** (employment, tax/payment, and reporting duties), payout mechanisms, filing portals) is configuration, loaded at setup and editable from the dashboard. Tally ships with prefilled configs for Estonia, Finland, and Delaware (US) to validate that the abstractions work outside the EU.

**Deployment model:** one instance = one admin = one person's books. Not SaaS. Self-hosted via Docker, typically at a private subdomain (e.g. `books.example.dev`). No search engine indexing. No multi-tenancy. The admin may invite scoped collaborators (accountant, lawyer, spouse) with per-resource read/write permissions.

**License:** Open source. Public GitHub repo, proper README, docs, CHANGELOG, TODO/roadmap, Issues-based bug tracking.

**Language:** English only. No i18n. All times and dates stored and displayed in UTC — this is explicit and visible.

---

## 2. Project Goals

### 2.1 Primary goals

1. **Replace a working spreadsheet setup** with something faster, safer, versioned, and queryable.
2. **Handle multi-entity, multi-jurisdiction bookkeeping** in a single unified view with per-entity drill-down.
3. **Automate the bureaucratic tail** — prefill VAT declarations, annual reports, personal tax filings, reminders, calendar invites.
4. **Version everything** — every declaration, report, invoice, budget, balance sheet is versioned like Git or Google Docs, with draft → filed → amended state transitions and full diff history.
5. **AI agent as a first-class surface** — not a chatbot bolted on, but an agent with tools that can read the full state, produce estimates, fill forms, proofread, and recommend.
6. **Keep the code generic.** Any entrepreneur in a supported jurisdiction should be able to deploy this and use it. The author's specific arrangements (e.g. the Tecci billing logic) are modeled as configurable constructs, not hardcoded.

### 2.2 Non-goals

- Not a SaaS. No billing, no tenant isolation, no marketing site.
- Not a replacement for a professional accountant where one is legally required — it's a tool that makes their job easier.
- Not a substitute for **employment lawyers, tax advisors, or compliance audits** — jurisdiction obligation checklists and `compliance_task` prompts are **guided memory aids from configuration**, not proof that every legal duty is satisfied.
- Not a real-time trading or banking platform.
- Not a CRM, project management tool, or time tracker (though it integrates with Clockify).

### 2.3 Success criteria

- All of the author's bookkeeping, invoicing, tax prep, and reporting flows move off spreadsheets into this app.
- A VAT declaration for Estonia can be generated, reviewed, and marked filed in under 5 minutes at month-end.
- Annual reports for both entities generate themselves with ≥90% of fields prefilled correctly.
- A second user (e.g. an accountant based in a different country with a different entity) can deploy the app and configure it for their use without touching the code.

---

## 3. Technical Stack

### 3.1 Core

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | |
| Framework | Next.js (App Router) | |
| Styling | Tailwind + shadcn/ui | |
| Data fetching | TanStack Query | |
| Database | PostgreSQL | |
| ORM | **Drizzle** | Lightweight, type-safe |
| Job queue | **pg-boss** | Postgres-backed, no Redis needed |
| Auth | BetterAuth | 2FA required, strong passwords, no SSO |
| Email | Resend | Transactional |
| LLM (chat) | OpenAI (default), swappable | See §3.3 |
| Vision | OpenAI | Receipt structured extraction |
| Embeddings | OpenAI | `text-embedding-3-*` |
| Vector store | **Qdrant** | Separate service in compose |
| Agent framework | **Vercel AI SDK + AI SDK UI** | Chat UI out of the box |
| File storage | MinIO | S3-compatible |
| Containerization | Docker / docker-compose | Dockerfile + dev compose required |
| Error monitoring | Sentry | |

### 3.2 Code quality & tooling

- Strict ESLint config
- Prettier
- Knip (dead code detection)
- Unit tests for everything (Vitest)
- Integration tests — business-flow-first (cover the critical end-to-end flows: create expense → appears in VAT declaration → file declaration → lock period)
- GitHub Actions CI: lint, typecheck, knip, unit, integration
- Commit hooks via Husky + lint-staged

### 3.3 AI abstraction

OpenAI is the default for chat, vision, and embeddings, but the code treats each as a **pluggable interface** so we can swap to Ollama (or a separate vision/embedding provider) later without rippling changes.

Provider boundary lives in `lib/ai/providers/`:

- `ChatProvider.chat(messages, tools?)` — agent
- `VisionProvider.extractStructured(blob, schema)` — receipt parsing, document extraction
- `EmbeddingProvider.embed(text | text[])` — RAG + semantic search

Concrete implementations: `OpenAIChatProvider`, `OpenAIVisionProvider`, `OpenAIEmbeddingProvider` for v1. Later: `OllamaChatProvider`, possibly a dedicated vision provider if OpenAI's accuracy stops being the best option.

**Hard rule:** do NOT use OpenAI SDK types as the app's internal types. Adapt at the provider boundary. The agent loop, tool registry, and storage layers all speak our internal types.

**Agent framework:** **Vercel AI SDK** (chosen). We use the AI SDK UI kit to get the chat surface (message list, streaming, tool call rendering) out of the box, and the core SDK for the server-side agent loop and tool calling.

**Vision (receipts):** OpenAI vision with a structured output schema (Zod → JSON schema). The vision provider returns parsed `{ merchant, date, total, currency, vat_amount, vat_rate, line_items?, raw_ocr_text }`. Confidence is recorded; low-confidence fields are highlighted for user review.

**Embeddings + vector store:** OpenAI embeddings stored in **Qdrant**. Qdrant runs as a separate service in `docker-compose.yml`. We pick Qdrant over `pgvector` because we expect to embed *a lot* of artifacts (see §6.10) and want a dedicated, fast vector engine with rich filtering.

### 3.4 Secrets

All third-party API keys (OpenAI, Resend, Finnish e-invoice service, Clockify, bank connections) live in `.env`, never in the UI or DB. UI shows *which* integrations are configured (based on env presence) but never exposes keys.

### 3.5 Integration catalog pattern

Integrations live in typed catalogs:

- `integrations/invoicing/catalog.ts`
- `integrations/banking/catalog.ts`
- `integrations/data-sources/catalog.ts` (Paperless-ngx, etc.)
- `integrations/time-tracking/catalog.ts` (Clockify)

Each catalog entry declares: `id`, `name`, `requiredEnv[]`, `capabilities[]`, and a factory returning an instance of the relevant interface (`InvoicingProvider`, `BankingProvider`, etc.). Adding a new integration = adding one file + its adapter class. Integrations of the same type share a base class and implement the same methods.

### 3.6 UI requirements

- Loading skeletons on every async surface
- Proper error boundaries with useful messages
- Sentry for client + server errors
- Mass actions on every list page (mass delete, mass upload, mass trigger AI parsing, etc.)
- No search engine indexing (`robots.txt` + meta tags)

---

## 4. Core Concepts & Terminology

Before diving into features, fix the vocabulary.

- **Entity** — a legal entity the user owns or operates (OÜ, toiminimi, Delaware LLC, etc.) OR the special pseudo-entity `"Personal"`.
- **Jurisdiction** — a country-level config bundle: entity types available, tax types, VAT rules, **per diem and other travel-compensation rules** (overnight allowances, **mileage / kilometre reimbursement tables**, commute-specific schemes where they differ), **employer benefit & allowance catalogs** (caps, taxability, social-charge treatment, carry-forward), **obligation templates** (employment + tax/payment + reporting) as structured checklist items with links to official guidance, filing schedules, portal links, guide links.
- **Thing** — shorthand for any versioned, lockable business object: invoice, expense, receipt, VAT declaration, annual report, balance sheet, budget, trip report, **compliance task** (jurisdiction-guided obligation item), etc. All Things share versioning, lock, and audit behavior.
- **Period** — a time window (month, quarter, financial year). Periods can be locked; locked periods reject mutations to their Things.
- **Derived artifact** — a Thing whose contents are computed from other Things (declarations, reports, statements). Versus **source artifact** (receipt, invoice, bank transaction) which is entered directly.
- **Auto-refresh** — the background process that rebuilds derived artifacts when source data changes. Subject to lock flags and the editor-safety rules in §7.

---

## 5. Feature Scope — Prioritized

Priorities: **P0** = must ship in v1. **P1** = v1.1 / shortly after. **P2** = nice to have. **P3** = aspirational.

### 5.1 Foundation (P0)

#### 5.1.1 Entity & jurisdiction management
- Create, edit, delete entities (type, jurisdiction, ownership, VAT registration status, business ID, address, financial year, required filings).
- Jurisdiction config ships prefilled for Estonia, Finland, Delaware.
- Everything in the app is associated with either an entity or `Personal`.
- Personal info block: legal address, tax residency status, contact info, verokortti/similar, citizenships, country ID numbers (henkilötunnus, isikukood, NIE, SSN, …).
- Entity paperwork: board members, CEO, shareholders, incorporation docs.

#### 5.1.2 Unified multi-entity views
- Most list pages (expenses, invoices, receipts, clients, documents) show **all entities** with an entity column and a filter.
- Entity-specific reports (tax declarations, annual reports, balance sheets) are naturally scoped.
- Global search finds anything across all entities.

#### 5.1.3 Authentication & IAM
- First boot: create admin. Setup wizard follows.
- Admin can invite users via email + scope (read/write × resource type).
- Scoped resources: invoices, expenses, payouts, taxes, filings, legal documents, estimates, budgets, reports, trips, **benefit enrollments / commute & mileage claims**, **compliance tasks** (jurisdiction-guided obligations: employment + tax/payment + reporting), AI agent, business/personal details.
- Outstanding invites + existing users removable by admin.
- 2FA mandatory, strong password policy, no SSO.
- No public signup. Invite-only.

#### 5.1.4 Versioning, locking, audit history
- Every Thing is versioned. Every change records: who, when, what changed (diff), why (optional note).
- Things expose a timeline UI (like Google Docs version history) with the ability to view any past version.
- Things have states: `draft`, `ready`, `filed/sent`, `amended`, `void`.
- Filed declarations/reports are immutable via direct edit — must be marked unfiled first, which triggers the amend flow.
- "Underlying data changed" flag appears on filed Things when source data they depend on has changed since filing. Opening them shows what changed.
- Periods can be locked (e.g. FY2024 complete) → rejects mutations to Things in that period.
- Individual Things can be locked from auto-refresh (admin toggle).
- Draft Things can be deleted. Filed Things cannot.

#### 5.1.5 Expenses & receipts
- Upload single or bulk receipts (PDF, image).
- Background AI vision extraction: merchant, date, total, VAT, category suggestion, currency.
- User reviews extracted data, assigns entity, category, confirms.
- Mass actions: bulk upload, bulk trigger re-extraction, bulk assign entity/category, bulk delete.
- Mark expenses paid by personal card as "reimbursable by entity" so the books handle it correctly.
- Assign receipts to card transactions when bank sync exists.
- Category taxonomy configurable per jurisdiction (real accounting categories).

#### 5.1.5.1 Unified intake inbox & routing queue (P1)
- A **single cross-entity intake inbox** is first-class: every new receipt/document/claim draft lands in one queue with status (`new`, `needs_review`, `routed`, `confirmed`, `rejected`).
- Queue supports high-friction routing decisions explicitly: **business vs personal**, **which entity**, and **which flow** (expense, trip evidence, mileage/commute claim, benefit evidence, compliance evidence).
- Triage fields are explicit and auditable: classifier confidence, routing reason, chosen entity/flow, who confirmed, when.
- Bulk triage is supported for real-world inbox floods (mass route, mass mark personal, mass attach to trip/claim, mass request missing evidence).
- Wrong-route recovery is first-class: move an item between entity/flow without losing audit trail; dependent drafts get `underlying_data_changed` and re-evaluation signals.

#### 5.1.6 Invoicing
- Create, draft, send invoices from any entity.
- Line-item composer.
- Invoice drafts are versioned Things.
- Send via Finnish e-invoice (P0 integration), PDF, or email.
- Mark paid → reflects in books.
- **Internal invoice shortcut:** toiminimi → OÜ (or any entity → any entity) properly books both sides.
- **Billing arrangements** — see §5.1.6.1.
- Reminders to send recurring invoices.
- Time-tracked invoice estimator (Clockify sync) — see §5.3.

##### 5.1.6.1 Billing arrangements (generic)

A **billing arrangement** is a named, dynamic construct that describes the deal between a billing entity and a counterparty (client). It is the generic replacement for any specific arrangement (e.g. the author's "Tecci" deal). It drives invoice draft generation, estimation, and dashboard reminders.

Each arrangement holds:

- `name`, `billing_entity_id`, `counterparty_client_id`
- Free-form **explainer markdown** — the human-readable description of the deal, its quirks, ramp-up dates, special terms, anything that isn't code-modeled
- **Attached documents** — references into the `document` store (the same legal-document store from §5.10): contracts, side letters, emails confirming terms
- **Model** — the structured calculation rule, picked from a discriminated union of supported types (extensible). Initial set:
  - `lump_sum` — fixed amount on a date (or set of dates)
  - `hourly` — rate × hours; hours from Clockify sync, manual entry, or estimate
  - `daily` — rate × days
  - `monthly` — fixed monthly amount
  - `percent_of_underlying` — e.g. sales commission: a configured % of an underlying figure (sent invoices, revenue from a specific client, etc.)
- **Schedule** — invoicing cadence (cron-like or named cadence: "monthly on the 1st", "end of quarter", "ad-hoc")
- **VAT treatment** — derived from entity + counterparty + jurisdiction rules, but overridable per arrangement
- **Tax & contribution notes** — free-form, plus optional structured hints the agent and estimator can use
- **Other terms** — payment terms (net 14, etc.), late fees, currency, FX handling
- **`is_estimate` flag** — when true, the modeled value is explicitly a rough proxy for a more complex underlying deal. Estimated arrangements are clearly labeled in the UI ("Estimate — see explainer") and do not pretend to be precise. Useful when the real deal is too messy to model structurally (the Tecci case: free-form explainer + a `~50 €/h hourly` model marked as estimate, with the contract attached as a document).
- **Versioned Thing** — terms change over time; budget-vs-reality and historical reports use the version that was active in that period.

The arrangement is consumed by:
- Invoice draft generator (creates drafts on schedule, prefilled per the model)
- Time-tracked invoice estimator (§5.3) for hourly/daily models
- Forecasting (revenue projections, budget reality checks)
- Agent (when asked to advise on income, restructure, or compose an invoice from text)

#### 5.1.7 Bookkeeping core
- By month and by financial year.
- Overall and per-entity views.
- Income statements, expense statements (with category breakdowns), cash flow, basic ledger.
- Historical financial years supported — enter past data retroactively (last year's annual report, prior personal tax returns).

#### 5.1.8 Tax declarations & reports
- Auto-generated drafts per jurisdiction rules:
  - Estonia VAT: monthly.
  - Estonia annual report: yearly per entity.
  - Finland personal income tax: yearly.
  - Finland VAT (if toiminimi registered): applicable cadence.
- Prefilled from underlying data.
- Dashboard shows upcoming filings with deadline and portal link.
- Links to filing portals (EMTA, vero.fi) and guide URLs.
- User reviews → clicks "Mark filed" → enters filing reference → Thing transitions to `filed`.
- "Underlying data changed" flag on filed declarations when something changes.

#### 5.1.9 Annual reports
- Per-entity, required-by-law reports.
- Balance sheet + income statement + notes.
- Auto-generated, reviewable, editable, versioned.

#### 5.1.10 Balance sheets
- Per-entity (real) + personal (informational).
- Tracks: investments/portfolio, loans made by entity (to self or third parties), retained earnings, cash positions, other assets/liabilities.
- Personal balance sheet: debts, assets, stakes in companies, personal investments, loans receivable, upcoming large expenses.

#### 5.1.11 Dashboard
- Critical notifications, upcoming deadlines, open TODOs (file X, send invoice Y, pay Z).
- Quick access to the most relevant Things.
- Period overview (current month/quarter/year): what's done, what's pending.
- Quick-add button (`+`) top right → modal with common add actions (expense/receipt, send invoice).

#### 5.1.12 Settings
- Entity management, personal info, integrations status, jurisdiction configs, AI agent context (the big free-form text field about the user's structure), category taxonomies, invite management.

### 5.2 AI Agent (P0 for a minimum subset, P1 for the full vision)

The agent is not optional. It's the second primary interaction surface after the dashboard.

- **Generic chat page** with access to the full system via tools.
- **Conversation history** — threads, searchable, re-openable.
- **Tools** (exposed to the agent):
  - Read: query any Thing, any list, any report, any metadata.
  - Write: create invoices, expenses, receipts, budgets, trips, **commute/mileage claims**, **benefit enrollments**, **resolve or snooze compliance tasks** (confirmed via UI for destructive changes).
  - Calculator / scripting: safe Python or JS sandbox for ad-hoc estimates. Daytona or similar for isolated execution as P2.
  - Web search: generic public search for tax info, guides, docs.
  - Browser/fetch: scrape specific pages for context.
  - RAG over uploaded docs: Vero / EMTA guides, PWC tax summaries, legislation, contracts.
- **Context:** a large free-form "business structure" markdown field in settings that's always in the system prompt. Plus per-request relevant data fetched via tools.
- **Agent uses, not just chats:**
  - Budgeting help — build good budgets from history.
  - Category & explainer suggestions on receipts.
  - Personal vs business / which-entity recommendations.
  - Pay-structure advice (salary vs dividends vs board comp, YEL optimization, Estonian social security)—including **owner-granted benefits vs dividend extraction** when the admin pays themselves through their own entity’s payroll and benefit catalogs.
  - **Benefits, commute & mileage:** compare options (e.g. company car vs kilometrikorvaukset vs net salary) using **jurisdiction rule packs** and the user’s enrollments, distances, and structure—surfacing trade-offs in cash, tax, and admin burden; still **not** a substitute for a tax advisor where sign-off is required.
  - Cost optimization — find money sinks, suggest deductions.
  - Proofreading of reports, declarations, balance sheets.
  - Tax prep sanity check — did you miss a deduction / income item?
  - **Employment obligation gaps** — summarize open `compliance_task` items, explain what jurisdiction config expects, never present as legal sign-off.
  - Proactive recommendations.
  - Summaries of financial state.
  - Bulk data entry: "here are last year's invoices as text, create them" → agent calls create-invoice tool repeatedly.
- **Suggest / accept / reject pattern** — for receipts, categories, budget lines, the agent suggests values the user accepts with one click or rejects.

### 5.3 Time tracking & Clockify (P1)

- Clockify sync: pull time entries.
- Invoice estimator: for billing arrangements that depend on hours, estimate the upcoming invoice.
- Past estimates vs. reality view.
- The Tecci arrangement (user's share = f(Tecci's sent invoices, Tecci's associated costs)) is one instance of a **configurable billing arrangement** — not hardcoded.

### 5.4 Payroll, payouts, contractors (P1)

- Calculate paychecks: "I want €1000 net — what do I pay and what taxes?"
- Plan split: salary vs dividends vs board member compensation.
- Guided payout flows per jurisdiction (e.g. "pay Finnish contractor via Ukko", "hire monthly employee in FI: get Tyel, verokortti, tax office payment").
- Contractor/employee registry: tax IDs, residency, contact, VAT liability, Tyel/similar, contract terms, hourly rates, salaries, one-off deals.
- Payslip generation.
- Expense reports for employees/contractors.
- Subcontractor vs employee modeling help via agent.

#### 5.4.1 Employer benefits, allowances & in-kind compensation (P1)

- **Jurisdiction-configurable catalogs** describe what exists in a given country’s “benefit culture”: e.g. meal, sports-and-culture, massage/wellness, commute subsidy, employer-paid healthcare / therapy / dental, phone and connectivity, home-office allowance, work equipment (phones, laptops, headsets), company or pool car vs private use, e-bike or other mobility schemes, and similar. **Names, caps, eligibility, taxability, and social-security treatment differ by jurisdiction**; configs store rate tables, annual limits, carry-forward rules, and **links to statute / official guidance / common practice notes** so the agent and UI can stay grounded.
- **Enrollments and elections** (who receives what, paid by which entity, effective dates) are versioned Things, not free-text only.
- **Owner as benefit recipient:** the controlling entrepreneur may grant **themselves** benefits through an entity they own (same `employer_benefit_enrollment` model as for any employee on that payroll—founder–employee, director salary + perks, etc.). The app does **not** try to automate corporate-law “substance” judgments; where relevant, jurisdictions may attach **warning flags or doc links** for the agent and user. It **does** support **numerical comparison** of that path against **taking comparable value as dividends** (or salary-only, or mixed) via §5.8 scenarios and pay-structure tools (§5.2)—net to the household, employer cost, retained earnings / distributable capacity **as modeled by configs**, not legal advice on what resolutions are permitted.
- Every enrolled benefit or recurring allowance **flows through accounting**: employer cost, employee taxable benefit valuation where applicable, capitalization vs expense, and **downstream artifacts**—payslips, income statements, VAT / payroll withholding where relevant, annual reports, personal tax packs, budgets, and **scenario models** (§5.8). No “decorative HR checkbox” that does not touch the ledger.
- **Comparative what-ifs** belong in the same product surface as payroll and travel (§5.8): e.g. *private car + salary vs company car with entity-paid running costs vs mileage reimbursement (e.g. Finnish kilometrikorvaukset-style) vs gross salary bump*; and **owner-manager extraction**: *more through enrolled benefits + payroll vs more through dividends* (holding “cost to entity” or pretax bundles comparable where the scenario UI allows)—including **how answers change if tax residency or employer jurisdiction moves** (Finland ↔ Estonia is an explicit design-time acceptance case).

#### 5.4.2 Jurisdiction-guided employment & employer obligations (P1)

- Each **Jurisdiction** ships (and allows editing of) a **declarative catalog of employer-side obligations** that commonly apply when someone is an **employee** under local rules—not a full labour-law simulator, but a **guided checklist** the product can evaluate: e.g. mandatory employee health coverage where required, **pension / social insurance registration** (Tyel in Finland and analogues elsewhere), **minimum wage / minimum pay** references, **working time, overtime, and record-keeping** expectations, occupational health or other mandated programs—each item keyed, human-readable, and linked to **statute or official guidance URLs** for the agent and the user.
- **The entrepreneur counts:** when the admin is formally on the payroll of an entity they control (CEO salary, employee-founder, director–employee, etc.), **the same obligation templates apply** as for any other employee on that payroll relationship. The app must not silently scope “HR compliance” to *other* hires only.
- **Evaluator → tasks:** on **new or changed employment records** (hire date, jurisdiction, employment type, entity), and when jurisdiction configs change, the system **diffs required checklist items vs evidence already stored** (policy IDs, enrollment records, registration flags, attached documents). Missing items become **`compliance_task`** rows (or equivalent first-class objects): visible on the **dashboard**, snoozable, completable with evidence, and **eligible for reminders and calendar fan-out** (§5.13, §9.4).
- **Disclaimers:** this layer is **configuration-driven guidance** to reduce “forgot to set up Tyel”-class mistakes; it is **not** a guarantee of legal compliance and **not** a substitute for counsel where statute requires it.

#### 5.4.3 Jurisdiction-guided tax, payment & reporting obligations (P1)

- The same obligation framework is **not employment-only**. Jurisdictions define additional templates for **tax/payment/reporting duties** by entity type and registration status: e.g. periodic tax remits, prepayments, contribution payments, recurring declarations, and required supporting reports where applicable.
- **Evaluator → tasks:** on period rollovers, filing/payment state changes, entity registration changes, and jurisdiction-config updates, the system checks required obligations against known state (created declarations, mark-filed refs, payment records, uploaded evidence, waivers) and creates or reopens `compliance_task` rows when something is missing or stale.
- **Task lifecycle & evidence:** tasks stay first-class with status (`open`, `done`, `waived`, `snoozed`), due hints, evidence links, and clear rationale text from config so the user can understand *why this exists* and what data point would satisfy it.
- **Payment satisfaction precision:** obligation templates define `satisfaction_mode` (e.g. `bank_match`, `filing_ref`, `doc_evidence`, or combinations). For payment duties specifically, closing logic must be deterministic and explainable: either (a) matched payment event(s) satisfy expected amount/date window tolerances, or (b) explicit manual evidence/override is attached with actor + reason. No hidden heuristics that silently close tasks.
- **Scope:** this is a guided “required-but-missing” memory system for operations. It complements declarations/reports generation and reminders; it does not claim statutory sufficiency in edge cases where professional sign-off is required.

### 5.5 Trips, per diem, mileage & commute compensation (P1)

#### Overnight trips & per diem

- Trip records: destination, dates, number of days per country, purpose, people met, events attended.
- **Per diem** (overnight / away-from-home allowances) per jurisdiction rules.
- Related expenses linked to trip.
- Trip reports: days per country, per diem payable, total spend, categories.
- Business-justification narrative field (the "I was in Vietnam for a month but I was working" case).

#### Mileage, commute & other travel compensation

- **Mileage and distance-based reimbursement** using jurisdiction **rate tables** (year, vehicle type, passenger supplements, electric vs ICE where differentiated)—the Finnish **kilometrikorvaukset** pattern is one concrete instance; other countries expose their own tables via the same abstraction.
- **Commute vs business travel** are modeled as **different compensation kinds** where rules diverge (e.g. habitual home ↔ workplace vs client site vs overnight assignment)—eligibility, caps, and taxation are **not** collapsed into a single “travel” bucket.
- **Evidence**: distance logs, route exports, odometer notes, or jurisdiction-accepted equivalents; link generated **expense lines** (and benefit interactions when a trip mixes personal and business use).
- **Agent + scenario support**: answer “which structure is cheaper / simpler this year?” using stored rules + user facts (see §5.2, §5.8), always with the same **not professional advice** posture as the rest of the app.

### 5.6 Meetings & business events (P1)

- Log meetings: who, when, where, purpose, related expenses.
- Justifies travel/meal/etc expenses.

### 5.7 Budgeting (P1)

- Business budgets: travel, per diem, **mileage & commute compensation**, **employer benefit costs** (cash + imputed), SaaS, servers, AI/agentic coding, hardware, misc, retained-earnings allocation, debt paydown, tax/pension reserves.
- Personal budget: rent, food, utilities, partying, clothes, gym, subs, savings.
- Budgets are versioned Things.
- **Budget vs reality comparison always uses the budget version that was active at the time** (critical: don't retcon).
- Income-based personal budget estimation month-by-month.

### 5.8 Tax scenario & residency modeling (P1)

- Personal tax estimates with toggleable residency (Estonia, Finland, others).
- What-if scenarios:
  - Residency change (Georgia, Portugal, Spain, etc.).
  - Company jurisdiction change (Cayman, Ireland, etc.).
  - Income restructuring (more salary vs more dividends).
  - Expense reclassification (personal → business or vice versa).
  - **Vehicle & mobility:** private car + out-of-pocket vs entity-paid running costs vs **mileage reimbursement** (kilometrikorvaukset-style and analogues) vs salary gross-up; **company car / e-bike / pooled benefit** packages vs cash.
  - **Benefit package mixes:** toggling enrollments (lunch, sports/culture, healthcare, phone, home office, equipment, etc.) and seeing effects on **net cash, employer cost, and personal tax / social** side-by-side.
  - **Dividends vs benefits (owner-manager):** for the **same controlling owner**, compare routing value as **dividends (or other distributions modeled in config)** vs **payroll + benefit enrollments** (and mixed slides), including **retained earnings / distributable reserves** hooks where jurisdiction configs expose them—**numerical** trade-offs from rule packs, not board resolutions or anti-avoidance legal conclusions.
  - **Cross-jurisdiction deltas:** same facts under Finland vs Estonia (or other configured pairs) to surface *what moves* when residency or employing entity moves—not legal advice, but **numerical comparison** from configured rules.
- Scenarios are saved, named, versioned Things. Scenario engines read **jurisdiction rule packs** + user structure; outputs feed comparison UI and **agent explanations** grounded in the same data.

### 5.9 Debt tracking (P1)

- Current tax debt, other debts.
- Payoff plans.

### 5.10 Legal document storage (P1)

- Contracts, filings, government mail, insurance.
- Metadata: entity, parties, dates, type, tags.
- Full-text search + agent RAG access.

### 5.11 Income sources beyond invoices (P1)

- Stripe billing, Polar, other payment processors.
- Client & income categorization.

### 5.12 Other personal income (P1)

- Exits, stock options, stock sales, investment gains, interest, asset sales, other salaries, other dividends.
- Feeds personal tax declarations.

### 5.13 Calendar & reminders (P1)

- Automatic reminders for deadlines (file VAT, pay invoice, send invoice).
- **Compliance tasks** from §5.4.2–§5.4.3 appear here too: e.g. “arrange employee health insurance”, “complete Tyel (or equivalent) registration”, or “missing periodic remit/reporting evidence for this entity type”—with optional due hints from jurisdiction config and **completion** when the user attaches evidence or links the required record.
- Calendar invites (ICS export or subscription feed).

### 5.14 Integrations

| Integration | Priority | Notes |
|---|---|---|
| Finnish e-invoice | **P0** | Highest integration priority |
| Paperless-ngx receipt sync | P1 | Medium priority |
| Clockify | P1 | |
| Email-forwarding receipt intake | P1 | Forward billing emails to a dedicated address |
| SaaS receipt auto-sync (OpenAI, Anthropic, servers, etc.) | P2 | |
| Stripe / Polar | P2 | |
| Bank sync (Swedbank, Revolut) | **P3** | Very low priority |

### 5.15 Analytics (P2)

- Revenue, taxes, personal income averages, trends, predictions.
- Revenue, profit, personal income breakdowns.

### 5.16 Exports (P1)

- Spreadsheets (CSV/XLSX), receipts (ZIP), reports (PDF), invoices (PDF).

### 5.17 Proactive generation & notifications (P1)

- App creates upcoming declarations/reports itself on schedule.
- Dashboard surfaces them with deadlines.
- Reminders to send recurring invoices.
- Status report: "what's pending, what's my situation, agent summary, expense breakdowns."

---

## 6. Technical Architecture

### 6.1 High-level shape

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js App                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐    │
│  │   UI (RSC    │   │  API Routes │   │  Server Actions │    │
│  │   + Client)  │   │  (REST-ish) │   │                 │    │
│  └──────┬───────┘   └──────┬──────┘   └────────┬────────┘    │
│         └──────────────────┼───────────────────┘             │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────┐     │
│  │             Domain Services Layer                   │     │
│  │  entities │ invoices │ expenses │ declarations │... │     │
│  └─────────────────────────┬───────────────────────────┘     │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────┐     │
│  │    Data Layer: Prisma/Drizzle → PostgreSQL          │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐        │
│  │  AI Providers│ │ Integrations│ │ Background Jobs  │        │
│  │  (OpenAI/…) │ │  (catalogs) │ │ (recalc, sync)   │        │
│  └─────────────┘ └─────────────┘ └──────────────────┘        │
└─────────────────────────────────────────────────────────────┘
         │                │                │
    ┌────▼─────┐    ┌─────▼────┐     ┌─────▼─────┐
    │PostgreSQL│    │  MinIO   │     │  Sentry   │
    └──────────┘    └──────────┘     └───────────┘
```

### 6.2 Domain services

Each domain (entities, invoices, expenses, receipts, declarations, reports, budgets, trips, travel_compensation, benefits, payroll, **compliance**, scenarios, documents, agent) is a module under `src/domains/<name>/` with:

- `schema.ts` — Zod schemas for inputs/outputs
- `service.ts` — pure business logic
- `queries.ts` — read-side DB access
- `mutations.ts` — write-side DB access with versioning
- `events.ts` — emits domain events (see §6.5)
- `index.ts` — public API of the module

UI and API routes never touch the DB directly — always via services.

### 6.3 Versioning engine

Every versioned Thing uses a uniform pattern (§8 shows the schema). Key rules:

- Mutations go through a `versioned<T>.update(id, patch, actor, reason?)` helper.
- The helper creates a new `thing_version` row with the full new state + diff + actor + reason + timestamp.
- The current version pointer on the Thing updates atomically.
- Reads by default return the current version; any version can be fetched by id.
- Diff computation is deterministic and stored (don't recompute on read).

### 6.4 State machine for filings

```
draft ──ready──► ready ──file──► filed
  ▲                │                │
  │                │                │
  │            discard           unfile
  │                │                │
  └────────────────┘                ▼
                                amending
                                    │
                                 refile
                                    ▼
                                  filed (new version)
```

Void path available from draft/ready. Filed Things track their "filing reference" (receipt ID from portal).

### 6.5 Event bus & auto-refresh

When source data changes, a domain event is emitted:
- `expense.created | updated | deleted`
- `receipt.created | …`
- `invoice.sent | paid | …`
- `bank_transaction.imported`
- `time_entry.synced`

A lightweight in-process event bus (or `pg_notify` for cross-worker) routes these to subscribers.

**Critical:** events do NOT directly mutate derived artifacts inline. They enqueue a job.

A background **recalculation worker** (BullMQ or a simple pg-based queue) processes jobs:
- Determine which derived Things depend on the changed source (via a dependency registry).
- For each dependent Thing:
  - If status is `filed`: do not auto-edit. Set `underlying_data_changed = true` with a payload describing what changed. Surface this in UI.
  - If `auto_refresh_locked = true`: do not edit. Set a "refresh available" flag.
  - If period is locked: do not edit.
  - If currently being edited (see §7): do not edit.
  - Otherwise: recompute and update (this creates a new version with actor = `system`).

### 6.6 Editor-safety: concurrent editing rules

This is the "editing a VAT declaration while background rerun happens" problem. Rules:

1. When a user navigates to a Thing's editor page, the client acquires a **soft edit lock** (a row in `edit_sessions` with TTL, heartbeat every 30s).
2. While an edit lock exists, the recalc worker **skips** that Thing. It queues a "refresh pending" marker instead.
3. On page load, before rendering the editor, the server performs a **controlled refresh from data** (same logic as auto-refresh would have run), shows a diff if anything changed since the Thing was last saved, and asks the user to accept or discard the changes.
4. The editor has a **"Refresh from data"** button that re-runs the controlled refresh on demand, showing a field-by-field diff of what would change and letting the user apply selectively.
5. When the user navigates away or closes the tab, the edit lock is released. If stale (no heartbeat for 2 min), it's garbage-collected.
6. Manual "Lock from auto-refresh" toggle on the Thing persists independently of edit sessions.

### 6.7 Dependency registry

A static map declares which derived artifacts depend on which source domains, scoped by entity/period:

```ts
// src/domains/_registry/dependencies.ts
export const derivationDeps = {
  vatDeclaration: {
    sources: ['expense', 'receipt', 'invoice'],
    scopeBy: ['entity', 'periodMonth'],
  },
  annualReport: {
    sources: ['expense', 'receipt', 'invoice', 'payroll', 'balanceSheetEntry'],
    scopeBy: ['entity', 'financialYear'],
  },
  // …
} as const;
```

Used by the recalc worker to find the right dependents when a source event arrives.

### 6.8 Background jobs

Beyond recalculation:
- Scheduled draft generation (create next VAT declaration on the 1st of each month).
- Deadline reminders.
- Receipt OCR (queued when a receipt is uploaded).
- Embedding ingestion when a new artifact is created or updated (see §6.10).
- Integration syncs (Paperless-ngx poll, Clockify sync, bank sync).
- Agent background tasks (e.g. nightly proactive recommendation generation).

Implemented with **`pg-boss`** — Postgres-backed, no Redis dependency, keeps `docker-compose.yml` small. Cron-scheduled and event-driven jobs both supported.

### 6.9 AI agent architecture

The system runs **multiple agents**, not one. Each agent has its own config: identity, system prompt, tool subset, RAG sources, model selection, and where it can be invoked from in the UI. They share the underlying provider abstraction, tool registry, and conversation storage.

Agents live in a structured folder so they're discoverable, reviewable, and editable:

```
src/lib/ai/agents/
├── _shared/
│   ├── tools/                    # tool definitions, typed
│   │   ├── read/                 # query-only tools
│   │   ├── write/                # mutation tools (require UI confirm)
│   │   ├── calc/                 # script sandbox, calculator
│   │   ├── web/                  # search, fetch
│   │   └── rag/                  # vector queries by collection
│   ├── prompts/                  # reusable prompt fragments
│   └── types.ts
├── general-chat/
│   ├── agent.ts                  # config: model, tools[], rag[], etc.
│   ├── system-prompt.md
│   └── README.md
├── receipt-categorizer/
│   ├── agent.ts
│   ├── system-prompt.md
│   └── README.md
├── budget-helper/
├── tax-advisor/
├── proofreader/
├── invoice-composer/             # bulk-import: text → invoice draft tool calls
├── proactive-recommender/        # background, runs nightly
└── README.md                     # index, conventions, how to add a new agent
```

Each agent's `agent.ts` exports a typed config:

```ts
export const receiptCategorizerAgent: AgentConfig = {
  id: 'receipt-categorizer',
  model: 'gpt-...',                  // resolved through ChatProvider
  systemPromptFile: './system-prompt.md',
  tools: ['read.listCategories', 'read.recentExpenses', 'write.suggestCategory'],
  ragCollections: [],                // none — fast path
  contextInjectors: ['businessStructureMd', 'jurisdictionsSummary'],
  invokedFrom: ['receipts.detail', 'receipts.bulk'],
  destructiveConfirmation: 'auto-suggest', // suggests, never commits
};
```

```
User message / trigger
     │
     ▼
┌──────────────────────────┐
│  Agent Orchestrator      │  ◄── conversation history (DB)
│  (Vercel AI SDK loop)    │  ◄── system prompt (per-agent)
│                          │  ◄── injected context (structure, jurisdictions)
│                          │  ◄── relevant RAG chunks (per-agent collections)
└─────┬────────────────────┘
      │ tool calls
      ▼
┌─────────────────────────────────────────────┐
│  Tool Registry (filtered by agent.tools[])  │
└─────┬───────────────────────────────────────┘
      │
      ▼ (permissioned via current user's IAM scope)
   Domain services
```

- Tools are typed (Zod schemas in, out). One tool = one file.
- Tool permissions are the **intersection** of `agent.tools[]` and the calling user's IAM scope.
- Destructive tools require UI-level confirmation — the agent proposes a change, the UI renders a confirmation card.
- Long-running tools (RAG, scripting) run server-side with streaming status.
- Conversations are agent-scoped; the general chat agent has its own thread list, the proactive recommender writes to a system thread surfaced on the dashboard.

**Documentation requirement:** every agent has a `README.md` in its folder describing what it does, when it's used, what tools it can call, what RAG it pulls from, and known limitations. `docs/architecture/ai-agents.md` is the index.

### 6.10 Embeddings, RAG & semantic search

OpenAI embeddings, **Qdrant** as the vector store. Qdrant runs as a `docker-compose` service alongside Postgres and MinIO.

**Two distinct uses of vectors:**

1. **Agent RAG** — retrieving relevant context for a specific agent's prompt.
2. **Dashboard semantic search** — finding "anything" the user is looking for, across heterogeneous artifact types.

**Collections in Qdrant:**

| Collection | Source | Used by |
|---|---|---|
| `documents` | uploaded legal docs, contracts, government mail, insurance | tax-advisor, general-chat, search |
| `tax_guides` | Vero/EMTA guides, PWC summaries, legislation | tax-advisor, general-chat |
| `expenses` | description + extracted receipt fields | search, budget-helper, proofreader |
| `invoices` | line items + descriptions + client | search, invoice-composer |
| `payouts` | salary/dividend/board comp records with notes | search, tax-advisor |
| `trips_meetings` | trip narratives, meeting notes | search, proofreader |
| `agreements_clients` | client + arrangement explainers + attached docs | search, invoice-composer, tax-advisor |
| `reports_declarations` | rendered text of past declarations and reports | search, proofreader |

Each point in Qdrant carries a payload with: `entity_id`, `kind`, `period`, `created_at`, `acl_scope`, plus type-specific fields used for filtering (e.g. `vat_period: '2026-03'`).

**Ingestion pipeline:**
- Domain events (`expense.created`, `invoice.sent`, `document.uploaded`, etc.) emit an `embedding.upsert` job to pg-boss.
- Worker fetches the artifact, builds a normalized text representation, embeds, upserts to the right collection with payload.
- Updates trigger re-upsert; deletes trigger removal.

**Search UX:**
- Top-bar global search runs a Qdrant query across collections (filtered by user scope), returns mixed results grouped by type.
- Hybrid: if the query parses as something structured (e.g. an invoice number, a date range, a client name), also run a SQL-side exact match and merge results.

**Per-agent RAG:**
- `agent.ragCollections` declares which collections an agent's orchestrator may pull from.
- At request time, the orchestrator embeds the user query (or a synthesized retrieval query), pulls top-k from each declared collection, and injects into the prompt with citations.

**ACL:** every Qdrant point's payload includes `acl_scope`. The query layer enforces filter on this from the calling user's permissions before retrieval.

### 6.11 File storage

- MinIO bucket per concern: `receipts/`, `invoices/`, `legal-docs/`, `exports/`.
- All uploads are streamed (no base64 in DB).
- Files referenced by `blob` rows with checksum + size + mime + bucket + key.

### 6.12 Testing strategy

- **Unit:** every service function, every pure calculation (tax, per diem, etc.).
- **Integration / business-flow:** end-to-end critical paths, e.g.
  1. Create entity → create expense → generate VAT declaration → verify totals → file → modify expense → verify `underlying_data_changed` flag.
  2. Create internal invoice toiminimi → OÜ → verify booking on both sides.
  3. Upload receipt → OCR → user confirms → appears in declaration.
  4. Generate annual report → lock period → attempt mutation → rejected.
  5. Intake queue routing: upload same-day receipts for multiple entities + personal → triage business/personal/entity/flow → verify audit trail and correct downstream draft creation.
  6. Employment obligation evaluator: create founder-as-employee relation without required evidence → `compliance_task` opens; attach evidence → task closes.
  7. Non-employment obligation evaluator: simulated due period with missing payment/reporting evidence → task opens; satisfy via configured `satisfaction_mode` path (`bank_match` or manual evidence) → task closes with rationale trail.
  8. Reminder fan-out: due `compliance_task` (employment and tax/payment domain) produces dashboard/in-app reminder and ICS event once, then suppresses on close/snooze.
- Test DB via ephemeral Postgres container (Testcontainers).
- AI provider mocked in tests — no live calls. Qdrant runs in CI as a service container.

### 6.13 Deployment & local dev

- **`Dockerfile`** for the app — multi-stage build (deps → build → runtime). Production image is the only artifact published.
- **`docker-compose.yml`** for local development, with services: `app` (dev mode, hot reload, source mounted), `postgres`, `minio`, `qdrant`.
- **`docker-compose.prod.yml`** as a reference production compose for self-hosters: same services minus dev mounts, plus volume persistence and healthchecks.
- First-boot flow: if no admin exists, redirect to `/setup`.
- Reverse proxy (Caddy or user's choice) for TLS — out of scope for the compose file, documented in `docs/guides/deployment.md`.
- `robots.txt` disallow all; `X-Robots-Tag: noindex` header on all routes.
- Health endpoint, readiness endpoint.

### 6.14 Repo layout (proposed)

```
/
├── apps/web/                       # Next.js app
│   ├── src/
│   │   ├── app/                    # App Router
│   │   ├── components/
│   │   ├── domains/                # Domain modules
│   │   ├── lib/
│   │   │   ├── ai/
│   │   │   │   ├── providers/        # OpenAI, Ollama, ...
│   │   │   │   └── agents/           # one folder per agent (see §6.9)
│   │   │   ├── auth/
│   │   │   ├── db/
│   │   │   ├── events/
│   │   │   ├── search/               # Qdrant client + collection definitions
│   │   │   └── storage/
│   │   ├── integrations/
│   │   └── jobs/
├── packages/
│   ├── jurisdictions/              # EE, FI, US-DE configs
│   └── shared/                     # Shared types, zod schemas
├── docs/                           # Public docs
├── internal-docs/                  # Gitignored: personal notes
├── Dockerfile
├── docker-compose.yml              # Local dev
├── docker-compose.prod.yml         # Reference production compose
├── CHANGELOG.md
├── TODO.md
├── README.md
└── .github/workflows/
```

### 6.15 Ignored

`.gitignore` includes: `.claude/`, `CLAUDE.md`, `internal-docs/`, `.env`, standard Node ignores.

---

## 7. Editor-Safety & Auto-Refresh Rules (detailed)

This deserves its own section because it's where subtle bugs destroy trust.

### 7.1 The problem

Derived artifacts (VAT declarations, annual reports, balance sheets) are computed from many source records. Sources change constantly. Users also edit derived artifacts by hand before filing. If auto-refresh and manual editing collide, filed declarations get corrupted.

### 7.2 The rules

1. **No auto-refresh ever modifies a filed Thing.** Filed Things are immutable until explicitly unfiled.
2. **No auto-refresh modifies a Thing in a locked period.**
3. **No auto-refresh modifies a Thing with `auto_refresh_locked = true`.**
4. **No auto-refresh modifies a Thing currently in an edit session.** Instead, it sets `refresh_pending = true`.
5. **On entering an editor:** the server performs a controlled refresh (applying pending refreshes), shows a diff vs. the last-saved user version, and asks how to proceed.
6. **"Refresh from data" button** in the editor runs the controlled refresh on demand, shows diffs, allows selective apply.
7. **On change to source data:** the event bus queues recalc jobs, which respect 1–4 above and update allowed targets in the background.
8. **For filed Things:** if a recalc would have changed the result, set `underlying_data_changed = true` with a payload describing the delta. UI surfaces this with a badge. User can enter the amend flow to unfile → recompute → refile.

### 7.3 UI affordances

- Badge system: `DRAFT`, `READY`, `FILED`, `UNDERLYING DATA CHANGED`, `AUTO-REFRESH LOCKED`, `IN PERIOD LOCK`.
- Timeline panel on every Thing: version history with actor (user or `system`), reason, diff.
- Edit session indicator: "You are editing. Auto-refresh paused for this document."

---

## 8. Data Model

High-level schema. Concrete column types are illustrative; the implementation uses Drizzle or Prisma with migrations.

### 8.1 Core

```
user
  id, email, name, role ('admin' | 'member'), 2fa_secret, created_at, ...

invite
  id, email, scope (jsonb), created_by, created_at, accepted_at, revoked_at

permission
  id, user_id, resource_type, resource_scope (jsonb), access ('read' | 'write')

session
  id, user_id, created_at, expires_at, ip, ua

edit_session
  id, user_id, thing_type, thing_id, started_at, last_heartbeat_at

audit_log
  id, actor_id, action, thing_type, thing_id, payload (jsonb), at
```

### 8.2 Entities & jurisdictions

```
jurisdiction
  id, code ('EE' | 'FI' | 'US-DE' | ...), name, config (jsonb)
  -- config contains: entity_types[], tax_types[], vat_rules, per_diem_rules,
  --    filing_schedules[], portal_links[], guide_links[], payout_options[],
  --    contributions[] (YEL, estonian social tax, ...),
  --    freeform_context_md

entity
  id, name, entity_type, jurisdiction_id, business_id, vat_registered, vat_number,
  address, financial_year_start_month, ownership (jsonb), metadata (jsonb),
  created_at, ...

entity_person_link                      -- board, CEO, shareholder
  id, entity_id, person_id, role, share_pct, from, to

person                                  -- includes the user & external people
  id, legal_name, tax_residency, ids (jsonb: {henkilotunnus, isikukood, NIE, ...}),
  addresses (jsonb), contact (jsonb)

financial_period
  id, entity_id, kind ('month' | 'quarter' | 'year' | 'custom'),
  start_at, end_at, locked (bool), locked_at, locked_by
```

### 8.3 Versioning primitives

Every versioned domain has two tables: `<thing>` (current pointer) and `<thing>_version` (snapshots).

```
-- Example for invoice:
invoice
  id, entity_id, current_version_id, status, auto_refresh_locked,
  refresh_pending, underlying_data_changed, underlying_data_changed_payload,
  filed_ref, created_at, ...

invoice_version
  id, invoice_id, version_num, state_snapshot (jsonb), diff (jsonb),
  actor_id, actor_kind ('user' | 'system'), reason, created_at
```

Same pattern for: `expense`, `receipt`, `vat_declaration`, `annual_report`, `income_tax_return`, `balance_sheet`, `budget`, `trip`, `trip_report`, `commute_mileage_claim`, `employer_benefit_enrollment`, `compliance_task`, `payroll_run`, `scenario`, `legal_document` metadata.

### 8.4 Source artifacts

```
expense
  id, entity_id ('personal' pseudo-id or real), category_id, vendor, date,
  amount, currency, vat_rate, vat_amount, paid_by ('entity' | 'personal_reimbursable'),
  linked_receipt_id, linked_transaction_id, trip_id, description,
  + versioning columns

receipt
  id, entity_id, blob_id, merchant, date, total, vat, currency,
  ocr_status, ocr_raw (jsonb), ocr_confidence, linked_expense_id,
  + versioning columns

invoice
  id, entity_id, client_id, issue_date, due_date, line_items (jsonb),
  total, currency, vat_total, state, delivery_method ('e-invoice' | 'pdf' | 'email'),
  sent_at, paid_at, filed_ref,
  + versioning columns

client / supplier / contractor / employee
  id, kind, name, legal_entity, contact (jsonb), tax_ids (jsonb),
  terms (jsonb), contracts (jsonb), created_at, ...

time_entry                              -- synced from Clockify
  id, source ('clockify' | 'manual'), external_id, user_person_id, client_id,
  project, description, started_at, ended_at, duration_minutes

bank_transaction                        -- eventually
  id, account_id, external_id, date, amount, currency, counterparty,
  description, linked_expense_id, linked_invoice_id
```

### 8.5 Derived artifacts

```
vat_declaration
  id, entity_id, period_id, computed_snapshot (jsonb), state, filed_ref,
  + versioning columns, + auto_refresh_locked, + refresh_pending,
  + underlying_data_changed

annual_report
  id, entity_id, financial_year, computed_snapshot (jsonb), state, filed_ref,
  + versioning columns

income_tax_return
  id, subject ('personal' or person_id), jurisdiction_id, year,
  computed_snapshot (jsonb), state, filed_ref,
  + versioning columns

balance_sheet
  id, entity_id ('personal' or real), as_of, snapshot (jsonb), state,
  + versioning columns

budget
  id, scope ('personal' | entity_id), period_id, lines (jsonb),
  state, + versioning columns

trip
  id, person_id, destinations (jsonb: [{country, from, to, days}]),
  purpose, narrative, linked_meeting_ids (jsonb), created_at, ...

trip_report
  id, trip_id, per_diem_total, expense_total, breakdown (jsonb),
  state, + versioning columns

commute_mileage_claim                    -- km tables, fixed commute allowances, etc.
  id, entity_id, person_id, claim_kind ('business_mileage' | 'commute' | ...),
  period, jurisdiction_rule_ref, evidence (jsonb), rates_snapshot (jsonb),
  computed_totals (jsonb), linked_expense_ids (jsonb),
  + versioning columns

employer_benefit_enrollment
  id, entity_id, person_id, benefit_type_id, effective_from, effective_to,
  parameters (jsonb), valuation_snapshot (jsonb),
  linked_payroll_line_ids (jsonb), linked_expense_ids (jsonb),
  + versioning columns

compliance_task                          -- jurisdiction-guided obligation item
  id, entity_id, jurisdiction_id,
  obligation_domain ('employment' | 'tax_payment' | 'reporting' | ...),
  subject_type ('entity' | 'employment_relation' | 'person' | 'filing' | ...),
  subject_id nullable, employment_relation_id nullable, person_id nullable,
  obligation_key, status ('open'|'done'|'waived'|'snoozed'),
  due_at nullable, snooze_until nullable, resolution_note, evidence (jsonb),
  + versioning columns (or audit trail equivalent)

meeting
  id, entity_id, counterparty (jsonb), when, where, purpose, expense_ids (jsonb)

payroll_run
  id, entity_id, person_id, period_id, gross, taxes (jsonb), net,
  payout_kind ('salary' | 'dividend' | 'board' | 'yksittaisotto' | ...),
  state, filed_ref, + versioning columns

scenario
  id, name, base ('current' | scenario_id), changes (jsonb),
  computed (jsonb), + versioning columns
```

### 8.6 Taxonomies & configs

```
category
  id, scope ('personal' | entity_id | 'global'), name, parent_id, kind
  ('income' | 'expense' | 'asset' | 'liability' | 'equity'), code (optional
  accounting code), metadata (jsonb)

billing_arrangement
  id, name, billing_entity_id, counterparty_client_id,
  explainer_md,                          -- free-form deal description
  model (jsonb),                         -- discriminated union, see below
  schedule (jsonb),                      -- cadence
  vat_treatment (jsonb), tax_notes_md, terms (jsonb),
  is_estimate (bool),                    -- structural model is a proxy, not exact
  active_from, active_to,
  + versioning columns

billing_arrangement_document             -- many-to-many to documents
  id, arrangement_id, document_id, role ('contract' | 'addendum' | 'email' | ...)

-- model jsonb examples:
--   { kind: 'lump_sum', amount, currency, dates: [...] }
--   { kind: 'hourly',   rate, currency, hours_source: 'clockify' | 'manual' | 'estimate' }
--   { kind: 'daily',    rate, currency, days_source: ... }
--   { kind: 'monthly',  amount, currency }
--   { kind: 'percent_of_underlying', pct, underlying: { kind, ref } }

integration_config                      -- reflects what's enabled, NOT secrets
  id, catalog_id, enabled, params (jsonb, non-secret only), last_sync_at
```

### 8.7 AI, agents & RAG

```
agent_thread
  id, agent_id, user_id, title, kind ('user' | 'system'),
  created_at, updated_at

agent_message
  id, thread_id, role ('user' | 'assistant' | 'tool' | 'system'),
  content (jsonb: text | tool_call | tool_result),
  tokens_in, tokens_out, model, agent_id, created_at

agent_action                            -- executed tool calls with audit trail
  id, thread_id, agent_id, tool, input (jsonb), output (jsonb),
  status, confirmed_by_user (bool), at

agent_suggestion                        -- non-conversational agent output
  id, agent_id, target_thing_type, target_thing_id, payload (jsonb),
  status ('pending' | 'accepted' | 'rejected' | 'superseded'),
  created_at, decided_at, decided_by

document
  id, kind ('contract' | 'guide' | 'filing' | 'insurance' | ...),
  entity_id (nullable), blob_id, title, parties (jsonb), dates (jsonb),
  tags (jsonb), created_at

embedding_index                         -- bookkeeping for what's in Qdrant
  id, collection, source_kind, source_id, qdrant_point_id,
  text_hash, embedded_at, model
```

Vectors themselves live in **Qdrant**, not in Postgres. The `embedding_index` table is the source of truth for "what we've embedded and where," used to detect drift and re-embed on update.

### 8.8 Blobs

```
blob
  id, bucket, key, mime, size_bytes, checksum, uploaded_by, uploaded_at
```

---

## 9. How Everything Is Linked

This section maps cause → effect across domains. The system does NOT run this graph on every single write; the recalc worker (§6.5) batches and debounces work based on the dependency registry.

### 9.1 Source → derivative dependency graph

```
receipt ──► expense ──┬──► vat_declaration (monthly, entity)
                      │
                      ├──► income_statement
                      │
                      ├──► annual_report
                      │
                      ├──► balance_sheet  (if capital/asset)
                      │
                      ├──► budget vs reality
                      │
                      ├──► trip_report  (if linked to trip)
                      │
                      └──► scenarios, personal_tax_return,
                           analytics, personal_budget estimates

invoice (sent) ──┬──► vat_declaration
                 ├──► income_statement
                 ├──► annual_report
                 ├──► cash forecast
                 └──► budget vs reality

invoice (paid) ──► bank reconciliation, cash position

payroll_run ──┬──► expense (on entity side)
              ├──► personal_income
              ├──► vat_declaration (typically not, but withholding filings yes)
              ├──► income_tax_return (personal)
              ├──► annual_report
              └──► YEL/social-security projections

bank_transaction ──► reconciliation (matches expense/invoice/payroll)

time_entry ──► invoice estimator for arrangement-based billing

trip ──► per_diem calc ──► expense(s) ──► (chains as above)

commute_mileage_claim ──► expense(s) ──► (chains as above)

employer_benefit_enrollment ──┬──► payroll_run (taxable benefit / contribution lines)
                              ├──► expense or accrual rows (per jurisdiction rules)
                              ├──► annual_report, income_tax_return (where imputed)
                              └──► scenarios, budget vs reality

employee / employment_relation + jurisdiction obligation catalog
      ──► compliance_task (open until evidence or waiver)
      ──► reminders, calendar (§5.13), dashboard, agent summaries

entity + jurisdiction tax/payment/reporting obligation catalog
      ──► compliance_task (open until declaration/payment/evidence state matches rules)
      ──► reminders, calendar (§5.13), dashboard, agent summaries

compliance_task.done ──► clears fan-out for that item; evidence may link blob or enrollment

meeting ──► provides justification context on linked expenses

personal_balance_sheet_entry ──► personal_balance_sheet ──► personal_tax_return
                                                           (for wealth-tax jurisdictions)

scenario.changes ──► isolated re-run of the relevant calculations using a
                     hypothetical base; does NOT touch real artifacts
```

### 9.2 Key invariants

- Adding an expense **never directly modifies a filed declaration.** It only sets `underlying_data_changed`.
- Adding an expense while a declaration is being edited **never modifies that declaration** until the editor explicitly refreshes.
- Adding an expense to a locked period **is rejected** at the service layer, with an actionable error.
- Budget-vs-reality comparisons for a given month use the **budget version that was current during that month**, not today's version.
- Scenario runs are **pure**: they read real data as a base and compute what-ifs without writing to real artifacts.
- Obligation evaluators are **idempotent**: reruns do not duplicate equivalent active `compliance_task` rows for the same obligation subject.
- A payment/reporting obligation cannot close without a satisfier path that matches config (`bank_match`, `filing_ref`, `doc_evidence`, or explicit manual override with actor + reason).

### 9.3 Agent-triggered changes

The AI agent is a peer to the user, not a privileged channel. Its writes go through the same services, emit the same events, create the same versions with `actor_kind = 'user'` and a note indicating the agent executed on behalf of the user. Destructive changes require UI confirmation before the tool call actually commits.

### 9.4 Notifications & reminders fan-out

- Scheduled draft generation runs on cron → creates draft Things → emits `deadline_upcoming` → notification + calendar invite.
- State transitions emit notifications (e.g. `invoice.sent`, `declaration.filed`).
- Due `compliance_task` rows (employment + tax/payment + reporting domains) emit reminder events with dedupe keys so repeated evaluator runs do not spam.
- Proactive agent run (nightly) surfaces recommendations as dashboard cards.

### 9.5 Cross-entity flows

The toiminimi → OÜ invoicing case is a generic "internal invoice between owned entities":
- Invoice on sender side = income.
- Mirror expense on receiver side = expense.
- Both versioned, linked via `mirror_of` field.
- Editing one prompts to review the other.
- VAT treatment follows the jurisdictions' rules for cross-border intra-ownership invoicing (Finnish toiminimi → Estonian OÜ is a real case the EE/FI jurisdiction configs must handle correctly).

---

## 10. Documentation Plan

Kept in `docs/` and updated as we build.

- `docs/architecture/overview.md`
- `docs/architecture/versioning.md`
- `docs/architecture/auto-refresh.md` (the editor-safety rules)
- `docs/architecture/ai-agents.md` (index of agents, conventions, how to add one)
- `docs/architecture/embeddings-and-search.md` (Qdrant collections, ingestion, ACL, hybrid search)
- `docs/architecture/billing-arrangements.md` (the model union, examples, the estimate flag)
- `docs/data-model.md`
- `docs/integrations/overview.md`
- `docs/integrations/finnish-e-invoice.md`
- `docs/integrations/paperless-ngx.md`
- `docs/integrations/clockify.md`
- `docs/jurisdictions/estonia.md`
- `docs/jurisdictions/finland.md`
- `docs/jurisdictions/us-delaware.md`
- `docs/processes/add-expense.md`
- `docs/processes/generate-vat-declaration.md`
- `docs/processes/file-annual-report.md`
- `docs/processes/pay-yourself.md`
- `docs/processes/plan-trip-and-per-diem.md`
- `docs/processes/mileage-commute-and-kilometrikorvaukset.md` (pattern: jurisdiction rate tables → claims → expenses)
- `docs/processes/employer-benefits-and-allowances.md` (enrollment → ledger → tax packs)
- `docs/processes/jurisdiction-employment-obligations.md` (catalog schema, evaluator, compliance_task lifecycle)
- `docs/processes/jurisdiction-tax-payment-reporting-obligations.md` (catalog schema, evaluator, compliance_task lifecycle for non-employment duties)
- `docs/guides/deployment.md`
- `docs/guides/cron-and-jobs.md`
- `docs/guides/backup-and-restore.md`
- `docs/usage/*.md` (per feature)
- `README.md`, `CHANGELOG.md`, `TODO.md`, `CONTRIBUTING.md`, `LICENSE`

`internal-docs/` (gitignored) for personal notes, the author's actual financial situation, personal TODOs.

---

## 11. Roadmap (high level)

**v0.1 — Foundation**
- Repo, CI, Docker, auth, setup wizard, entities, jurisdictions (EE, FI, US-DE configs), versioning engine, UTC date handling, Sentry.

**v0.2 — Source data**
- Expenses, receipts (with OCR), invoices (drafts + PDF), clients, categories, **single cross-entity intake inbox + routing queue**, basic bookkeeping views.

**v0.3 — Derivations**
- VAT declarations, income statements, balance sheets, versioning timeline, period locks, editor-safety rules.

**v0.4 — Integrations wave 1**
- Finnish e-invoicing, Paperless-ngx receipt sync, Clockify.

**v0.5 — AI agent core**
- Chat surface, tool registry (read + safe writes), conversation history, structure-context field, basic RAG.

**v0.6 — Payroll, trips, budgets**
- Payout planning, payroll runs, trips (per diem + **mileage / commute claims**), **employer benefits & allowance enrollments** wired into expenses/payroll, **jurisdiction employment-obligation catalogs + `compliance_task` surfacing** (including founder-as-employee), budgets with historical comparison.

**v0.7 — Annual reports & personal tax**
- Annual report generation, personal income tax prep, debt tracking, and **jurisdiction-guided tax/payment/reporting obligation catalogs + task surfacing** for non-employment duties.

**v0.8 — Scenarios & analytics**
- Residency/jurisdiction what-ifs, **vehicle / mileage / benefit-package comparisons**, revenue/profit/tax trends, predictions.

**v0.9 — AI agent full**
- Scripting sandbox, bulk data entry via agent, proactive recommendations, proofreading, suggest/accept patterns everywhere.

**v1.0 — Polish & hardening**
- Exports, email-forwarding intake, performance, security review, docs complete.

**Post-v1.0**
- SaaS receipt auto-sync, Stripe/Polar, bank sync (low priority), additional jurisdictions.

---

## 12. Resolved Decisions & Open Questions

### 12.1 Resolved (no further discussion needed unless reasons change)

- **ORM:** Drizzle.
- **Job queue:** pg-boss (Postgres-backed, no Redis).
- **Agent framework:** Vercel AI SDK + AI SDK UI kit (chat surface out of the box).
- **Vector store:** Qdrant, separate service in docker-compose.
- **Embeddings provider:** OpenAI (`text-embedding-3-*`).
- **Vision provider:** OpenAI (structured-output schema for receipts).
- **Chat provider default:** OpenAI; abstraction allows Ollama later.
- **Local dev:** `Dockerfile` + `docker-compose.yml`. Reference `docker-compose.prod.yml` for self-hosters.

### 12.2 Still open — to decide during build

1. **Diff format for versioning.** JSON Patch (RFC 6902) is standard but loses semantic context; a custom structured diff is richer but more code to write and maintain. Lean: JSON Patch + an optional `semantic_summary` field per version that the agent or service can populate.
2. **Currency handling.** Confirmed direction: base currency per entity, FX rates pulled from a public source daily, every monetary amount stored in both original and entity-base currency. Open: which FX source (ECB is free and reliable for EUR base; for non-EUR bases we'll need an alternative), and how aggressively to backfill historical FX.
3. **Annual report legal compliance.** The app generates drafts; the user (or their accountant) is responsible for sign-off. Open: how loud the UI needs to be about this — a one-time disclaimer at setup, or a banner on every generated report? Lean: banner on every generated annual report and tax declaration, dismissible per-document.
4. **OpenAI model selection per agent.** Different agents have different cost/quality needs (proofreader can be cheaper than tax-advisor). Settle on a per-agent default in `agent.ts` with a global override env for cost-sensitive deployments.
5. **Scripting sandbox for the agent.** Daytona is mentioned as one option; alternatives are local `vm2`-style isolation or a containerized Python runner. Decide at v0.9 (full agent milestone). Until then, `calc.runScript` is gated to a small expression evaluator.
6. **Receipt OCR fallback.** OpenAI vision is the primary path. Open: do we want a local Tesseract fallback for offline use or for cost-cutting? Probably no for v1; revisit if a self-hoster requests it.
