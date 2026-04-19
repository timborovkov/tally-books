import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";

import { getDb } from "@/db/client";

const db = getDb();
import { newId } from "@/db/id";
import { env } from "@/lib/env";
import { anyAdminUserExists } from "@/lib/iam/bootstrap";
import { hasUsableInviteForEmail } from "@/lib/iam/invites";

import { PASSWORD_REASON_MESSAGES, validatePassword } from "./password-policy";

// BetterAuth is the owner of auth state. We map its expected schema
// onto the existing Drizzle tables (users, sessions) via `usePlural: true`;
// the extra BetterAuth-owned tables (accounts, verifications, two_factors)
// were added in migration 0001.
//
// Auth policy in v0.1:
//   - Email + password only. No SSO, ever.
//   - 2FA (TOTP) mandatory via the twoFactor plugin.
//   - Password policy is enforced in our server actions (setup wizard,
//     accept-invite) before calling into BetterAuth; `minPasswordLength`
//     is a floor.
//   - Public sign-up is wired for v0.1 because bootstrap uses it; v1.0
//     hardening swaps in the admin.createUser path (see TODO.md §v1.0
//     "Security review").
export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  advanced: {
    database: {
      generateId: () => newId(),
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  // `/sign-up/email` is only legitimately needed for two flows:
  //   1. Bootstrap — no admin exists yet; the setup wizard creates one.
  //   2. Invite accept — acceptInviteAction calls signUpEmail with the
  //      invited email AFTER validating the token; at that point a usable
  //      invite row for that email must exist.
  // Anything outside those gates is arbitrary signup and we reject it.
  //
  // Password policy is ALSO enforced here so the BetterAuth HTTP endpoint
  // itself rejects weak passwords. The server actions
  // (createBootstrapAdminAction, acceptInviteAction) already call
  // validatePassword up-front, but a direct POST to /api/auth/sign-up/email
  // would otherwise bypass every rule except BetterAuth's own
  // minPasswordLength. Checking in the hook closes the loophole without
  // duplicating the policy.
  //
  // Rate limiting against the DoS tail (attacker pre-creating an invited
  // email) is a v1.0 security-review item — see TODO.md.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const body =
        typeof ctx.body === "object" && ctx.body !== null
          ? (ctx.body as { email?: unknown; password?: unknown })
          : null;
      const email = typeof body?.email === "string" ? body.email.toLowerCase() : null;
      if (!email) throw new APIError("BAD_REQUEST", { message: "Email is required." });
      // Normalize ctx.body.email to the lowered form so BetterAuth's
      // handler persists the canonical value. Without this, a POST of
      // `INVITED@example.test` would pass the invite check below (we
      // lowercase the local copy) but BetterAuth would store the
      // mixed-case email on the users row. That row no longer matches
      // `invites.email` (which is stored lowercased by createInvite),
      // so finalizeInviteAcceptance's hasUsableInviteForEmail check
      // would miss, orphaning the new user from the invite flow.
      // createBootstrapAdminAction does the same normalization before
      // calling signUpEmail; this hook is the HTTP-boundary equivalent.
      if (body) body.email = email;

      // Enforce the full complexity + common-password policy at the HTTP
      // boundary. BetterAuth's emailAndPassword.minPasswordLength is a
      // length-only floor; our rules add upper/lower/digit/symbol and a
      // top-100 breached-password deny list.
      const password = typeof body?.password === "string" ? body.password : null;
      if (!password) throw new APIError("BAD_REQUEST", { message: "Password is required." });
      const pw = validatePassword(password);
      if (!pw.ok) {
        throw new APIError("BAD_REQUEST", { message: PASSWORD_REASON_MESSAGES[pw.reason] });
      }

      // Use `anyAdminUserExists` (not `adminExists`). The stricter check
      // flips true the moment the first admin row is inserted, even if
      // they haven't completed 2FA yet. Without this, a second /setup
      // visitor could slip through this gate by signing up as "bootstrap"
      // before the first admin finishes enrollment.
      if (!(await anyAdminUserExists())) return; // bootstrap flow
      if (await hasUsableInviteForEmail(email)) return; // invite-accept flow

      throw new APIError("FORBIDDEN", {
        message:
          "Public sign-up is disabled. This instance is invite-only — ask an admin to invite you.",
      });
    }),
  },
  user: {
    additionalFields: {
      // Our spec-defined columns on users. Declared here so BetterAuth
      // writes/reads them alongside its own fields.
      twoFactorEnabledAt: { type: "date", required: false, input: false },
      bootstrapCompletedAt: { type: "date", required: false, input: false },
      removedAt: { type: "date", required: false, input: false },
    },
  },
  plugins: [
    twoFactor({
      issuer: "Tally",
    }),
    admin({
      defaultRole: "member",
      adminRoles: ["admin"],
    }),
    // nextCookies must be last — it sets the cookie on Next.js server
    // actions after the handler has run.
    nextCookies(),
  ],
});
