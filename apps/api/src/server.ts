import { createDb } from "@tokenwise/db";
import { buildApp } from "./app";
import { loadEnv } from "./lib/env";

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);
const app = await buildApp(env, db);

// Graceful shutdown: stop accepting requests, let in-flight ones finish, close the pool.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => pool.end());
  });
}

await app.listen({ port: env.PORT, host: "0.0.0.0" });
