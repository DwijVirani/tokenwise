import { schema, type Db } from "@tokenwise/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Env } from "./env";

export function createAuth(env: Env, db: Db) {
  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {};

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: { enabled: true },
    socialProviders: github,
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      crossSubDomainCookies: env.COOKIE_DOMAIN
        ? { enabled: true, domain: env.COOKIE_DOMAIN }
        : { enabled: false },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
