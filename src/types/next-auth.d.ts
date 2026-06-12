/**
 * Module augmentation for next-auth.
 *
 * The JWT callback in src/lib/auth.ts stows the Google OAuth access token
 * (plus refresh bookkeeping) on the token, and the session callback copies
 * it onto the session. The stock types don't know about these fields, which
 * is why every consumer had a `//@ts-ignore` above `session.accessToken`.
 * With this file present those casts are unnecessary — and, critically,
 * `session.error === "RefreshAccessTokenError"` becomes a visible, typed
 * branch instead of an invisible one.
 */
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
    user?: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    error?: "RefreshAccessTokenError";
    user?: DefaultSession["user"];
  }
}
