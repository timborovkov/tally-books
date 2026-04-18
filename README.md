# Tally

**Self-hosted accounting, bookkeeping, and tax management for solo entrepreneurs running multiple legal entities across jurisdictions.**

Multi-entity. Versioned. AI-assisted. Single-tenant by design.

[Project brief](./PROJECT_BRIEF.md) · [Roadmap](./TODO.md) · [Issues](https://github.com/timborovkov/tally-books/issues)

---

> ⚠️ **Status: pre-alpha, under active development.** Tally is being built in the open. The core architecture is settled (see [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)) and milestones are tracked in [`TODO.md`](./TODO.md). It is not yet usable. Star the repo to follow along.

## What is Tally?

Tally is the bookkeeping app the author wanted instead of spreadsheets. It handles personal finances and one or more legal entities (Estonian OÜ, Finnish toiminimi, US LLC, …) in a single unified view, generates tax declarations and annual reports automatically, versions everything like Google Docs, and ships with a built-in AI agent that can read, reason about, and help update your financial state.

It is **single-tenant**: one deployment = one person's books. Not SaaS. Self-hosted via Docker, typically at a private subdomain.

It is **jurisdiction-agnostic**: nothing is hardcoded to a specific country's rules. Tally ships with prefilled configs for Estonia, Finland, and Delaware (US) to validate the abstractions, and adding new jurisdictions is configuration, not code.

## Why does this exist?

Existing accounting software falls into two camps:

1. **SaaS for small businesses** (Xero, QuickBooks, FreeAgent, etc.) — designed for one entity, one country, opinionated workflows. Multi-entity support is bolted on or absent. They can't model someone with an OÜ in Estonia, a toiminimi in Finland, cross-invoicing between them, and personal finances on top.
2. **ERP suites** (Tally Solutions, NetSuite, Odoo) — built for medium-sized companies with accountants on staff. Massive overkill for a solo entrepreneur, and still not great at multi-jurisdiction personal-and-business setups.

Tally fits between these. It's for the entrepreneur who:

- Operates more than one legal entity, possibly across countries
- Does their own bookkeeping (currently in spreadsheets)
- Wants personal finances in the same system as their businesses
- Wants the AI agent to do the boring parts (categorization, prefill, proofreading, summaries)
- Doesn't want their financial data on someone else's servers

## Highlights

- **Multi-entity, multi-jurisdiction.** One unified view with per-entity drill-down. Personal finances are first-class, not an afterthought.
- **Versioning of everything.** Every invoice, expense, declaration, report, budget, balance sheet has full history with diffs and actor attribution. Like Git or Google Docs, for your books.
- **Auto-generated declarations and reports.** Monthly VAT, annual reports, personal income tax filings — Tally generates the drafts from your underlying data, you review and file. "Underlying data changed" flags appear when source data shifts after filing.
- **Period locks and edit safety.** Lock a financial year once it's filed. Editor sessions block background recalculation so your in-progress edits never get overwritten by an auto-refresh.
- **Built-in AI agent.** Multiple agents with scoped tool sets: chat assistant, receipt categorizer, budget helper, tax advisor, proofreader, proactive recommender. Provider-abstracted (OpenAI today, Ollama possible later).
- **Receipt OCR.** Bulk upload receipts; vision extraction pulls merchant, date, total, VAT.
- **Integrations as plugins.** Catalog-based; add a new invoicing or data-source provider by extending a base interface. Finnish e-invoicing, Paperless-ngx, Clockify on the v1 path.
- **Trip & per-diem tracking.** Multi-country trips with structured per-diem calculations and business-justification narratives.
- **Tax scenarios.** Compare residencies, jurisdictions, income structures side-by-side without touching real data.
- **English-only, UTC-everywhere.** No i18n. Times stored and displayed in UTC, explicitly.
- **No search engine indexing.** Self-hosted, private by design.

## Stack

TypeScript, Next.js (App Router), Tailwind, shadcn/ui, TanStack Query, Drizzle, PostgreSQL, BetterAuth, Resend, OpenAI (chat + vision + embeddings), Vercel AI SDK, Qdrant, MinIO, pg-boss, Sentry, Docker.

See [`PROJECT_BRIEF.md` §3](./PROJECT_BRIEF.md#3-technical-stack) for details on each choice.

## Getting started

> Local dev setup will be documented here once the foundation milestone (v0.1) is complete. Watch [`TODO.md`](./TODO.md) for progress.

Roughly:

```bash
git clone https://github.com/timborovkov/tally-books.git
cd tally-books
cp .env.example .env
# Fill in OPENAI_API_KEY, RESEND_API_KEY, etc.
docker compose up
# Open http://localhost:3000 → setup wizard
```

## Documentation

- [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md) — full specification: goals, stack, features, architecture, data model, dependency graph
- [`TODO.md`](./TODO.md) — milestone-based roadmap with checkboxes
- [`docs/`](./docs/) — architecture docs, integration guides, jurisdiction notes, usage docs (in progress)
- [`CHANGELOG.md`](./CHANGELOG.md) — version history once we start cutting releases

## Contributing

Tally is open source and built primarily for the author's own use, but contributions are welcome — especially:

- New jurisdiction configs (Spain, Portugal, Germany, Estonia/Finland refinements)
- New integration adapters (e-invoicing providers, time trackers, banks)
- Bug reports and reproductions
- Documentation improvements

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow once it's written. For now: open an issue first to discuss.

## Self-hosting

Tally is built to be self-hosted, single-tenant. Anyone running businesses in supported jurisdictions can deploy it for their own use. There will not be a hosted version.

If you deploy Tally for yourself, your data stays on your infrastructure. The only outbound calls are to the third-party services you explicitly configure (OpenAI for AI features, Resend for email, your invoicing provider, etc.).

## License

License TBD — see [`PROJECT_BRIEF.md` §12.2](./PROJECT_BRIEF.md#122-still-open--to-decide-during-build). Leaning toward AGPL to prevent SaaS resale of a self-hosted-only project; MIT remains an option.

## Acknowledgments

Built with [Claude](https://claude.ai) as a thinking partner during specification. The architecture, decisions, and code are the author's; Claude helped with structure and pressure-testing the design.

---

Built by [@timborovkov](https://github.com/timborovkov) · An open-source project
