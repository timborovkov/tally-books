# UI conventions

Shared conventions every route and component is expected to follow. If you're adding a feature that breaks a rule here, either update this file in the same PR or don't break it.

## App shell

Routes that require the authenticated product surface live under the `(app)` route group — `src/app/(app)/…`. The `(app)/layout.tsx` wraps children in `<AppShell>` (top nav + sidebar + main region).

Put routes that should render without the shell (a future `/login`, a public landing page, health check pages) outside the group. The root `src/app/layout.tsx` intentionally renders nothing but `<html>` and `<body>` — keep it that way so `global-error.tsx` can take over when the shell itself throws.

## Loading states

Every async surface gets a loading state. Two options:

1. **Route-level** — add a `loading.tsx` next to the route's `page.tsx`. Next.js streams it in automatically while the page's server component is pending.
2. **Component-level** — import `Skeleton` from `@/components/ui/skeleton` and compose it inside a `<Suspense fallback={…}>` around the async child.

The dashboard example: `src/app/(app)/loading.tsx` renders `<DashboardSkeleton/>` (from `@/components/dashboard/dashboard-skeleton`), which mirrors the real page layout so the transition doesn't visibly jump.

Guidelines:

- Keep skeletons geometrically close to the final layout — same number of cards, same grid. That's the only way the UX actually smooths out.
- `Skeleton` is `role="status"` with `aria-busy="true"`; screen readers announce the loading state. Don't wrap it in another `role="status"` container.
- Never render a spinner _in place of_ a skeleton unless the surface genuinely has no shape until data lands (e.g. a rare banner).

## Error boundaries

Three layers, from innermost to outermost:

1. **Segment `error.tsx`** — add one next to any `page.tsx` whose segment owns significant data fetching, so the parent layout keeps rendering while the segment recovers. Example: `src/app/(app)/error.tsx` catches everything under the app shell and keeps the nav mounted.
2. **Root `error.tsx`** — none currently; the `(app)` group-level boundary is sufficient for the v0.1 route tree.
3. **`global-error.tsx`** — last-resort; fires when the root layout itself throws. It renders a bare HTML document because the shell isn't available. Keep it minimal.

All three call `Sentry.captureException(error)` on mount. Use `ErrorFallback` (`@/components/error-fallback`) for the UI — it already wires the retry button, alert role, and digest display.

Rules:

- Always pass `reset` through from the boundary's `{ reset }` prop to `ErrorFallback.onRetry`.
- Don't swallow the error. If you need to log context beyond what Sentry auto-captures, call `Sentry.captureException(error, { extra: … })` in the `useEffect`.

## Forms and inputs

Use `Input` from `@/components/ui/input` for single-line inputs. Style overrides via `className`; they merge through `cn()` without clobbering defaults.

## Dialogs

Use the primitives from `@/components/ui/dialog`. Always pass an `aria-label` on the trigger button. The reusable example is `QuickAddButton` + `QuickAddDialog` — open the dialog via controlled `open`/`onOpenChange` from the caller.

## Search

There is one canonical global search field — the `TopNav` input (`<TopNav/>`). Feature-specific list filters live inside the list page itself. Don't add a second always-present search bar.

## Sidebar

Add a sidebar entry by extending the `NAV` array in `src/components/layout/sidebar.tsx`. Use a `lucide-react` icon, keep labels to one word when possible.

## Icons

Lucide (`lucide-react`). Size via `className="h-4 w-4"` (or `h-5 w-5` inside cards). Always pass `aria-hidden="true"` when the icon is decorative alongside visible text; drop that prop when the icon _is_ the label (e.g. icon-only buttons — also add an `aria-label`).
