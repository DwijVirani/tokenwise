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

async function signedInCookie() {
  const res = await app.inject({
    method: "POST",
    url: "/auth/sign-up/email",
    headers: { origin: WEB_ORIGIN },
    payload: {
      name: "Test User",
      email: `c-${crypto.randomUUID()}@example.com`,
      password: "correct-horse-battery",
    },
  });
  return toCookieHeader(res.headers["set-cookie"]);
}

describe("conversations", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: "/conversations" });
    expect(res.statusCode).toBe(401);
  });

  it("creates, renames, lists, and deletes a conversation", async () => {
    const cookie = await signedInCookie();
    const created = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: { cookie },
      payload: { title: "First" },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const renamed = await app.inject({
      method: "PATCH",
      url: `/conversations/${id}`,
      headers: { cookie },
      payload: { title: "Renamed" },
    });
    expect(renamed.json().title).toBe("Renamed");

    const list = await app.inject({ method: "GET", url: "/conversations", headers: { cookie } });
    expect(list.json().map((c: { id: string }) => c.id)).toEqual([id]);

    const del = await app.inject({ method: "DELETE", url: `/conversations/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/conversations", headers: { cookie } });
    expect(after.json()).toEqual([]);
  });

  it("hides another user's conversation as not found", async () => {
    const owner = await signedInCookie();
    const other = await signedInCookie();
    const { id } = (
      await app.inject({ method: "POST", url: "/conversations", headers: { cookie: owner }, payload: {} })
    ).json();

    const patch = await app.inject({
      method: "PATCH",
      url: `/conversations/${id}`,
      headers: { cookie: other },
      payload: { title: "Hijack" },
    });
    const del = await app.inject({ method: "DELETE", url: `/conversations/${id}`, headers: { cookie: other } });
    const list = await app.inject({ method: "GET", url: "/conversations", headers: { cookie: other } });

    expect(patch.statusCode).toBe(404);
    expect(del.statusCode).toBe(404);
    expect(list.json()).toEqual([]);
  });

  it("lists messages for the owner only", async () => {
    const owner = await signedInCookie();
    const other = await signedInCookie();
    const { id } = (
      await app.inject({ method: "POST", url: "/conversations", headers: { cookie: owner }, payload: {} })
    ).json();

    const mine = await app.inject({ method: "GET", url: `/conversations/${id}/messages`, headers: { cookie: owner } });
    const theirs = await app.inject({ method: "GET", url: `/conversations/${id}/messages`, headers: { cookie: other } });

    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual([]);
    expect(theirs.statusCode).toBe(404);
  });

  it("rejects an empty title", async () => {
    const cookie = await signedInCookie();
    const { id } = (
      await app.inject({ method: "POST", url: "/conversations", headers: { cookie }, payload: {} })
    ).json();
    const res = await app.inject({
      method: "PATCH",
      url: `/conversations/${id}`,
      headers: { cookie },
      payload: { title: "  " },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("cors", () => {
  it("allows PATCH and DELETE from the web origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/conversations/x",
      headers: { origin: WEB_ORIGIN, "access-control-request-method": "DELETE" },
    });
    expect(res.headers["access-control-allow-methods"]).toMatch(/PATCH.*DELETE|DELETE.*PATCH/);
  });
});
