# Sentry (error reporting)

Tally integrates Sentry via `@sentry/nextjs` for browser + Node server + edge runtimes, plus `@sentry/profiling-node` for server profiling. Error reports flow to the Tally project in the `irmin-dw` Sentry org (de-region). The integration is **off by default** and enabled per-deployment via env vars.

## How it's wired

| File                                  | Runtime | Role                                                                |
| ------------------------------------- | ------- | ------------------------------------------------------------------- |
| `src/instrumentation-client.ts`       | browser | Client init + router transition instrumentation + session replay    |
| `src/sentry.server.config.ts`         | node    | Server init + node profiling                                        |
| `src/sentry.edge.config.ts`           | edge    | Edge runtime init                                                   |
| `src/instrumentation.ts`              | both    | Loads the right config per `NEXT_RUNTIME`; exports `onRequestError` |
| `src/lib/env.ts`                      | server  | Zod validation of server-only Sentry vars                           |
| `src/lib/env.client.ts`               | any     | Zod validation of `NEXT_PUBLIC_SENTRY_*` vars                       |
| `src/app/global-error.tsx`            | browser | Last-resort boundary; captures unhandled root-layout errors         |
| `src/app/error.tsx`                   | browser | Route-level boundary; captures + shows retry UI                     |
| `next.config.ts` (`withSentryConfig`) | build   | Tunnel route, source-map upload (prod), silent in local             |

## Master toggle

`NEXT_PUBLIC_SENTRY_ENABLED` is the single knob that arms the SDK. Set it to `"true"` to enable reporting; anything else (including unset) leaves the SDK inert regardless of DSN. Defaults to `false` in `.env.example` so local dev never ships to the issue tracker.

Both the toggle AND a non-empty DSN must be present for events to flow. The toggle alone has no effect (the SDK would have nowhere to send); the DSN alone has no effect (the toggle gate wins). This gives operators a clean "flip one var to test end-to-end" workflow without editing multiple keys.

## Env vars

### Runtime (read by the Sentry SDK)

| Var                                              | Scope         | Default    | Purpose                                          |
| ------------------------------------------------ | ------------- | ---------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_ENABLED`                     | client+server | `false`    | Master toggle; must be `"true"` to arm the SDK.  |
| `NEXT_PUBLIC_SENTRY_DSN`                         | all three     | empty      | Single DSN for client + server + edge.           |
| `SENTRY_ENVIRONMENT`                             | server + edge | `NODE_ENV` | Deploy tag (dev / staging / production).         |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`          | client        | `0.15`     | Browser tracing.                                 |
| `NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` | client        | `0.1`      | Session replay.                                  |
| `NEXT_PUBLIC_SENTRY_REPLAYS_ERROR_SAMPLE_RATE`   | client        | `1.0`      | Replay on error.                                 |
| `SENTRY_TRACES_SAMPLE_RATE`                      | server + edge | `0.1`      | Server/edge tracing.                             |
| `SENTRY_PROFILES_SAMPLE_RATE`                    | server        | `0.1`      | Node profiling (relative to traces sample rate). |

The DSN has a single source of truth: `NEXT_PUBLIC_SENTRY_DSN`. It's not a secret — it's embedded in every browser bundle — so there's no value in duplicating it as a server-only var. The server and edge configs import it via `src/lib/env.client.ts` so they read the same value the browser does.

### Build-time (source-map upload)

| Var                 | Default              | Purpose                                                              |
| ------------------- | -------------------- | -------------------------------------------------------------------- |
| `SENTRY_ORG`        | empty                | Org slug.                                                            |
| `SENTRY_PROJECT`    | empty                | Project slug.                                                        |
| `SENTRY_AUTH_TOKEN` | empty                | **Gates the entire upload step.** Blank → no upload, build succeeds. |
| `SENTRY_URL`        | `https://sentry.io/` | Override for self-hosted / EU / private-cloud Sentry.                |

Upload runs only when `SENTRY_AUTH_TOKEN` is set. Local builds and CI without the token simply skip it — no plugin error, no upload.

### Misc

| Var                                 | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `SENTRY_SUPPRESS_TURBOPACK_WARNING` | Set to `"1"` to silence the `@sentry/nextjs` Turbopack-not-yet-supported warning. |

All vars are validated by zod at boot (see `src/lib/env.ts` and `src/lib/env.client.ts`). Out-of-range sampling rates, malformed DSN URLs, or bad `SENTRY_URL` values fail fast instead of silently breaking.

## Tunnel route

`withSentryConfig` is set to `tunnelRoute: "/monitoring"` so browser events route through a same-origin proxy. This bypasses ad-blockers that commonly block `*.ingest.sentry.io`. The route is created automatically by the Sentry build plugin; no manual route handler is needed.

## Error boundary interaction

Next.js has two boundary layers:

- `src/app/error.tsx` catches errors in any route under the root layout. It retains the app shell (nav + sidebar) so the user can navigate away, and offers a retry button (`reset()`). Sentry capture happens on mount.
- `src/app/global-error.tsx` is the **last-resort** boundary. It renders only when the root layout itself throws — the app shell is unavailable in that case. It renders a bare HTML document.

Add a nested `error.tsx` inside a route segment when that segment does its own data fetching and you want scoped recovery (the parent's shell stays, only the failing subtree re-renders).

## Testing Sentry locally

With the defaults in `.env.example`, the SDK initialises with `enabled: false` and no events leave the process. This is verified by `src/__tests__/sentry-disabled.test.ts`.

To test real reporting:

1. Set `NEXT_PUBLIC_SENTRY_ENABLED=true` in `.env`.
2. Set `NEXT_PUBLIC_SENTRY_DSN` to a real DSN (the Tally project DSN or a throwaway you own).
3. Restart `pnpm dev`.
4. Trigger an error — confirm it lands in Sentry with the expected `environment` tag.

## Docker build (Railway / VPS)

Three classes of Sentry env need to reach `pnpm build` in the `build` stage of `Dockerfile`:

| Class                 | Vars                                                                                       | Why at build time                                            | How to pass         |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------- |
| Client runtime config | `NEXT_PUBLIC_SENTRY_ENABLED`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_*_SAMPLE_RATE` | Inlined into the client bundle — must be literal at build.   | `--build-arg`       |
| Upload plugin config  | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`, `SENTRY_ENVIRONMENT`                         | Read by the Sentry webpack plugin during `next build`.       | `--build-arg`       |
| Secret                | `SENTRY_AUTH_TOKEN`                                                                        | Authorises source-map upload — must not be baked into image. | BuildKit `--secret` |

Example build with source-map upload:

```bash
DOCKER_BUILDKIT=1 docker build \
  --build-arg NEXT_PUBLIC_SENTRY_ENABLED=true \
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

With every arg absent, `NEXT_PUBLIC_SENTRY_ENABLED` defaults to `false` → the client SDK initialises with `enabled: false`, and `next.config.ts` skips the source-map upload plugin because `SENTRY_AUTH_TOKEN` is unset. No errors, no Sentry traffic.

### Runtime env

Server-only vars (`SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`) are needed at **runtime** only — set them in the container's runtime environment (Railway dashboard, docker-compose env, systemd unit). The server is safe to start with these unset: defaults come from zod.

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
