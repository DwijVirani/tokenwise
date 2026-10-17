import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";

export function meRoutes(requireUser: preHandlerAsyncHookHandler) {
  return async (app: FastifyInstance) => {
    app.get("/me", { preHandler: requireUser }, async (request) => {
      const { id, email, name } = request.user!;
      return { id, email, name };
    });
  };
}
