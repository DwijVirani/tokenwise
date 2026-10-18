import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import type { Db } from "@tokenwise/db";
import { apiError, ERROR_HTTP_STATUS } from "@tokenwise/shared";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createAuth } from "./lib/auth";
import type { Env } from "./lib/env";
import { createLogger } from "./lib/logger";
import { createRequireUser } from "./lib/require-user";
import { authRoutes } from "./routes/auth";
import { conversationRoutes } from "./routes/conversations";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { createConversationsService } from "./services/conversations";

export async function buildApp(env: Env, db: Db): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: createLogger(env.LOG_LEVEL),
    genReqId: (req) => {
      const header = req.headers["x-request-id"];
      return typeof header === "string" && header.length <= 128 ? header : randomUUID();
    },
  });

  app.decorateRequest("user", null);
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(ERROR_HTTP_STATUS.VALIDATION_ERROR)
        .send(apiError("VALIDATION_ERROR", "Invalid request.", { details: error.issues }));
    }
    if (error.validation) {
      return reply
        .code(ERROR_HTTP_STATUS.VALIDATION_ERROR)
        .send(apiError("VALIDATION_ERROR", "Invalid request.", { details: error.validation }));
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.code(ERROR_HTTP_STATUS.INTERNAL).send(apiError("INTERNAL", "Something went wrong."));
  });

  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });

  const auth = createAuth(env, db);
  const requireUser = createRequireUser(auth);

  await app.register(healthRoutes);
  await app.register(authRoutes(auth));
  await app.register(meRoutes(requireUser));
  await app.register(conversationRoutes(requireUser, createConversationsService(db)));

  return app;
}
