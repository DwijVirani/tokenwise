import { apiErrorSchema } from "@tokenwise/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { startTestDb, testEnv, toCookieHeader, WEB_ORIGIN } from "./helpers";

let testDb: Awaited<ReturnType<typeof startTestDb>>;
let app: FastifyInstance;

beforeAll(async () => {
  testDb = await startTestDb();
  app = await buildApp(testEnv(testDb.url), testDb.db);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await testDb?.stop();
});

async function signUp(email: string) {
  return app.inject({
    method: "POST",
    url: "/auth/sign-up/email",
    headers: { origin: WEB_ORIGIN },
    payload: { name: "Test User", email, password: "correct-horse-battery" },
  });
}

describe("auth", () => {
  it("rejects /me without a session using the shared error shape", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the signed-in user from /me after sign up", async () => {
    const email = `a-${crypto.randomUUID()}@example.com`;
    const signup = await signUp(email);
    expect(signup.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: "/me",
      headers: { cookie: toCookieHeader(signup.headers["set-cookie"]) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email, name: "Test User" });
  });

  it("sets an HttpOnly SameSite=Lax session cookie", async () => {
    const signup = await signUp(`b-${crypto.randomUUID()}@example.com`);
    const raw = [signup.headers["set-cookie"]].flat().join("\n");
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it("rejects sign in with a wrong password", async () => {
    const email = `c-${crypto.randomUUID()}@example.com`;
    await signUp(email);
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in/email",
      headers: { origin: WEB_ORIGIN },
      payload: { email, password: "wrong-password-123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("stops accepting the session after sign out", async () => {
    const signup = await signUp(`d-${crypto.randomUUID()}@example.com`);
    const cookie = toCookieHeader(signup.headers["set-cookie"]);
    const out = await app.inject({
      method: "POST",
      url: "/auth/sign-out",
      headers: { origin: WEB_ORIGIN, cookie },
      payload: {},
    });
    expect(out.statusCode).toBe(200);
    const res = await app.inject({ method: "GET", url: "/me", headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });

  it("never grants CORS access to an origin other than the web origin", async () => {
    const ok = await app.inject({ method: "GET", url: "/health", headers: { origin: WEB_ORIGIN } });
    expect(ok.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const bad = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://evil.example" },
    });
    expect(bad.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(bad.headers["access-control-allow-origin"]).not.toBe("http://evil.example");
  });
});
