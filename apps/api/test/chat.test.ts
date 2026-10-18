import { messages } from "@tokenwise/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createMockModel } from "../src/lib/ai";
import { startTestDb, testEnv, toCookieHeader, WEB_ORIGIN } from "./helpers";

let testDb: Awaited<ReturnType<typeof startTestDb>>;
const apps: Record<"ok" | "slow" | "fail", { app: FastifyInstance; base: string }> = {} as never;
let app: FastifyInstance;
let base: string;

// One app per mock behavior; they share the database.
const models = {
  ok: createMockModel(),
  slow: createMockModel({ chunks: ["a", "b", "c", "d", "e"], chunkDelayMs: 100 }),
  fail: createMockModel({ chunks: ["par", "tial", "x"], failAfterChunks: 2 }),
};

function use(mode: keyof typeof models) {
  ({ app, base } = apps[mode]);
}

beforeAll(async () => {
  testDb = await startTestDb();
  for (const mode of Object.keys(models) as (keyof typeof models)[]) {
    const a = await buildApp(testEnv(testDb.url), testDb.db, { model: models[mode] });
    apps[mode] = { app: a, base: await a.listen({ port: 0, host: "127.0.0.1" }) };
  }
  use("ok");
}, 120_000);

afterAll(async () => {
  await Promise.all(Object.values(apps).map((a) => a.app.close()));
  await testDb?.stop();
});

async function signedInCookie() {
  const res = await app.inject({
    method: "POST",
    url: "/auth/sign-up/email",
    headers: { origin: WEB_ORIGIN },
    payload: {
      name: "Test User",
      email: `chat-${crypto.randomUUID()}@example.com`,
      password: "correct-horse-battery",
    },
  });
  return toCookieHeader(res.headers["set-cookie"]);
}

async function newConversation(cookie: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/conversations",
    headers: { cookie },
    payload: {},
  });
  return res.json().id;
}

const rows = (conversationId: string) =>
  testDb.db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

const post = (cookie: string, payload: unknown, signal?: AbortSignal) =>
  fetch(`${base}/chat`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

describe("POST /chat", () => {
  it("streams deltas and persists the completed reply", async () => {
    use("ok");
    const cookie = await signedInCookie();
    const conversationId = await newConversation(cookie);

    const res = await post(cookie, { conversationId, message: "hi" });
    const text = await res.text();

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(text).toContain('"type":"delta"');
    expect(text).toContain('"status":"complete"');
    const saved = await rows(conversationId);
    expect(saved.map((m) => [m.role, m.status, m.content])).toEqual([
      ["user", "complete", "hi"],
      ["assistant", "complete", "Hello, world!"],
    ]);
  });

  it("saves partial output as stopped when the client disconnects mid-stream", async () => {
    use("slow");
    const cookie = await signedInCookie();
    const conversationId = await newConversation(cookie);

    const ctrl = new AbortController();
    const res = await post(cookie, { conversationId, message: "go" }, ctrl.signal);
    const reader = res.body!.getReader();
    await reader.read(); // first chunk arrived
    ctrl.abort();

    await expect
      .poll(async () => (await rows(conversationId)).at(-1)?.status, { timeout: 5000 })
      .toBe("stopped");
    const assistant = (await rows(conversationId)).at(-1)!;
    expect(assistant.content.length).toBeLessThan("abcde".length);
  });

  it("saves partial output with error status when the provider fails mid-stream", async () => {
    use("fail");
    const cookie = await signedInCookie();
    const conversationId = await newConversation(cookie);

    const text = await (await post(cookie, { conversationId, message: "go" })).text();

    expect(text).toContain('"status":"error"');
    const assistant = (await rows(conversationId)).at(-1)!;
    expect([assistant.status, assistant.content]).toEqual(["error", "partial"]);
  });

  it("returns not found for another user's conversation and writes nothing", async () => {
    use("ok");
    const owner = await signedInCookie();
    const other = await signedInCookie();
    const conversationId = await newConversation(owner);

    const res = await post(other, { conversationId, message: "hi" });

    expect(res.status).toBe(404);
    expect(await rows(conversationId)).toEqual([]);
  });

  it("rejects an oversized message", async () => {
    const cookie = await signedInCookie();
    const conversationId = await newConversation(cookie);
    const res = await post(cookie, { conversationId, message: "x".repeat(8001) });
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await post("", { conversationId: crypto.randomUUID(), message: "hi" });
    expect(res.status).toBe(401);
  });
});
