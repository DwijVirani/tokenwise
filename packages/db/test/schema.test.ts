import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, stripeEvents, usageLedger, users } from "../src";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

let container: StartedPostgreSqlContainer | undefined;
let handle: ReturnType<typeof createDb>;

beforeAll(async () => {
  // TEST_DATABASE_URL lets environments without Docker point at a throwaway Postgres.
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer("postgres:16").start();
    url = container.getConnectionUri();
  }
  handle = createDb(url);
  await migrate(handle.db, { migrationsFolder });
}, 120_000);

afterAll(async () => {
  await handle?.pool.end();
  await container?.stop();
});

async function insertLedgerRow() {
  const userId = `user_${crypto.randomUUID()}`;
  await handle.db.insert(users).values({ id: userId, name: "Test", email: `${userId}@example.com` });
  const [row] = await handle.db
    .insert(usageLedger)
    .values({
      userId,
      model: "mock-model",
      inputTokens: 10,
      outputTokens: 20,
      costMicros: 1234,
      status: "complete",
    })
    .returning();
  if (!row) throw new Error("ledger insert returned no row");
  return row;
}

describe("schema", () => {
  it("rejects updating a usage_ledger row", async () => {
    const row = await insertLedgerRow();
    await expect(
      handle.pool.query("UPDATE usage_ledger SET output_tokens = 0 WHERE id = $1", [row.id]),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects deleting a usage_ledger row", async () => {
    const row = await insertLedgerRow();
    await expect(
      handle.pool.query("DELETE FROM usage_ledger WHERE id = $1", [row.id]),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects truncating usage_ledger", async () => {
    await expect(handle.pool.query("TRUNCATE usage_ledger")).rejects.toThrow(/append-only/);
  });

  it("rejects a duplicate stripe event id", async () => {
    const id = `evt_${crypto.randomUUID()}`;
    await handle.db.insert(stripeEvents).values({ id, type: "checkout.session.completed" });
    await expect(
      handle.db.insert(stripeEvents).values({ id, type: "checkout.session.completed" }),
    ).rejects.toThrow();
  });
});
