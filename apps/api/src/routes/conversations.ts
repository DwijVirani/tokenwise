import { apiError, ERROR_HTTP_STATUS } from "@tokenwise/shared";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import type { createConversationsService } from "../services/conversations";

const createBody = z.object({ title: z.string().trim().min(1).max(200).optional() });
const renameBody = z.object({ title: z.string().trim().min(1).max(200) });
const idParams = z.object({ id: z.uuid() });

const notFound = () => apiError("NOT_FOUND", "Conversation not found.");

export function conversationRoutes(
  requireUser: preHandlerAsyncHookHandler,
  service: ReturnType<typeof createConversationsService>,
) {
  return async (app: FastifyInstance) => {
    const opts = { preHandler: requireUser };

    app.get("/conversations", opts, async (request) => service.list(request.user!.id));

    app.post("/conversations", opts, async (request, reply) => {
      const body = createBody.parse(request.body ?? {});
      return reply.code(201).send(await service.create(request.user!.id, body.title));
    });

    app.patch("/conversations/:id", opts, async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { title } = renameBody.parse(request.body);
      const row = await service.rename(request.user!.id, id, title);
      return row ?? reply.code(ERROR_HTTP_STATUS.NOT_FOUND).send(notFound());
    });

    app.delete("/conversations/:id", opts, async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const ok = await service.remove(request.user!.id, id);
      return ok ? reply.code(204).send() : reply.code(ERROR_HTTP_STATUS.NOT_FOUND).send(notFound());
    });
  };
}
