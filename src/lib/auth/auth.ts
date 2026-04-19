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
  // Rate limiting against the DoS tail (attacker pre-creating an invited
  // email) is a v1.0 security-review item — see TODO.md.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const email =
        typeof ctx.body === "object" &&
        ctx.body !== null &&
        typeof (ctx.body as { email?: unknown }).email === "string"
          ? (ctx.body as { email: string }).email.toLowerCase()
          : null;
      if (!email) throw new APIError("BAD_REQUEST", { message: "Email is required." });

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
