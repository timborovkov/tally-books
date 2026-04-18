# Sentry (error reporting)

Tally integrates Sentry via `@sentry/nextjs` for browser + Node server + edge runtimes. Error reports flow to the Tally project in the `irmin-dw` Sentry org (de-region). The integration is **off by default** and enabled per-deployment via env vars.

## How it's wired

| File                                  | Runtime | Role                                                                |
| ------------------------------------- | ------- | ------------------------------------------------------------------- |
| `src/instrumentation-client.ts`       | browser | Client init + router transition instrumentation + session replay    |
| `src/sentry.server.config.ts`         | node    | Server init                                                         |
| `src/sentry.edge.config.ts`           | edge    | Edge runtime init                                                   |
| `src/instrumentation.ts`              | both    | Loads the right config per `NEXT_RUNTIME`; exports `onRequestError` |
| `src/app/global-error.tsx`            | browser | Last-resort boundary; captures unhandled root-layout errors         |
| `src/app/error.tsx`                   | browser | Route-level boundary; captures + shows retry UI                     |
| `next.config.ts` (`withSentryConfig`) | build   | Tunnel route, source-map upload (prod), silent in local             |

## Enabling Sentry

Set both DSNs in the deploy environment:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@o0.ingest.de.sentry.io/0000000
SENTRY_DSN=https://xxxxx@o0.ingest.de.sentry.io/0000000
```

For source-map upload at build time also set:

```bash
SENTRY_ORG=irmin-dw
SENTRY_PROJECT=tally-books
SENTRY_AUTH_TOKEN=<internal token, never committed>
```

All five keys are **optional**. Empty or unset = disabled. See `src/lib/env.ts` for the schema.

## Disabling Sentry locally

Local dev should not emit events — you'd be spamming the production issue tracker with `pnpm dev` crashes. Both `.env.example` and the repo's `.env` ship with these keys blank.

Runtime guard: each `Sentry.init(...)` call sets `enabled: dsn !== ""`. With empty DSN the SDK initialises but the transport is a no-op — no network traffic leaves the process. This is verified by `src/__tests__/sentry-disabled.test.ts`.

## Tunnel route

`withSentryConfig` is set to `tunnelRoute: "/monitoring"` so browser events route through a same-origin proxy. This bypasses ad-blockers that commonly block `*.ingest.sentry.io`. The route is created automatically by the Sentry build plugin; no manual route handler is needed.

## Error boundary interaction

Next.js has two boundary layers:

- `src/app/error.tsx` catches errors in any route under the root layout. It retains the app shell (nav + sidebar) so the user can navigate away, and offers a retry button (`reset()`). Sentry capture happens on mount.
- `src/app/global-error.tsx` is the **last-resort** boundary. It renders only when the root layout itself throws — the app shell is unavailable in that case. It renders a bare HTML document.

Add a nested `error.tsx` inside a route segment when that segment does its own data fetching and you want scoped recovery (the parent's shell stays, only the failing subtree re-renders).

## Sampling

- Traces: 100 % in dev, 10 % in production.
- Session Replay: 10 % of sessions, 100 % of sessions that hit an error.
- `sendDefaultPii: true` — Tally is single-tenant, the "P" in PII is the operator themselves.

Tune these in the three `sentry.*.config.ts` files if they ever need to change per deploy.

## Source map upload

`SENTRY_AUTH_TOKEN` presence gates source-map upload (see `next.config.ts`). CI and local builds without the token simply skip it — no plugin error. Self-hosters who don't want to configure a Sentry project at all can leave every var blank and `pnpm build` works unchanged.

### Docker build (Railway / VPS)

Three classes of Sentry env need to reach `pnpm build` in the `build` stage of `Dockerfile`:

| Var                      | Why it's needed at **build time**                                                   | How to pass         |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | Inlined into the client JS bundle by Next.js — must be literal in the build output. | `--build-arg`       |
| `SENTRY_ORG`             | Tells the upload plugin which Sentry org to target.                                 | `--build-arg`       |
| `SENTRY_PROJECT`         | Tells the upload plugin which Sentry project to target.                             | `--build-arg`       |
| `SENTRY_AUTH_TOKEN`      | Authorises the source-map upload. Secret — must not be baked into the image.        | BuildKit `--secret` |

Example build with source map upload:

```bash
DOCKER_BUILDKIT=1 docker build \
  --build-arg NEXT_PUBLIC_SENTRY_DSN="$NEXT_PUBLIC_SENTRY_DSN" \
  --build-arg SENTRY_ORG=irmin-dw \
  --build-arg SENTRY_PROJECT=tally-books \
  --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
  -t tally:latest .
```

Example build **without** Sentry (plain self-host):

```bash
docker build -t tally:latest .
```

With every arg absent, `NEXT_PUBLIC_SENTRY_DSN` defaults to `""` → the client SDK initialises with `enabled: false`, and `next.config.ts` skips the source-map upload plugin because `SENTRY_AUTH_TOKEN` is unset. No errors, no Sentry traffic.

### Runtime env

`SENTRY_DSN` (server-side) is needed at **runtime** only, not build time — set it in the container's runtime environment (Railway dashboard, docker-compose env, systemd unit).

The server is safe to start with `SENTRY_DSN` unset: the runtime guard in `src/sentry.server.config.ts` disables the transport the same way the client does.

### Sentry project metadata

For reference, the Tally project on Sentry:

- **Org slug**: `irmin-dw`
- **Project slug**: `tally-books`
- **Project ID**: `4511241689235536`
- **DSN**: set in your deploy env (see `PROJECT_BRIEF.md` deployment notes — do not commit it).
- **OTLP ingest** (future telemetry): `https://o4508020488536064.ingest.de.sentry.io/api/4511241689235536/integration/otlp`

The OTLP endpoint is not wired today — it's here so that when we add OpenTelemetry instrumentation (post-v1) we have the reference in one place.

### What ends up in the image

With source maps enabled, the Sentry webpack plugin generates `.map` files during the Next.js build, uploads them to Sentry, and by default leaves the maps in the standalone output. Runtime users never fetch the maps (Next.js doesn't serve them publicly unless explicitly requested) — they just enable Sentry to symbolicate stack traces. If you want to strip them from the image to shave MB, add a `find .next -name "*.map" -delete` step after `pnpm build` in the Dockerfile.
