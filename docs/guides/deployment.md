# Deployment guide

How to run Tally. Initial version — covers local development and the shape of a self-hosted production deploy. Managed-platform recipes (Fly, Render, Vercel, etc.) will land in `docs/guides/deploy-<platform>.md` as they're validated.

## What Tally needs

- **Node.js 20.11+** (matches `package.json` `engines`).
- **pnpm 10.33.0** (pinned via `packageManager` field).
- **Postgres 16**.
- **MinIO** (or any S3-compatible blob store) — for receipt / invoice attachments.
- **Qdrant** — for embeddings / RAG. Unused until v0.5; the container just has to exist in the dev stack.

The repo's [`docker-compose.yml`](../../docker-compose.yml) stands up the data plane locally and also doubles as a reference for the infra shape a self-hoster needs.

## Local development (the happy path)

```bash
# 1. Clone and install
git clone git@github.com:timborovkov/tally-books.git
cd tally-books
pnpm install

# 2. Copy the env template
cp .env.example .env
# (defaults work for local dev. BETTER_AUTH_SECRET is a placeholder —
#  fine locally, rejected at boot in production.)

# 3. Start the data plane
docker compose up -d
# Starts postgres + minio + qdrant. Health-checked — services wait until
# ready before `docker compose up -d` returns.

# 4. Migrate and seed
pnpm db:migrate          # applies src/db/migrations/
pnpm db:seed             # seeds the three jurisdiction configs

# 5. Run the app
pnpm dev                 # Next.js dev server on http://localhost:3000
```

First boot lands on `/setup` — the admin-creation wizard. After you set an admin email + password + 2FA secret, the wizard marks setup complete and `/setup` becomes inaccessible.

## Running the app in-compose

For a fully containerised dev run (app + data plane, no local Node):

```bash
docker compose --profile app up -d
```

The `app` service is gated behind the `app` profile so `docker compose up -d` without the flag gives you just the data plane (the common case for `pnpm dev` on the host). Inside the compose network the app talks to `postgres`, `minio`, and `qdrant` by service name, not localhost — the overrides are baked into the `app` service's `environment` block in [`docker-compose.yml`](../../docker-compose.yml).

## Env vars

The canonical reference is [`.env.example`](../../.env.example) — every var has an inline comment explaining what it does and whether it's required. Summary:

| Var                                                           | Purpose                                                             | Required?                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| `APP_PORT`                                                    | Port the app listens on.                                            | Default 3000.                           |
| `APP_URL`                                                     | Public URL. Used as BetterAuth trusted origin and invite-link base. | Required.                               |
| `BETTER_AUTH_SECRET`                                          | 32+ char random. Signs session cookies and 2FA challenges.          | Required. **Must override in prod.**    |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL`                        | Transactional email for invites.                                    | Required. Placeholder rejected in prod. |
| `DATABASE_URL`                                                | Postgres connection string.                                         | Required.                               |
| `MINIO_ENDPOINT` / `_USE_SSL` / `_ACCESS_KEY` / `_SECRET_KEY` | S3 / MinIO connection.                                              | Required once blob writes land (v0.2).  |
| `QDRANT_URL` / `QDRANT_API_KEY`                               | Vector store connection.                                            | Required once embeddings land (v0.5).   |
| `NEXT_PUBLIC_SENTRY_ENABLED` / `_DSN`                         | Error reporting. See [`sentry.md`](../architecture/sentry.md).      | Optional; `false` disables everything.  |
| `SENTRY_*` (build-time)                                       | Source-map upload. `SENTRY_AUTH_TOKEN` blank = skip upload.         | Optional.                               |

The env schema lives in [`src/lib/env.ts`](../../src/lib/env.ts) — anything missing or malformed rejects at boot with a readable error instead of crashing mid-request. Adding a new var is a Zod entry in that file plus an `.env.example` line.

## Production shape

Tally is a standard Next.js app. A production deploy wants:

- **App container** — this repo's [`Dockerfile`](../../Dockerfile) produces a multi-stage build: deps → build → runtime. Runtime is Next standalone, runs as non-root `nextjs:nodejs`, port 3000, health-checked at `/api/health`.
- **Postgres** — managed or self-hosted Postgres 16. The schema lives in `src/db/migrations/`. Run `pnpm db:migrate` on deploy.
- **Blob store** — S3 or hosted MinIO. `MINIO_USE_SSL=true` for hosted. v0.1 doesn't write blobs yet; v0.2 does.
- **Qdrant** — managed Qdrant Cloud or self-hosted. Unused in v0.1–v0.4.
- **Outbound email** — a Resend account with a verified sending domain.

No Redis. No BullMQ. Background jobs run via [pg-boss](https://github.com/timgit/pg-boss) on the same Postgres (ships in v0.2).

### Health endpoints

- `GET /api/health` — always returns 200 if the process is alive. Used by container orchestrators.
- `GET /api/ready` — returns 200 only if the app can round-trip a Postgres query. Use this as the readiness probe; the liveness probe stays on `/api/health`.

### Build-time secrets

The Sentry plugin uploads source maps at build time if `SENTRY_AUTH_TOKEN` is set. The Dockerfile consumes it via a BuildKit secret mount, so the token never lands in an image layer:

```bash
docker buildx build \
  --secret id=sentry_auth,env=SENTRY_AUTH_TOKEN \
  -t tally:local .
```

Leave the token blank to skip the upload step (self-hosters, local builds, forks). See [`sentry.md`](../architecture/sentry.md) for the full story.

## Database conventions

- **Migrations are append-only**. Never rewrite a landed migration; add a new one. Two migrations in `src/db/migrations/` are hand-edited (`0004_smooth_maria_hill.sql` adds the DEFERRABLE FK; `0005_period_lock_lookup_index.sql` adds a partial covering index). The intent is documented in a `--` comment at the edit site.
- **`pnpm db:push` is for local iteration only.** Production uses `pnpm db:migrate`.
- **Backups**: a standard Postgres `pg_dump` + the MinIO bucket contents cover the full state. A scripted full-backup export lands in v1.0.

## Updating

```bash
git pull
pnpm install          # if package.json / pnpm-lock.yaml changed
pnpm db:migrate       # idempotent — no-op when the journal is already up to date
pnpm dev              # or restart the app container
```

## Troubleshooting

- **Boot refuses with "BETTER_AUTH_SECRET must be set to a unique value in production"** — you're running with `NODE_ENV=production` but the dev placeholder is still in `.env`. Generate a real secret: `openssl rand -base64 48 | tr -d '\n'`.
- **Boot refuses with "RESEND_API_KEY must be set to a real key in production"** — same pattern; get a key from https://resend.com.
- **Postgres connection refused** — check `docker compose ps` for the `postgres` service; health check may still be ramping. `docker compose up -d` waits for healthy, but if you Ctrl-C mid-startup the container can be up-but-not-ready.
- **`pnpm dev` can't find env vars after editing `.env`** — Next.js caches env at dev-server start; restart the dev server.

## Where to read next

- [`docs/architecture/overview.md`](../architecture/overview.md) — how the app is structured.
- [`docs/architecture/sentry.md`](../architecture/sentry.md) — error reporting wiring.
- [`docs/data-model.md`](../data-model.md) — every table and column.
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — PR conventions, the env-var-addition pattern, testing.
