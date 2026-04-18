# Contributing to Tally

Thanks for your interest. Tally is a self-hosted, single-tenant accounting tool — see [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) for the full vision and [TODO.md](./TODO.md) for the roadmap.

## Prerequisites

- Node.js `>=20.11` (use `.nvmrc` → `nvm use`)
- pnpm `>=10` (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker + Docker Compose v2 (for the local Postgres / MinIO / Qdrant stack)

## First-time setup

```bash
pnpm install
cp .env.example .env       # fill in real secrets
docker compose up -d       # starts postgres, minio, qdrant
pnpm dev                   # http://localhost:3000
```

## Day-to-day scripts

| Command                 | What it does                               |
| ----------------------- | ------------------------------------------ |
| `pnpm dev`              | Next.js dev server (Turbopack)             |
| `pnpm build`            | Production build                           |
| `pnpm start`            | Run the production build locally           |
| `pnpm lint`             | ESLint (zero warnings allowed)             |
| `pnpm lint:fix`         | ESLint with `--fix`                        |
| `pnpm typecheck`        | `tsc --noEmit` against strict config       |
| `pnpm format`           | Prettier write                             |
| `pnpm format:check`     | Prettier check (used in CI and pre-push)   |
| `pnpm knip`             | Dead-code / unused dependency scan         |
| `pnpm test`             | Vitest unit tests (single run)             |
| `pnpm test:watch`       | Vitest watch mode                          |
| `pnpm test:integration` | Integration tests (placeholder until v0.2) |

CI runs `lint`, `typecheck`, `knip`, `test`, and `test:integration` in parallel on every push and PR.

## Git workflow

- Branch off `main`. Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`).
- A `pre-push` hook runs `lint-staged` on the diff you're pushing — it auto-fixes lint and formatting on staged files. If it can't auto-fix, the push is rejected.
- Open a PR against `main`. The PR template walks you through the checklist.
- Update `CHANGELOG.md` (`## [Unreleased]`) in the same PR. Update relevant `docs/*.md` in the same PR — never "later".

## Repo layout

```
src/
  app/                 # Next.js App Router pages, layouts, route handlers
  components/ui/       # shadcn/ui primitives
  lib/                 # Shared utilities, services, providers
  lib/__tests__/       # Co-located unit tests
.github/               # CI workflows + issue/PR templates
internal-docs/         # Personal notes, NOT committed (gitignored)
```

## `internal-docs/`

This folder is **gitignored** by design — it's where contributors keep personal notes that should not land in the repo (drafts, scratch markdown, sketches of one's actual financial setup as a reference). The folder doesn't exist in git; create it locally when you need it (`mkdir internal-docs`).

## Environment variables

All env access goes through [`src/lib/env.ts`](./src/lib/env.ts), which is a zod-validated schema parsed once at startup (via [`src/instrumentation.ts`](./src/instrumentation.ts)). Misconfigured deploys fail fast at boot, not on first request.

When you need a new env var:

1. Add it to the schema in `src/lib/env.ts` (with a `.default(...)` if it's optional in dev).
2. Add it to `.env.example` with a sensible placeholder and a one-line comment.
3. Read it via `import { env } from "@/lib/env"` — never `process.env.X` directly.

`.env.example` only contains keys that some code in `main` actually reads. We do not pre-emptively scaffold env keys for features that haven't been built yet.

## Code style notes

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` (lint-error). No `// @ts-ignore` without a comment explaining why.
- `cn(...)` for className composition (`src/lib/utils.ts`).
- All times stored and displayed in UTC. No local timezone leaks.
- All Things versioned (see PROJECT_BRIEF §4 + §7). No exceptions.
- AI provider calls go through the abstraction layer in `src/lib/ai/providers/`. Never import OpenAI SDK types into app code.
- Knip stays green — no dead code, no unused deps.

## Questions

Open a GitHub issue or start a discussion. Bugs use the bug-report template; features use the feature-request template.
