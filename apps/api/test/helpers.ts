import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDb } from "@tokenwise/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Env } from "../src/lib/env";

const migrationsFolder = fileURLToPath(
  new URL("../../../packages/db/migrations", import.meta.url),
);

export const WEB_ORIGIN = "http://localhost:3000";

export async function startTestDb() {
  let container: StartedPostgreSqlContainer | undefined;
  // TEST_DATABASE_URL lets environments without Docker point at a throwaway Postgres.
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer("postgres:16").start();
    url = container.getConnectionUri();
  }
  const { db, pool } = createDb(url);
  await migrate(db, { migrationsFolder });
  return {
    url,
    db,
    async stop() {
      await pool.end();
      await container?.stop();
    },
  };
}

export function testEnv(databaseUrl: string): Env {
  return {
    NODE_ENV: "test",
    PORT: 0,
    LOG_LEVEL: "silent",
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN,
    BETTER_AUTH_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
  };
}

// Turns Set-Cookie headers into a Cookie request header.
export function toCookieHeader(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(";")[0]).join("; ");
}
