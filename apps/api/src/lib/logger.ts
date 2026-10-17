import type { FastifyBaseLogger } from "fastify";
import { pino } from "pino";

// Typed as FastifyBaseLogger so the app keeps Fastify's default logger type.
export function createLogger(level: string): FastifyBaseLogger {
  return pino({
    level,
    // Never log credentials (AGENTS.md: no secrets in logs).
    redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
  });
}
