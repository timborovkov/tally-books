"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

// Intentionally no baseURL — the browser uses the same origin as the app,
// which is where /api/auth/* is mounted.
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});

export const { signIn } = authClient;
export const twoFactor = authClient.twoFactor;
